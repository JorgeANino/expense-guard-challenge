// Observe-only hook: log per-step token/cache usage as the run progresses. Hooks run
// after each event is durably recorded and cannot block or alter a tool call — they only
// observe. The same step.completed usage fields are what a token/cost report sums off the
// event stream (inputTokens / outputTokens / cacheReadTokens / cacheWriteTokens).
import { defineHook } from "eve/hooks";

export default defineHook({
  events: {
    "step.completed"(event) {
      const usage = (event.data as { usage?: Record<string, number> } | undefined)?.usage;
      if (usage) console.info("[expense-guard] step usage", usage);
    },
  },
});
