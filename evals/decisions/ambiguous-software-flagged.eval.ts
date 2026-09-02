// Behavioral, per-fixture (fixtures/ambiguous.json via POST /eve/v1/review). A $450/month
// SaaS invoice for Acme sits above SW-01's $200/month auto-approve line, which the rule
// routes to IT sign-off: flag_for_review, citing SW-01 with its $200 limit.
//
// Would have caught: approving over-limit software because the rule was read as a hard cap
// or skipped, and citing a rule other than the one that drives the decision.
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { verifyCitedRule } from "../../agent/lib/cited-rule.js";
import { getCompanyPolicy } from "../../agent/lib/policy-store.js";
import { loadFixture } from "../lib/fixtures.js";
import { reviewOverHttp } from "../lib/review-request.js";

const DRIVING_RULE_ID = "SW-01";

export default defineEval({
  description:
    "Over-limit software spend (ambiguous.json) is flagged for review, citing the company's " +
    "SW-01 with its real limit.",
  tags: ["expense-guard", "decisions"],
  async test(t) {
    const submission = loadFixture("ambiguous.json");
    const decision = await reviewOverHttp(t, submission);

    t.check(decision.decision, equals("flag_for_review")).gate();
    const { citedRuleIds, problems } = verifyCitedRule(
      decision.cited_rule,
      getCompanyPolicy(submission.company_id),
      submission.claimed_amount,
    );
    t.check(
      { cited_rule: decision.cited_rule, problems, citesDrivingRule: citedRuleIds.includes(DRIVING_RULE_ID) },
      equals({ cited_rule: decision.cited_rule, problems: [], citesDrivingRule: true }),
    ).gate();
  },
});
