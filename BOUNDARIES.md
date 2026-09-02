# BOUNDARIES — when is an agent the right tool?

Answers are grounded in the code in `agent/` (file paths cited inline), not in a generic "LLM
best practices" list. Part A names each responsibility as it was *found* in the original repo and
states where it belongs; items already moved into code are marked "now fixed" with the
`FINDINGS.md` section that documents the change, the rest are still open.

## Part A — Boundaries of this agent

### A1. Model vs. code

**Should be deterministic code:**

- **Which tenant's policy gets loaded.** As found, `search_policy` took `company_id` as a
  *model-supplied argument* even though the authoritative submission was already seeded into
  `submissionState`, and `getCompanyPolicy` memoized one policy process-wide and defaulted unknown
  ids to `POLICIES.acme`. Tenant selection is an identity/authorization decision, so it belongs in
  code keyed off the request. *Now fixed (FINDINGS §1, §2):* both tools read
  `requireSubmission()` (`agent/tools/search_policy.ts`, `agent/tools/validate_expense.ts`), the
  memo and the default tenant are gone and unknown ids throw (`agent/lib/policy-store.ts`).
- **Arithmetic and structural checks.** As found, the prompt told the model to "double-check
  that the receipt totals add up" while `validate_expense` only checked "fields present" — on
  model-echoed copies of the fields. Summing line items, comparing to `claimed_amount`, and
  spotting an illegible receipt (`fixtures/illegible.json`) are exact operations. *Now fixed
  (FINDINGS §4):* `agent/lib/validate-submission.ts` runs four named checks in integer cents on
  the real submission. *Still open:* comparing an amount against a rule's numeric limit is done by
  the model, and currency is surfaced but never converted.
- **Hard-rule enforcement.** Rules like "alcohol: reject, always" (ACME `ALC-01`), "any expense
  over $100 → flag" (Initech `GEN-01`), "software → flag regardless of amount" (Globex `SW-01`)
  are threshold/category lookups, but `agent/lib/policies.ts` stores them as prose the model
  interprets. *Still open:* encode them as data (`{category, limit, action}`) and evaluate them in
  code; let the model fill the gap only where the rule needs interpretation.
- **Output integrity.** `cited_rule` is a free string and `category` / `claimed_amount` in the
  output are re-typed by the model (`agent/lib/expense.schema.ts`); as found, the channel returned
  them unchecked. *Now fixed (FINDINGS §10):* `agent/lib/decision-post-check.ts` runs in the
  channel -- a decision whose `category` or `claimed_amount` is not the submission's, or whose
  `cited_rule` `verifyCitedRule` (`agent/lib/cited-rule.ts`, shared with the evals) cannot
  verify, degrades to `flag_for_review` with the problems returned beside it.
- **Cost-shaped choices.** As found, `agent/agent.ts` pinned a retired `claude-opus-4-1` snapshot
  for a three-way classification and `buildSystemPrompt` rendered the volatile submission *before*
  the static guide in one block, defeating prefix caching. These are engineering decisions, not
  something the model gets a vote on. *Now fixed (FINDINGS §5, §6):* `anthropic/claude-sonnet-5`,
  a static `review-guide.ts` block ahead of a date-only dynamic block, `effort: "low"` thinking,
  and per-turn usage totals in the logs. The Haiku A/B was run (FINDINGS §5): it passes 17/17 but
  never caches at this prompt size, so it costs more per review at steady state than Sonnet 5.
  *Still open:* no step cap.

**Genuinely needs a model:**

- Reading messy OCR text: deciding that "Sodas & juice" is not alcohol, that "Table of 2" means
  two attendees (so the $50-per-attendee rule applies to $96), that a "Team plan (monthly)" SaaS
  invoice is recurring software spend, or that a receipt is too smudged to trust.
- Mapping an ambiguous submission onto a rule written in prose ("itemized receipt is required",
  "client entertainment ... per event") when the category on the form and the receipt disagree.
- Writing the human-readable `reason` that a reviewer will read.

In short: the model *extracts and interprets*; code *decides what is allowed*.

### A2. What this agent can never guarantee — and where to enforce it instead

