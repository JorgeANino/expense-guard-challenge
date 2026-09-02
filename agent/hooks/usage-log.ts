// Observe-only hook: fold each model call's usage into a per-turn total and log ONE summary
// line when the turn ends (tokens by kind, cache-read ratio, list-price cost estimate).
// Hooks run after each event is durably recorded and cannot block or alter a tool call —
// they only observe. Eve's turn ids are per session (`turn_0` in every session), so totals
// are keyed by session id + turn id and dropped once the turn ends; that is what keeps
// concurrent reviews from being summed into one line.
import { defineHook } from "eve/hooks";
import { REVIEW_MODEL_ID } from "../agent.js";
import { formatTurnUsageSummary, TurnUsageLedger } from "../lib/usage-summary.js";

const ledger = new TurnUsageLedger();

function logTurnSummary(sessionId: string, turnId: string, outcome: "completed" | "failed"): void {
  const total = ledger.finish(sessionId, turnId);
  if (total === undefined) return;
  console.info(`[expense-guard] review ${outcome}: ${formatTurnUsageSummary(total, REVIEW_MODEL_ID)}`);
}

export default defineHook({
  events: {
    "step.completed"(event, ctx) {
      ledger.addStep(ctx.session.id, event.data.turnId, event.data.usage);
    },
    "turn.completed"(event, ctx) {
      logTurnSummary(ctx.session.id, event.data.turnId, "completed");
    },
    "turn.failed"(event, ctx) {
      logTurnSummary(ctx.session.id, event.data.turnId, "failed");
    },
  },
});
