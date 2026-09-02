// Runs one review for an explicit submission through the production HTTP channel
// (POST /eve/v1/review) and returns the structured decision.
//
// Eve 0.11.7's t.send() has no way to attach channel state, so a t.send() review always
// reads the process-wide fixture (POC_REQUEST_FILE) — one fixture per `eve eval` run. Going
// through the channel lets each eval pick its own fixture in the same run and exercises the
// real trust boundary. The trade-off: the turn runs in a session the eval runner does not
// observe, so t.calledTool()-style assertions are not available on this path.
import type { EveEvalContext } from "eve/evals";
import { equals } from "eve/evals/expect";
import { ExpenseDecisionSchema, type tExpenseDecision } from "../../agent/lib/expense.schema.js";
import type { tExpenseSubmission } from "../../agent/lib/request-context.js";

export const REVIEW_PATH = "/eve/v1/review";

type tReviewResponse = { ok?: boolean; data?: unknown; error?: string };

export async function reviewOverHttp(
  t: EveEvalContext,
  submission: tExpenseSubmission,
): Promise<tExpenseDecision> {
  const response = await t.target.fetch(REVIEW_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(submission),
  });
  const payload = (await response.json()) as tReviewResponse;

  t.check(
    { status: response.status, ok: payload.ok, error: payload.error },
    equals({ status: 200, ok: true, error: undefined }),
  ).gate();

  const decision = ExpenseDecisionSchema.safeParse(payload.data);
  if (!decision.success) {
    throw new Error(`Review response carried no valid decision: ${JSON.stringify(payload)}`);
  }
  t.log(`decision for ${submission.company_id}/${submission.category}: ${JSON.stringify(decision.data)}`);
  return decision.data;
}