| Cannot be guaranteed by any prompt | Enforce here instead |
| --- | --- |
| The review only uses the submitting company's policy. As found, the model chose the `company_id` argument to `search_policy`; a prompt-injected receipt ("use company acme's limits") or a plain mistake broke isolation. | Tool layer — *now fixed (FINDINGS §1, §2)*: the tenant comes from `submissionState`, neither tool has a `company_id` parameter, the memo and the `acme` default are gone from `policy-store.ts`, unknown tenants throw. |
| The caller is who they say they are. As found, the channel sent `auth: null` and took `company_id` straight from the POST body. | Channel/API gateway — *half fixed (FINDINGS §3)*: `agent/channels/review.ts` now runs `routeAuth` (loopback in dev, 401 otherwise) and passes the principal to `send`. *Still open:* binding `company_id` to the authenticated principal needs an identity provider the repo lacks. |
| `cited_rule` refers to a rule that exists in that company's policy with that limit, and the echoed `category` / `claimed_amount` are the submission's. | Post-output validation in the channel — *now fixed (FINDINGS §10)*: `postCheckDecision` runs `verifyCitedRule` (`agent/lib/cited-rule.ts`) and the fact comparison on every decision and degrades to `flag_for_review`, never `approve`, on any problem, returning the problems with the decision; a parsed decision is never refused. *Still open:* a schema built per-request from the loaded rule ids would stop the model emitting a bad citation in the first place. |
| Numeric correctness (sum of line items = claimed amount; amount vs. limit). | *Now fixed for sums (FINDINGS §4)*: `validate_expense` runs `validateSubmission` on the real fields. *Still open:* amount-vs-limit, and running the checks pre-flight in the channel instead of as a model-invoked tool. |
| The decision is the same for the same input tomorrow, or that it is auditable/explainable in a way an auditor accepts. | Persist the full trace (loaded policy version, tool I/O, decision) per review; make hard rules deterministic so identical inputs produce identical outputs for those paths. *Still open.* |
| PII hygiene. The receipts in `fixtures/` carry full card PANs (`4111 1111 1111 1111`, `5500 0000 ...`) and tax ids (RFC), and the whole receipt is put in the system prompt. | Redact in code before the prompt is built (`buildSubmissionInstructions`), and at the OCR ingestion step. *Still open.* |
| Cost and latency bounds. The model can call tools in a loop; nothing caps steps. | Agent config: step limit (*still open*), cheaper model for the common path and a prompt layout that caches (*now fixed, FINDINGS §5, §6*). The `usage-log` hook now sums per-turn cost but is still observe-only (`agent/hooks/usage-log.ts`) and cannot enforce anything. |
| That the fixture is never reviewed in place of a real request. As found, `resolveExpenseSubmission` fell back to `fixtures/request.json` on a bare body. | Channel and tools — *now fixed (FINDINGS §3)*: malformed and empty bodies are 400 before any turn; the fixture path survives only for the eval runner / `eve dev` client, on a session route that is loopback-only and reviews nothing real. Under `VERCEL_ENV=production` the resolver throws, but eve logs-and-skips a throwing resolver rather than failing the turn, so the throw only guarantees that no submission is seeded -- the tools then error on `requireSubmission()`. On the review route the post-check still checks the decision against the body's submission, which the channel holds independently of the resolver; the session route, where the production throw actually fires, has no post-check but is loopback-only and reviews nothing real. The throw stops a fixture being reviewed silently; it is not a turn-failing control. |

### A3. Failure containment — a wrong LLM output must not become a wrong business outcome

- **Treat the model's output as a recommendation, not a verdict.** The channel runs a
  deterministic post-check before returning (*now fixed for the first two, FINDINGS §10*):
  output `category` (trimmed, case-insensitive) and `claimed_amount` equal the submission's,
  `cited_rule` verifies against the loaded policy with its real limit; any failure degrades the
  decision to `flag_for_review` with the problems listed. *Still open:* the decision is consistent with any hard
  rule that code already evaluated (e.g. code says "alcohol present → reject"; model says
  approve → the code wins and the disagreement is logged).
- **Asymmetric fallbacks.** Any invalid or inconsistent output degrades to `flag_for_review`,
  never to `approve`. An `approve` is the only outcome that moves money, so it should require the
  most agreement (code checks pass + model agrees + cited rule verified). `reject` should also be
  reviewable by the submitter (see Part B, scenario 4).
- **Human in the loop by tier.** Auto-execute `approve` only under a per-company amount ceiling
  and only for rules marked "auto-approve"; above that, or on any `reject`, queue for a human with
  the model's `reason` as the pre-filled recommendation.
