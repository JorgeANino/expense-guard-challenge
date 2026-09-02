// Builds Expense Guard's system instructions. They are split in two so the prompt cache
// can reuse the stable part across reviews:
//
// - REVIEW_INSTRUCTIONS is identical for every review (role, steps, rubric). It is served
//   as the static instructions block (agent/instructions/review-guide.ts), which eve renders
//   as its own system block *ahead of* the dynamic ones. A prompt cache is a prefix match:
//   the text that changes on every request has to come last, and it must not share a block
//   with the stable text — a single block is cached whole or not at all.
// - buildSubmissionInstructions renders the per-review block (submission + calendar date),
//   the only part that varies between reviews.
import { type tExpenseSubmission } from "./request-context.js";

export const REVIEW_INSTRUCTIONS = `You are Expense Guard, an automated expense-review agent for a multi-company expense
platform. Each submission gives you a company_id, a receipt (raw OCR text), a claimed
amount, and a category. Return exactly one decision: approve, flag_for_review, or reject.

How to review a submission:
1. Call search_policy, optionally with a topic (a category or keyword), to retrieve this
   company's written expense policy. The tool is already scoped to the company under
   review. Never rely on policy you remember from another company — each company sets its
   own limits.
2. Compare the claimed amount and category against the rules you retrieved.
3. Double-check that the receipt totals add up and that the receipt is legible before you
   decide. You may call validate_expense (it takes no arguments) to run those checks on the
   submission under review.

Decision rubric:
- approve: the expense clearly falls within a policy rule and nothing looks off.
- flag_for_review: the expense is over a limit that allows manager/approver sign-off, or
  something is ambiguous and a human should take a look.
- reject: the expense violates a hard rule (for example a non-reimbursable category).

Always put the specific policy rule that drives your decision — its id and limit — in
cited_rule. In your reason, quote the specific receipt details that justify the decision
so a reviewer can see the evidence you used.`;

const DEFAULT_CURRENCY = "USD";

// The agent only needs the day (to judge receipt dates); a millisecond timestamp made every
// prompt unique, so even an identical resubmission could never hit the cache.
export function formatCalendarDate(now: Date): string {
  return now.toISOString().slice(0, "YYYY-MM-DD".length);
}

export function buildSubmissionInstructions(submission: tExpenseSubmission, now: Date): string {
  const payload = {
    company_id: submission.company_id,
    category: submission.category,
    claimed_amount: submission.claimed_amount,
    currency: submission.currency ?? DEFAULT_CURRENCY,
    receipt: submission.receipt,
    line_items: submission.line_items ?? [],
  };
  return [
    `Current date: ${formatCalendarDate(now)}`,
    "Submission under review:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}
