// Deterministic (no model). Per-turn usage accounting sums every step of a review, keeps
// concurrent sessions apart even though Eve numbers turns per session, reports the
// cache-read ratio, and prices the turn at list price with the cache multipliers applied.
//
// Would have caught: the observe-only hook that console.info'd each step's raw usage and
// aggregated nothing — no per-review total, no cache ratio, no cost — leaving a retired
// premium model and a defeated prompt cache invisible in the logs; and the first rewrite,
// which keyed in-flight totals by turnId alone and so merged two concurrent reviews (both
// `turn_0`) into one summary line.
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import {
  addStepUsage,
  cacheReadRatio,
  emptyTurnUsage,
  estimateCostUsd,
  formatTurnUsageSummary,
  TurnUsageLedger,
  type tStepUsage,
  type tTurnUsage,
} from "../../agent/lib/usage-summary.js";

// A typical review: three model calls; the first writes the prefix, the next two read it.
const REVIEW_STEPS: readonly tStepUsage[] = [
  { inputTokens: 1_500, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 1_200 },
  { inputTokens: 1_700, outputTokens: 80, cacheReadTokens: 1_200, cacheWriteTokens: 0 },
  { inputTokens: 1_800, outputTokens: 70, cacheReadTokens: 1_200, cacheWriteTokens: 0 },
];

// Eve's first turn id in every session.
const FIRST_TURN_ID = "turn_0";

function sumSteps(sessionId: string, turnId: string, steps: readonly tStepUsage[]): tTurnUsage {
  return steps.reduce<tTurnUsage>((total, step) => addStepUsage(total, step), emptyTurnUsage(sessionId, turnId));
}

export default defineEval({
  description:
    "Usage accounting totals each turn's steps separately per session and turn, and reports " +
    "cache-read ratio and list-price cost.",
  tags: ["expense-guard", "cost", "deterministic"],
  async test(t) {
    const review = sumSteps("session-a", FIRST_TURN_ID, REVIEW_STEPS);
    t.check(review, equals({
      sessionId: "session-a",
      turnId: FIRST_TURN_ID,
      steps: 3,
      inputTokens: 5_000,
      outputTokens: 250,
      cacheReadTokens: 2_400,
      cacheWriteTokens: 1_200,
    })).gate();
    t.check(cacheReadRatio(review), equals(0.48)).gate();

    // A step without usage still counts as a call and adds nothing.
    t.check(
      addStepUsage(emptyTurnUsage("session-a", "turn_1"), undefined),
      equals({ ...emptyTurnUsage("session-a", "turn_1"), steps: 1 }),
    ).gate();

    // Two sessions run their first turn at the same time, so both are `turn_0`. Their steps
    // interleave, yet each session ends with its own total and the ledger is empty after.
    const ledger = new TurnUsageLedger();
    ledger.addStep("session-a", FIRST_TURN_ID, REVIEW_STEPS[0]);
    ledger.addStep("session-b", FIRST_TURN_ID, REVIEW_STEPS[0]);
    ledger.addStep("session-a", FIRST_TURN_ID, REVIEW_STEPS[1]);
    ledger.addStep("session-b", FIRST_TURN_ID, REVIEW_STEPS[1]);
    ledger.addStep("session-a", FIRST_TURN_ID, REVIEW_STEPS[2]);
    t.check(ledger.size, equals(2)).gate();
    t.check(ledger.finish("session-a", FIRST_TURN_ID), equals(review)).gate();
    t.check(ledger.finish("session-b", FIRST_TURN_ID), equals(sumSteps("session-b", FIRST_TURN_ID, REVIEW_STEPS.slice(0, 2)))).gate();
    t.check(ledger.size, equals(0)).gate();
    // A turn that recorded no step has nothing to log.
    t.check(ledger.finish("session-a", FIRST_TURN_ID), equals(undefined)).gate();

    // Sonnet 5 at $2/$10 per MTok: 1,400 uncached input + 2,400 reads at 0.1x + 1,200 writes
    // at 1.25x = 3,140 input-equivalent tokens -> $0.00628; 250 output tokens -> $0.0025.
    const sonnet5 = { inputUsdPerMTok: 2, outputUsdPerMTok: 10 };
    t.check(estimateCostUsd(review, sonnet5).toFixed(6), equals("0.008780")).gate();
    t.check(cacheReadRatio(emptyTurnUsage("session-a", "empty")), equals(0)).gate();

    // The summary line names the session and turn and carries every figure a cost report needs.
    const line = formatTurnUsageSummary(review, "anthropic/claude-sonnet-5");
    for (const field of ["session=session-a", "turn=turn_0", "steps=3", "input=5000", "output=250", "cache_read=2400", "cache_write=1200", "cache_read_ratio=0.48", "est_cost=$0.0088"]) {
      t.check({ field, present: line.includes(field) }, equals({ field, present: true })).gate();
    }
    t.check(formatTurnUsageSummary(review, "unknown/model").includes("est_cost=n/a"), equals(true)).gate();
  },
});
