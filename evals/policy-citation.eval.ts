// Reference eval (behavioral, judge). The decision cites a concrete company policy rule
// rather than a vague or invented justification. Runs on the default fixture.
import { defineEval } from "eve/evals";
import { ExpenseDecisionSchema } from "../agent/lib/expense.schema.js";
import { loadExpenseFixture } from "../agent/lib/request-context.js";

export default defineEval({
  description: "The decision cites a concrete, real company policy rule.",
  tags: ["expense-guard", "happy-path"],
  async test(t) {
    const submission = loadExpenseFixture();

    const turn = await t.send({
      message: "Review the expense submission and return your decision.",
      outputSchema: ExpenseDecisionSchema,
    });

    t.didNotFail();

    const parsed = ExpenseDecisionSchema.safeParse(turn.data);
    const rendered = parsed.success
      ? `Decision: ${parsed.data.decision}\nReason: ${parsed.data.reason}\nCited rule: ${parsed.data.cited_rule}`
      : JSON.stringify(turn.data, null, 2);

    await t.judge.autoevals
      .closedQA(
        `This is an automated expense-review decision for company "${submission.company_id}". ` +
          'Does the "Cited rule" field reference a specific, concrete company expense policy rule ' +
          "(a rule id or a clearly-stated policy limit) rather than a vague, generic, or invented " +
          "justification? Be tolerant of formatting.",
        { on: rendered },
      )
      .soft(0.6);
  },
});
