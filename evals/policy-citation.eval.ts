// Behavioral, deterministic gate. The decision's cited_rule names a rule that exists in the
// submitting company's policy and quotes the limit that rule really states. Runs on the
// process-wide fixture (POC_REQUEST_FILE, default fixtures/request.json) via t.send().
//
// No judge: a judge that is not shown the real policy cannot tell "MEAL-01: $50" from an
// invented "MEAL-99: $500 limit", and one that is shown it would only approximate the exact
// comparison verifyCitedRule already does for free.
//
// Would have caught: a cited_rule that invents a rule id, quotes a limit from another
// company's identically-numbered rule, or gives a generic justification with no rule at all.
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { verifyCitedRule } from "../agent/lib/cited-rule.js";
import { ExpenseDecisionSchema } from "../agent/lib/expense.schema.js";
import { getCompanyPolicy } from "../agent/lib/policy-store.js";
import { loadExpenseFixture } from "../agent/lib/request-context.js";

export default defineEval({
  description:
    "cited_rule names a real rule from the submitting company's policy, with that rule's limit.",
  tags: ["expense-guard", "happy-path"],
  async test(t) {
    const submission = loadExpenseFixture();
    const policy = getCompanyPolicy(submission.company_id);

    const turn = await t.send({
      message: "Review the expense submission and return your decision.",
      outputSchema: ExpenseDecisionSchema,
    });

    t.didNotFail();
    const decision = ExpenseDecisionSchema.parse(turn.data);
    const { problems } = verifyCitedRule(decision.cited_rule, policy, submission.claimed_amount);
    t.check(
      { cited_rule: decision.cited_rule, problems },
      equals({ cited_rule: decision.cited_rule, problems: [] }),
    ).gate();
  },
});
