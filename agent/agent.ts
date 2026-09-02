// Expense Guard — a multi-company expense-review agent. Reviews one expense submission
// (company_id + receipt + claimed amount + category) against that company's written
// policy and returns a structured decision: approve / flag_for_review / reject.
//
// Schema-output agent WITH tools: it emits the decision through `outputSchema`, and
// drives to that decision by calling search_policy (fetch the company policy) and
// validate_expense (sanity-check the submission). Eve binds `model` statically at build
// time — there is no runtime model override.
import { defineAgent } from "eve";
import { ExpenseDecisionSchema } from "./lib/expense.schema.js";

// A review is one policy lookup, some arithmetic, and a three-way decision — Sonnet-tier
// reasoning is plenty. Sonnet 5 lists at $2/$10 per MTok versus $15/$75 for the retired
// Claude Opus 4.1 snapshot this used to pin (~7.5x cheaper per review, and the dated id is
// no longer served first-party). Haiku 4.5 ($1/$5) was A/B-tested against the full suite
// (2026-09-01): it also passes 17/17, but its 4,096-token prompt-cache floor means zero
// cache reuse at this prompt size, so at steady state it costs MORE per review ($0.0062-0.0076
// flat) than Sonnet 5 with a warm cache ($0.0044) — see FINDINGS.md §5-6. Catalog-listed
// ids carry their own context window, so no modelContextWindowTokens override is needed.
export const REVIEW_MODEL_ID = "anthropic/claude-sonnet-5";

export default defineAgent({
  model: REVIEW_MODEL_ID,
  outputSchema: ExpenseDecisionSchema,
  // Sonnet 5 defaults to adaptive thinking at high effort, billed as output tokens; a
  // bounded 3-way review does not need it. effort:"low" measured 17/17 with ~30% fewer
  // output tokens per review. Forwarded to the provider per step via eve's prepareStep.
  modelOptions: { providerOptions: { anthropic: { effort: "low" } } },
});
