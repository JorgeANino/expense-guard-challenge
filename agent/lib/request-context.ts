// Per-request context for a review: the expense submission plus a few trace-identity
// fields. The HTTP channel validates the POST body at the trust boundary and seeds it into
// channel state; the eval runner and the `eve dev` client, which never send a body, fall
// back to a fixture (override with POC_REQUEST_FILE) — outside production only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineState } from "eve/context";
import { z } from "zod";

export const ExpenseLineItemSchema = z.object({
  label: z.string(),
  amount: z.number(),
});

// Everything downstream (prompt, tools) assumes a value that passed this schema, so parse
// at the edge and never widen an unknown body into it with a cast.
export const ExpenseSubmissionSchema = z.object({
  company_id: z.string().min(1),
  category: z.string().min(1),
  claimed_amount: z.number(),
  currency: z.string().optional(),
  receipt: z.string(),
  line_items: z.array(ExpenseLineItemSchema).optional(),
  workspace_id: z.string().optional(),
  chat_id: z.string().optional(),
  label: z.string().optional(),
});

export type tExpenseLineItem = z.infer<typeof ExpenseLineItemSchema>;
export type tExpenseSubmission = z.infer<typeof ExpenseSubmissionSchema>;

// The per-session projection carried by channel state -> metadata(state). `contextProvided`
// tells "no HTTP submission, use fixture" apart from "a body was sent but did not survive
// the projection".
export type tRequestView = {
  request: tExpenseSubmission | null;
  contextProvided: boolean;
};

const FIXTURE_PATH = process.env.POC_REQUEST_FILE ?? join(process.cwd(), "fixtures", "request.json");

// The same predicate eve's placeholderAuth() uses to recognise a real deployment.
function isProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export function loadExpenseFixture(): tExpenseSubmission {
  return ExpenseSubmissionSchema.parse(JSON.parse(readFileSync(FIXTURE_PATH, "utf8")));
}

export type tSubmissionParseResult =
  | { ok: true; submission: tExpenseSubmission }
  | { ok: false; error: string };

// WRITE side — the channel parses the body here. Anything that is not a well-formed
// submission is rejected; a real request never falls back to the fixture.
export function parseSubmissionBody(body: unknown): tSubmissionParseResult {
  const parsed = ExpenseSubmissionSchema.safeParse(body);
  if (parsed.success) return { ok: true, submission: parsed.data };
  return { ok: false, error: z.prettifyError(parsed.error) };
}

// READ side — loud fallback: a body was provided but did not reach the resolver intact via
// the metadata projection -> throw. Silently rendering the fixture would review another
// company's submission. No submission at all (eval / dev client) -> fixture, and only
// outside production.
//
// A throw here does NOT fail the turn: eve runs dynamic-instruction resolvers under
// Promise.allSettled, logs "Dynamic instructions resolver (turn.started) threw — skipping."
// and carries on (eve 0.11.7 context/dynamic-instruction-lifecycle). What it guarantees is
// narrower: no submission gets seeded, so every tool call hits requireSubmission() and
// errors back to the model. On the review route the post-check is unaffected -- it checks
// the decision against the body's submission, which review.ts holds independently of this
// resolver. The session route (channels/eve.ts), where the production throw actually fires,
// has no post-check at all, but it is loopback-only and reviews nothing real. The guards
// that actually stop a bad review are the channel's 400 before any turn starts and
// requireSubmission() inside the tools; this throw only makes sure a fixture is never
// reviewed silently.
export function resolveExpenseSubmission(
  view: { request?: unknown; contextProvided?: unknown } | undefined,
): tExpenseSubmission {
  if (view?.contextProvided === true) {
    const parsed = ExpenseSubmissionSchema.safeParse(view.request);
    if (parsed.success) return parsed.data;
    throw new Error(
      "Per-request expense context was provided but did not reach the resolver intact via " +
        "channel metadata/state. Refusing to fall back to the fixture — that would review " +
        "another company's submission.",
    );
  }
  if (isProductionDeployment()) {
    throw new Error(
      "No expense submission was provided and the fixture fallback is disabled in " +
        "production. Submit through POST /eve/v1/review.",
    );
  }
  return loadExpenseFixture();
}

// The authoritative submission for this turn, seeded by the instructions resolver so
// tools can read the real fields instead of relying on model-provided arguments.
export const submissionState = defineState<tExpenseSubmission | null>(
  "expense-guard.submission",
  () => null,
);

// Tools scope everything (tenant included) on this, never on their own arguments: the
// receipt is attacker-controlled text rendered into the prompt, so a model argument can be
// steered by it.
export function requireSubmission(): tExpenseSubmission {
  const submission = submissionState.get();
  if (!submission) {
    throw new Error(
      "No expense submission is seeded for this turn; the instructions resolver must run first.",
    );
  }
  return submission;
}
