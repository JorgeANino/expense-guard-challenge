// Behavioral, per-fixture (fixtures/illegible.json via POST /eve/v1/review). A $1,280 Globex
// travel claim backed by a receipt whose fare and TOTAL are illegible and whose only legible
// line item is $45 must not be approved, even though $1,280 is under TRVL-01's $2,000 line.
//
// Would have caught: validate_expense reporting {valid: true} on this fixture (presence-only
// checks) and the agent approving on the strength of the amount alone.
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { validateSubmission } from "../../agent/lib/validate-submission.js";
import { loadFixture } from "../lib/fixtures.js";
import { reviewOverHttp } from "../lib/review-request.js";

export default defineEval({
  description:
    "An illegible receipt whose line items do not add up (illegible.json) is not approved.",
  tags: ["expense-guard", "decisions", "validation"],
  async test(t) {
    const submission = loadFixture("illegible.json");
    // The fixture really is one the deterministic checks fail; otherwise the gate below
    // would be asserting nothing about validation.
    t.check(validateSubmission(submission).valid, equals(false)).gate();

    const decision = await reviewOverHttp(t, submission);
    t.check(
      { decision: decision.decision, approved: decision.decision === "approve" },
      equals({ decision: decision.decision, approved: false }),
    ).gate();
  },
});