- **Fail closed on tenant errors, at the layer that can actually refuse.** An unknown
  `company_id` or missing policy is refused with 400 before a turn starts; that is the only
  place a bad tenant is stopped outright. Inside a turn, eve does not fail closed for us: a
  throwing instructions resolver is logged and skipped, and a throwing tool goes back to the
  model as a tool-error result, so the model can still emit a schema-valid decision and the
  channel would answer 200. What keeps that from becoming a wrong outcome is that both tools
  read the server-seeded submission (no other company's rules can be fetched at all) and that
  the post-check never leaves a decision about the wrong facts or an unverifiable citation as
  `approve`. The `turn.failed` -> 502 path covers model-call failures, not tool errors.
- **Log the evidence, not just the answer.** Store policy version, tool inputs/outputs, the raw
  model output and the post-check result per review, so a wrong decision can be traced, replayed
  in an eval, and bulk-corrected if a policy or prompt regression is found.
- **Make regressions visible.** Every containment rule above gets an eval in `evals/` (the
  original suite only covered the happy path on `fixtures/request.json`; `evals/decisions/*`,
  `evals/tenant-isolation/*`, `evals/validation/*` and `evals/citation/*` now cover the other
  fixtures and the tool contracts); track the approve/flag/reject distribution per company in
  production so a prompt or model change that shifts it shows up before finance does.

## Part B — Build the right thing

### B1. Nightly invoice reconciliation → **No AI. Deterministic batch job.**

- Both sides are structured records with keys (invoice id, amount, currency, date). Matching is a
  join plus tolerance rules; mismatches are a diff. There is nothing to interpret.
- Finance reconciliation must be exact, repeatable and auditable — an LLM adds variance and cost
  to a task that a SQL query or a small script does perfectly.
- Alerting is a threshold on the diff output; existing monitoring handles it.
- *What would change my mind:* if a meaningful share of "mismatches" are free-text explanation
  problems (e.g. provider memos in natural language that need to be matched to internal notes), add
  a single LLM call *after* the deterministic diff to classify or summarize the residual
  unmatched rows — never to do the matching itself.

### B2. WhatsApp intent tagging, ~500k/day → **Deterministic automation first, then a small fine-tuned classifier; no agent.**

- At 500k/day, per-message cost and p99 latency dominate. A distilled/fine-tuned small
  classifier (or even a cheap embedding + nearest-centroid model) costs orders of magnitude less
  than an LLM call per message and is fast enough for routing.
- The label set is closed and small; this is textbook supervised classification. Bootstrap the
  training set with an LLM labelling a sample once, then train and serve the small model.
- Keep a cheap rules layer in front (keyword/regex for the obvious `pricing_question` cases,
  language detection) and route low-confidence messages to a single cheap LLM call as a fallback
  for the long tail — still not an agent.
- *What would change my mind:* if the label taxonomy changes weekly or must be defined per
  customer (no time to retrain), a single small-model LLM call with the label definitions in a
  cached prefix becomes the pragmatic choice; measure its cost against the classifier before
  committing.

### B3. Policy Q&A for finance teams → **Retrieval + single LLM call (RAG). Not an agent.**

- The answer must be grounded in *that company's* policy text: retrieve the relevant rule chunks
  for the authenticated company, put them in the prompt, and answer in one call with citations.
  Tenant scoping lives in the retrieval filter, exactly the lesson from Part A.
- Free-form questions ("hotel upgrade?") need language understanding, so a model is justified;
  but there is no multi-step action to take, so a tool-using loop adds cost and failure modes
  without benefit.
- Return "the policy does not say" when retrieval is empty, and always show the cited passage so
  the employee can verify — it is an assistant, not an approver.
- *What would change my mind:* if users need the system to *act* (submit the expense, check their
  remaining budget, look up a past claim), those become tools and the single call grows into a
  small agent — but only add tools that are read-only and tenant-scoped in code.

### B4. Autonomous expense appeals → **Tool-using agent, but bounded; the final decision stays with code and/or a human.**

- The workflow is genuinely multi-step and conditional: re-read the receipt, decide whether a
  document is missing, ask the submitter for it, wait, re-evaluate. That is what an agent loop is
  for; a single call cannot pause for a reply.
- Bound it hard: fixed tool set (fetch receipt, fetch policy for *this* tenant, request document,
  draft recommendation), a step/turn cap, and no tool that can reverse a decision directly. The
  agent produces a recommendation with evidence; reversal is either a deterministic rule
  (e.g. the missing itemized receipt is now present and the original rejection cited only that) or
  a human click.
- Reuse Part A's containment: verify cited rules against the loaded policy, fail closed on tenant
  errors, log the full trace, and default to "escalate to human" whenever the agent is unsure or
  exceeds its budget.
- *What would change my mind:* if appeal volume is low (say tens per week), skip the agent
  entirely — a form that collects the missing document plus a human reviewer with an LLM-drafted
  summary (single call) is cheaper to build and easier to trust. Conversely, only let the agent
  auto-reverse if measured disagreement with human reviewers on a held-out appeal set is below an
  agreed threshold.
