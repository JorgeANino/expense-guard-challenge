// Deterministic (no model). validate_expense really checks the submission: line items and
// the receipt TOTAL must add up to the claimed amount, the amount must be finite and
// positive, and illegibility markers are surfaced. It also takes no model-facing arguments,
// so it can only ever validate the server-seeded submission.
//
// Would have caught: the presence-only check that returned {valid: true} for
// fixtures/illegible.json (claimed $1,280 against $45 of line items and a smudged TOTAL),
// accepted NaN / zero / negative amounts, and validated whatever numbers the model passed;
// and the first TOTAL-line heuristic, which took the last "total" line and the last number
// on it, false-flagging "Total savings", a trailing date, or a trailing order number.
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { z } from "zod";
import { type tExpenseSubmission } from "../../agent/lib/request-context.js";
import { validateSubmission, type tCheckStatus } from "../../agent/lib/validate-submission.js";
import validateExpenseTool from "../../agent/tools/validate_expense.js";
import { loadFixture } from "../lib/fixtures.js";

type tJsonObjectSchema = { properties?: Record<string, unknown> };

function statusByCheck(submission: tExpenseSubmission): Record<string, tCheckStatus> {
  return Object.fromEntries(validateSubmission(submission).checks.map((c) => [c.name, c.status]));
}

const ALL_PASS: Record<string, tCheckStatus> = {
  claimed_amount_positive: "pass",
  line_items_sum_matches_claim: "pass",
  receipt_total_matches_claim: "pass",
  receipt_legible: "pass",
};

export default defineEval({
  description:
    "validate_expense takes no model arguments and deterministically fails submissions whose " +
    "line items or receipt total do not add up, whose amount is not positive, or whose receipt " +
    "is illegible.",
  tags: ["expense-guard", "validation", "deterministic"],
  async test(t) {
    // The tool has no model-facing inputs at all: nothing for an injected receipt to steer.
    const inputSchema = z.toJSONSchema(validateExpenseTool.inputSchema as z.ZodType) as tJsonObjectSchema;
    t.check(Object.keys(inputSchema.properties ?? {}), equals([])).gate();

    const valid = loadFixture("valid.json");
    t.check(validateSubmission(valid).valid, equals(true)).gate();
    t.check(statusByCheck(valid), equals(ALL_PASS)).gate();
    t.check(validateSubmission(valid).currency, equals("USD")).gate();

    const illegible = loadFixture("illegible.json");
    t.check(validateSubmission(illegible).valid, equals(false)).gate();
    t.check(
      statusByCheck(illegible),
      equals({
        claimed_amount_positive: "pass",
        line_items_sum_matches_claim: "fail",
        receipt_total_matches_claim: "fail",
        receipt_legible: "fail",
      }),
    ).gate();

    // Non-positive and non-finite amounts are not valid claims.
    for (const claimed_amount of [0, -96, Number.NaN, Number.POSITIVE_INFINITY]) {
      t.check(
        { claimed_amount, status: statusByCheck({ ...valid, claimed_amount }).claimed_amount_positive },
        equals({ claimed_amount, status: "fail" }),
      ).gate();
    }

    // Line items that do not sum to the claim fail, even when the receipt itself agrees.
    const shortLineItems = { ...valid, line_items: (valid.line_items ?? []).slice(1) };
    t.check(statusByCheck(shortLineItems).line_items_sum_matches_claim, equals("fail")).gate();

    // A receipt TOTAL that disagrees with the claim fails.
    const inflatedClaim = { ...valid, claimed_amount: 960, line_items: [{ label: "Entrees", amount: 960 }] };
    t.check(statusByCheck(inflatedClaim).receipt_total_matches_claim, equals("fail")).gate();

    // Common receipt layouts around the grand total are read as $96.00, not as the savings
    // line, the date, or the order number printed next to it.
    const grandTotalLayouts: Record<string, string> = {
      "total then savings": "SHOP\nItems $99.00\nTOTAL $96.00\nTotal savings $3.00",
      "grand total then date": "SHOP\nSubtotal 88.00\nTax 8.00\nGrand total: 96.00 08/29/2026",
      "total then order number": "SHOP\nTOTAL 96.00 Order #12345\nThank you",
    };
    for (const [layout, receipt] of Object.entries(grandTotalLayouts)) {
      t.check(
        { layout, status: statusByCheck({ ...valid, receipt }).receipt_total_matches_claim },
        equals({ layout, status: "pass" }),
      ).gate();
    }

    // Money is compared in cents, so a floating-point sum is not a false mismatch.
    const floatCents: tExpenseSubmission = {
      ...valid,
      claimed_amount: 30.3,
      line_items: [
        { label: "A", amount: 10.1 },
        { label: "B", amount: 20.2 },
      ],
      receipt: "CAFE\nA ... $10.10\nB ... $20.20\nTOTAL ... $30.30",
    };
    t.check(statusByCheck(floatCents), equals(ALL_PASS)).gate();

    // Nothing to compare is "skipped", not a failure: no line items, no TOTAL line.
    const bare: tExpenseSubmission = { ...valid, line_items: undefined, receipt: "CAFE\nCoffee $96.00" };
    t.check(validateSubmission(bare).valid, equals(true)).gate();
    t.check(
      statusByCheck(bare),
      equals({ ...ALL_PASS, line_items_sum_matches_claim: "skipped", receipt_total_matches_claim: "skipped" }),
    ).gate();
  },
});
