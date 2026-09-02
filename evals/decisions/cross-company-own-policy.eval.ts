// Behavioral, per-fixture (fixtures/cross-company.json via POST /eve/v1/review). An Initech
// meal is judged against Initech's policy. Initech's MEAL-01 caps meals at $25 per attendee
// where Acme's MEAL-01 allows $50, so a citation quoting $50 — or any other Acme limit —
// means the review read the wrong tenant's policy. Nothing in the submission violates a
// hard rule (card-paid, under GEN-01's $100), so it is never a reject.
//
// Would have caught: the process-wide policy memo that served the first company's policy
// to every later review, and the `?? POLICIES.acme` default for any lookup that missed.
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { verifyCitedRule } from "../../agent/lib/cited-rule.js";
import { getCompanyPolicy } from "../../agent/lib/policy-store.js";
import { loadFixture } from "../lib/fixtures.js";
import { reviewOverHttp } from "../lib/review-request.js";

export default defineEval({
  description:
    "An Initech submission (cross-company.json) is decided on Initech's own rules and limits.",
  tags: ["expense-guard", "decisions", "tenant-isolation"],
  async test(t) {
    const submission = loadFixture("cross-company.json");
    t.check(submission.company_id, equals("initech")).gate();

    const decision = await reviewOverHttp(t, submission);
    const { problems } = verifyCitedRule(
      decision.cited_rule,
      getCompanyPolicy(submission.company_id),
      submission.claimed_amount,
    );
    t.check(
      { cited_rule: decision.cited_rule, problems, rejected: decision.decision === "reject" },
      equals({ cited_rule: decision.cited_rule, problems: [], rejected: false }),
    ).gate();
  },
});
