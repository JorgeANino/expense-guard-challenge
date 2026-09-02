// Per-turn token accounting for the usage hook. A review is one turn made of several model
// calls (steps); each step.completed event carries that call's usage, and this module folds
// them into one per-turn total with a cache-read ratio and a list-price cost estimate, so a
// wrong model tier or a defeated prompt cache shows up in the logs instead of on the bill.
//
// Field semantics follow the AI SDK's LanguageModelUsage: `inputTokens` is the whole prompt,
// and `cacheReadTokens` / `cacheWriteTokens` are the slices of it that were served from or
// written to the prompt cache.

export type tStepUsage = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
};

export type tTurnUsage = {
  readonly sessionId: string;
  readonly turnId: string;
  readonly steps: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
};

export type tModelPrice = {
  readonly inputUsdPerMTok: number;
  readonly outputUsdPerMTok: number;
};

// Anthropic first-party list prices in USD per million tokens, from
// https://www.anthropic.com/pricing as of 2026-08-29. Cache reads bill at 0.1x the input
// price and (5-minute) cache writes at 1.25x, per
// https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching#pricing.
export const MODEL_PRICES_USD_PER_MTOK: Readonly<Record<string, tModelPrice>> = {
  "anthropic/claude-sonnet-5": { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
  "anthropic/claude-haiku-4.5": { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
};
const CACHE_READ_PRICE_MULTIPLIER = 0.1;
const CACHE_WRITE_PRICE_MULTIPLIER = 1.25;
const TOKENS_PER_MTOK = 1_000_000;

// Log formatting: a single review costs fractions of a cent, so four decimals keeps
// sub-cent costs from rounding to $0.00; two decimals is enough resolution for a 0..1 ratio.
const COST_USD_DECIMALS = 4;
const RATIO_DECIMALS = 2;

export function emptyTurnUsage(sessionId: string, turnId: string): tTurnUsage {
  return { sessionId, turnId, steps: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

export function addStepUsage(total: tTurnUsage, step: tStepUsage | undefined): tTurnUsage {
  return {
    ...total,
    steps: total.steps + 1,
    inputTokens: total.inputTokens + (step?.inputTokens ?? 0),
    outputTokens: total.outputTokens + (step?.outputTokens ?? 0),
    cacheReadTokens: total.cacheReadTokens + (step?.cacheReadTokens ?? 0),
    cacheWriteTokens: total.cacheWriteTokens + (step?.cacheWriteTokens ?? 0),
  };
}

// In-flight totals for turns that have not ended yet. Eve numbers turns per session
// (`turn_0`, `turn_1`, ...), so a turn id alone is shared by every concurrent session;
// the session id is what keeps concurrent reviews apart.
export class TurnUsageLedger {
  private readonly inFlight = new Map<string, tTurnUsage>();

  private static key(sessionId: string, turnId: string): string {
    return `${sessionId}/${turnId}`;
  }

  addStep(sessionId: string, turnId: string, step: tStepUsage | undefined): void {
    const key = TurnUsageLedger.key(sessionId, turnId);
    this.inFlight.set(key, addStepUsage(this.inFlight.get(key) ?? emptyTurnUsage(sessionId, turnId), step));
  }

  // Removes and returns the turn's total; undefined when no step of that turn was seen.
  finish(sessionId: string, turnId: string): tTurnUsage | undefined {
    const key = TurnUsageLedger.key(sessionId, turnId);
    const total = this.inFlight.get(key);
    this.inFlight.delete(key);
    return total;
  }

  get size(): number {
    return this.inFlight.size;
  }
}

// Share of the prompt tokens served from the cache, 0..1. Zero across a whole turn with
// more than one step means the prefix is not being reused at all.
export function cacheReadRatio(total: tTurnUsage): number {
  return total.inputTokens === 0 ? 0 : total.cacheReadTokens / total.inputTokens;
}

export function estimateCostUsd(total: tTurnUsage, price: tModelPrice): number {
  const uncachedInputTokens = total.inputTokens - total.cacheReadTokens - total.cacheWriteTokens;
  const inputUsd =
    (uncachedInputTokens +
      total.cacheReadTokens * CACHE_READ_PRICE_MULTIPLIER +
      total.cacheWriteTokens * CACHE_WRITE_PRICE_MULTIPLIER) *
    (price.inputUsdPerMTok / TOKENS_PER_MTOK);
  const outputUsd = total.outputTokens * (price.outputUsdPerMTok / TOKENS_PER_MTOK);
  return inputUsd + outputUsd;
}

export function formatTurnUsageSummary(total: tTurnUsage, modelId: string): string {
  const price = MODEL_PRICES_USD_PER_MTOK[modelId];
  const cost =
    price === undefined
      ? "n/a (no list price for model)"
      : `$${estimateCostUsd(total, price).toFixed(COST_USD_DECIMALS)}`;
  return (
    `session=${total.sessionId} turn=${total.turnId} model=${modelId} steps=${total.steps} ` +
    `input=${total.inputTokens} output=${total.outputTokens} ` +
    `cache_read=${total.cacheReadTokens} cache_write=${total.cacheWriteTokens} ` +
    `cache_read_ratio=${cacheReadRatio(total).toFixed(RATIO_DECIMALS)} est_cost=${cost}`
  );
}
