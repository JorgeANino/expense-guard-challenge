// Reference eval (deterministic). A within-policy meal expense is approved after the
// agent looks up the company's policy. Runs on the default fixture (fixtures/request.json).
import { defineEval } from "eve/evals";
import { matches } from "eve/evals/expect";
import { ExpenseDecisionSchema } from "../agent/lib/expense.schema.js";

const ApprovedDecision = ExpenseDecisionSchema.refine(
  (d) => d.decision === "approve",
  "expected an approve decision for a clearly within-policy expense",
);

export default defineEval({
  description: "A within-policy meal expense is approved after the company policy is looked up.",
  tags: ["expense-guard", "happy-path"],
  async test(t) {
    const turn = await t.send({
      message: "Review the expense submission and return your decision.",
      outputSchema: ExpenseDecisionSchema,
    });

    t.didNotFail();
    t.calledTool("search_policy").gate();
    t.check(turn.data, matches(ApprovedDecision)).gate();
  },
});
