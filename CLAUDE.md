# Expense Guard — working notes for Claude

Take-home challenge repo: a multi-tenant expense-review agent on Eve 0.11.7 (Vercel agent
framework) + Bun + TypeScript. The brief is in `README.md` — read it before substantive work.
The job: find the planted problems (correctness, security/tenant-isolation, cost,
maintainability), fix them production-quality, prove each fix with an eval, and write
`FINDINGS.md` + `BOUNDARIES.md` at the repo root.

## Map

- `agent/agent.ts` — `defineAgent`: model `anthropic/claude-sonnet-5` (`REVIEW_MODEL_ID`) with
  thinking `effort: "low"` via `modelOptions.providerOptions.anthropic` (A/B-measured, FINDINGS §5),
  and `outputSchema`
- `agent/instructions/review-guide.ts` — static review guide (`REVIEW_INSTRUCTIONS`, cacheable
  prefix); `agent/instructions/system.ts` — per-review dynamic block (submission + date);
  `agent/lib/build-instructions.ts` builds both
- `agent/lib/` — `policy-store.ts`, `policies.ts`, `request-context.ts` (zod boundary +
  `submissionState`), `expense.schema.ts`, `validate-submission.ts` (pure receipt checks),
  `cited-rule.ts` (`verifyCitedRule`, pure citation check), `decision-post-check.ts` (the
  channel's output post-check), `usage-summary.ts` (per-session-and-turn token/cost totals)
- `agent/tools/` — live: `search_policy` (`{topic?}`) and `validate_expense` (`{}`), both scoped
  by `requireSubmission()`. The other ten files (`bash`, `read_file`, `write_file`, `glob`,
  `grep`, `web_search`, `web_fetch`, `todo`, `ask_question`, `load_skill`) are `disableTool()`
  stubs that switch off all of Eve 0.11.7's framework defaults (`ALL_FRAMEWORK_TOOLS` has ten)
- `agent/channels/review.ts` — HTTP channel (POST `/eve/v1/review`, `routeAuth` + body
  validation + `postCheckDecision`), the production surface. `agent/channels/eve.ts` — Eve's session channel
  (`eveChannel({ auth: [localDev()] })`, `/eve/v1/session*`) used by `eve dev` and `t.send()`; it
  **must** keep that name (the framework keys its default session channel on the basename `eve`,
  and an authored file of the same name replaces it — which is why the review channel is not
  `eve.ts`). `agent/hooks/usage-log.ts`
- `agent/sandbox.ts` — pinned to `justbash` for macOS; **do not touch** (per README)
- `evals/` — `evals.config.ts`; `approve-valid`, `policy-citation`; `citation/`, `cost/`,
  `decisions/`, `http/`, `tenant-isolation/`, `validation/`; shared helpers in `evals/lib/`
  (`fixtures.ts`, `review-request.ts`). 17 evals; the 10 tagged `deterministic` run without a
  model key (`http/session-route-registered` gates that `/eve/v1/session` exists,
  `http/model-facing-tools` that `/eve/v1/info` offers only the two live tools)
- `fixtures/` — `request.json`, `valid.json`, `ambiguous.json`, `illegible.json`,
  `cross-company.json`, `prompt-injection.json`

## Commands

```bash
bun install
bunx tsc --noEmit     # typecheck
bunx eve build
bunx eve dev          # POST /eve/v1/review; POC_REQUEST_FILE selects a fixture
bunx eve eval         # needs AI_GATEWAY_API_KEY in .env
```

## Orchestration

When the user sends `/orchestrator <instruction>` or addresses a prompt to **ORCHESTRATOR**,
invoke the `orchestrator` skill — it triages and runs the saved workflow
`.claude/workflows/orchestrator.js` (plan → parallel investigate → adversarial verify →
sequential execute → report) with the instruction as `args.prompt`.

## Ground rules (bind every change)

- Tenant isolation is sacred: a review for one company must never see another company's policy.
- Never fabricate data — evals, findings, metrics only reflect what actually ran.
- Every behavioral fix ships with an eval that would have caught the bug.
- Production quality: no dead code, no unexplained magic numbers, tests that assert.
- Don't commit/push unless the user asks.
