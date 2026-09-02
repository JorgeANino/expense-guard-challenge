// HTTP channel: POST /eve/v1/review runs one structured review turn and returns the
// decision. Per-request context flows body -> channel state -> metadata(state) ->
// instructions resolver (ctx.channel.metadata). The body is validated here, at the trust
// boundary; a request that is not a well-formed submission for a provisioned company is
// rejected with 400 and never falls back to a fixture.
//
// Do NOT name this file eve.ts. Eve registers a framework-default channel named "eve" that
// serves the /eve/v1/session* routes used by `eve dev` and the eval runner's t.send(), and
// it drops that default whenever an authored channel has the same name -- the name being
// the file basename (eve 0.11.7: runtime/framework-channels + nitro/host/channel-routes).
// This file used to be eve.ts, which silently removed the session routes (404). The
// session channel now lives in ./eve.ts, restricted to loopback callers.
import { z } from "zod";
import { defineChannel, POST, type Session, type SendPayload } from "eve/channels";
import { localDev, placeholderAuth, routeAuth } from "eve/channels/auth";
import { postCheckDecision } from "../lib/decision-post-check.js";
import { ExpenseDecisionSchema } from "../lib/expense.schema.js";
import { getCompanyPolicy, hasCompanyPolicy } from "../lib/policy-store.js";
import { parseSubmissionBody, type tRequestView } from "../lib/request-context.js";

type tJsonOutputSchema = NonNullable<SendPayload["outputSchema"]>;

// eve expects a run-scoped JSON schema (not a Zod object) on the send payload.
function toJsonSchema(schema: z.ZodType): tJsonOutputSchema {
  const { $schema, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void $schema;
  return rest as tJsonOutputSchema;
}

type tStreamEvent = {
  type: string;
  data?: { result?: unknown; message?: string; code?: string };
};

// Drain the turn's event stream once, capturing the structured result / terminal failure.
async function drainDecision(session: Session): Promise<{ result: unknown; failure: string | null }> {
  const stream = await session.getEventStream();
  const reader = stream.getReader();
  let result: unknown;
  let failure: string | null = null;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const event = value as tStreamEvent;
      if (event.type === "result.completed") result = event.data?.result;
      if (event.type === "turn.completed") break;
      if (event.type === "turn.failed") {
        failure = `${event.data?.code ?? "unknown"} ${event.data?.message ?? ""}`.trim();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { result, failure };
}

const outputSchema = toJsonSchema(ExpenseDecisionSchema);

// Loopback callers (`eve dev`, the eval runner) are accepted as local-dev principals; every
// other caller is refused, and a production deployment (VERCEL_ENV=production) answers 401
// until a real authenticator replaces placeholderAuth(). Authenticating the caller is only
// half of tenant isolation: proving the caller may review body.company_id needs a
// principal -> company mapping that this repo has no identity provider for, so it is
// deliberately not implemented here.
const reviewAuth = [localDev(), placeholderAuth()];

function badRequest(error: string): Response {
  return Response.json({ ok: false, error }, { status: 400 });
}

function badGateway(error: string): Response {
  return Response.json({ ok: false, error }, { status: 502 });
}

export default defineChannel<tRequestView | undefined, { state: tRequestView | undefined }>({
  state: { request: null, contextProvided: false },
  context: (state) => ({ state }),
  metadata: (state) => ({
    request: state?.request ?? null,
    contextProvided: state?.contextProvided ?? false,
  }),
  routes: [
    POST("/eve/v1/review", async (request, { send }) => {
      const auth = await routeAuth(request, reviewAuth);
      if (auth instanceof Response) return auth;

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return badRequest("Invalid JSON body.");
      }

      const parsed = parseSubmissionBody(body);
      if (!parsed.ok) return badRequest(`Invalid expense submission:\n${parsed.error}`);
      const { submission } = parsed;
      if (!hasCompanyPolicy(submission.company_id)) {
        return badRequest(`No expense policy is configured for company "${submission.company_id}".`);
      }

      const view: tRequestView = { request: submission, contextProvided: true };
      const session = await send(
        { message: "Review the expense submission and return your decision.", outputSchema },
        { auth, continuationToken: `eve:${crypto.randomUUID()}`, state: view },
      );

      const { result, failure } = await drainDecision(session);
      if (failure) return badGateway(`turn failed: ${failure}`);

      const parsedDecision = ExpenseDecisionSchema.safeParse(result);
      if (!parsedDecision.success) return badGateway("Agent output did not match the decision schema.");

      // The model's decision is a recommendation about the submission. Code confirms it
      // describes this submission and cites a real rule; anything that does not check out
      // goes back as flag_for_review with the problems beside it.
      const checked = postCheckDecision(parsedDecision.data, submission, getCompanyPolicy(submission.company_id));
      return Response.json({ ok: true, data: checked.decision, problems: checked.problems }, { status: 200 });
    }),
  ],
});
