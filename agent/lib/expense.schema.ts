// The structured decision Expense Guard emits (agent-level outputSchema, also attached
// per message by the channel and evals).
import { z } from "zod";

export const DECISIONS = ["approve", "flag_for_review", "reject"] as const;

export const ExpenseDecisionSchema = z.object({
  decision: z.enum(DECISIONS).describe("The review outcome."),
  reason: z.string().min(1).describe("Short explanation for the decision."),
  cited_rule: z
    .string()
    .min(1)
    .describe("The specific company policy rule (id and limit) the decision relies on."),
  category: z.string().describe("The expense category as understood."),
  claimed_amount: z.number().describe("The total amount claimed, in the receipt currency."),
});

export type tExpenseDecision = z.infer<typeof ExpenseDecisionSchema>;
