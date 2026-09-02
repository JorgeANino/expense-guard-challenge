// Deterministic (no model). POST /eve/v1/review validates the body at the trust boundary:
// anything that is not a well-formed submission for a provisioned company is a 400, never a
// confident decision about a fixture or a default tenant. Every case is rejected before a
// session starts, so this runs without a model key.
//
// Would have caught: the unvalidated body cast (`{"x":1}` reviewed with company_id
// undefined) and the bare-body fallback that reviewed fixtures/request.json instead.
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { loadExpenseFixture } from "../../agent/lib/request-context.js";
import { REVIEW_PATH } from "../lib/review-request.js";

function withoutField(submission: Record<string, unknown>, field: string): Record<string, unknown> {
  const { [field]: _dropped, ...rest } = submission;
  return rest;
}

export default defineEval({
  description: "Malformed, unrelated, or unprovisioned-company request bodies are rejected with 400.",
  tags: ["expense-guard", "tenant-isolation", "http", "deterministic"],
  async test(t) {
    const valid: Record<string, unknown> = loadExpenseFixture();
    const rejectedBodies: ReadonlyArray<{ name: string; body: string }> = [
      { name: "invalid JSON", body: "{not json" },
      { name: "empty object", body: "{}" },
      { name: "array body", body: "[]" },
      { name: "unrelated keys", body: JSON.stringify({ x: 1 }) },
      { name: "missing company_id", body: JSON.stringify(withoutField(valid, "company_id")) },
      { name: "missing receipt", body: JSON.stringify(withoutField(valid, "receipt")) },
      { name: "string claimed_amount", body: JSON.stringify({ ...valid, claimed_amount: "96" }) },
      { name: "unprovisioned company", body: JSON.stringify({ ...valid, company_id: "wayne-enterprises" }) },
    ];

    for (const { name, body } of rejectedBodies) {
      const response = await t.target.fetch(REVIEW_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const payload = (await response.json()) as { ok?: boolean };
      t.check(
        { case: name, status: response.status, ok: payload.ok },
        equals({ case: name, status: 400, ok: false }),
      ).gate();
    }
  },
});
