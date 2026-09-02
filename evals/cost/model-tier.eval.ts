// Deterministic (no model). The review agent is pinned to a current, catalog-listed model
// tier that fits a bounded three-way decision, not to a dated snapshot of a premium tier.
//
// Would have caught: model "anthropic/claude-opus-4-1-20250805" — a retired Opus 4.1
// snapshot at $15/$75 per MTok (~7.5x Sonnet 5), absent from the AI Gateway catalog, which
// in turn forced a hard-coded modelContextWindowTokens workaround.
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import agent, { REVIEW_MODEL_ID } from "../../agent/agent.js";
import { MODEL_PRICES_USD_PER_MTOK } from "../../agent/lib/usage-summary.js";

// Tiers approved for expense review: both listed in the AI Gateway catalog
// (https://ai-gateway.vercel.sh/v1/models/catalog, checked 2026-08-29) with their own
// context-window metadata, and both an order of magnitude cheaper than Opus-tier.
const APPROVED_REVIEW_MODELS = ["anthropic/claude-sonnet-5", "anthropic/claude-haiku-4.5"] as const;

// Anthropic dated snapshot ids end in a YYYYMMDD stamp; those retire and drop out of the
// catalog while the undated alias keeps working.
const DATED_SNAPSHOT_SUFFIX = /-\d{8}$/;

export default defineEval({
  description:
    "The agent's model is an approved, catalog-listed, cost-appropriate tier (not a dated " +
    "premium snapshot) and needs no context-window override.",
  tags: ["expense-guard", "cost", "deterministic"],
  async test(t) {
    t.check(agent.model, equals(REVIEW_MODEL_ID)).gate();
    t.check(APPROVED_REVIEW_MODELS.includes(REVIEW_MODEL_ID as (typeof APPROVED_REVIEW_MODELS)[number]), equals(true)).gate();
    t.check(DATED_SNAPSHOT_SUFFIX.test(REVIEW_MODEL_ID), equals(false)).gate();

    // The override exists only for ids the catalog cannot resolve; on a listed id it would
    // silently shadow the catalog's real window.
    t.check("modelContextWindowTokens" in agent, equals(false)).gate();

    // The usage hook can price every review on the chosen model.
    t.check(MODEL_PRICES_USD_PER_MTOK[REVIEW_MODEL_ID] !== undefined, equals(true)).gate();
  },
});
