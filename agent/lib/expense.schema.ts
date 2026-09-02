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
  category: z
    .string()
    .describe("The submission's category, copied verbatim from the submission (do not paraphrase)."),
  claimed_amount: z
    .number()
    .describe("The submission's claimed_amount, copied verbatim from the submission (do not recompute)."),
});

export type tExpenseDecision = z.infer<typeof ExpenseDecisionSchema>;
