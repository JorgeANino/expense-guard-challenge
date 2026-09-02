// Run-wide eval configuration for Expense Guard. No judge model is configured: every
// assertion in evals/ is an exact check against data the repo holds (policies, fixtures,
// schemas), and none calls t.judge.*.
//
// How a fixture reaches an eval (Eve 0.11.7 has no per-send channel state):
// - t.send() reviews the process-wide fixture — POC_REQUEST_FILE, default
//   fixtures/request.json — so one `eve eval` run sees one fixture on this path. Use it when
//   the eval needs tool-call assertions (t.calledTool) on the run.
// - reviewOverHttp() (evals/lib/review-request.ts) POSTs an explicit fixture to the channel,
//   so evals/decisions/* each pick their own fixture in the same run; only the returned
//   decision is observable there.
// - Deterministic evals (tagged "deterministic") call the pure functions directly and run
//   without AI_GATEWAY_API_KEY.
import { defineEvalConfig } from "eve/evals";

export default defineEvalConfig({
  maxConcurrency: 2,
  timeoutMs: 120_000,
});
