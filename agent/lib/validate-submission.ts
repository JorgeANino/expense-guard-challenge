// Deterministic sanity checks on an expense submission, run by the validate_expense tool.
// These are the arithmetic and legibility checks the system prompt tells the model to do
// ("double-check that the receipt totals add up and that the receipt is legible") — done in
// code so the answer does not depend on the model reading OCR text carefully. Pure: no
// model, no state, no I/O.
import type { tExpenseSubmission } from "./request-context.js";

export type tCheckStatus = "pass" | "fail" | "skipped";

export type tSubmissionCheck = {
  name: string;
  status: tCheckStatus;
  detail: string;
};

export type tSubmissionValidation = {
  // True only when no check failed; skipped checks (nothing to compare) do not count.
  valid: boolean;
  currency: string | null;
  checks: tSubmissionCheck[];
};

// OCR tools mark what they could not read with bracketed placeholders or runs of question
// marks; a receipt carrying any of these cannot be trusted to support the claimed amount.
const ILLEGIBILITY_MARKER = /\[(?:illegible|smudged|unreadable|torn|faded|blurry|cut ?off|missing)\]|\?{2,}/gi;

// Finding the grand total on OCR text is a heuristic; it fails closed (a wrong or unreadable
// pick is a `fail`, i.e. flag_for_review), so the rules below only aim to avoid false flags
// on the receipt layouts that are common, not to parse every receipt.
//
// A whole-word "total" line ("Subtotal" does not match, "Sub-total" does) that is not one of
// the other totals receipts print: "Total savings", "Total items", "Total tax".
const TOTAL_LINE = /\btotal\b(?!\s*(?:savings|items|tax)\b)/i;
// Of those, a line that starts with TOTAL or GRAND TOTAL is the grand total; it wins over a
// "... total" phrase elsewhere on the receipt ("Order total", "Total due" in a footer note).
const GRAND_TOTAL_LINE = /^\s*(?:grand\s+)?total\b/i;

// A figure that reads as money: a dollar sign and/or exactly two decimals ("$96", "$1,280.00",
// "96.00"). Preferred over a bare number so a date or an order number on the same line is
// not read as the amount.
const CURRENCY_FIGURE = /\$\s?(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*\.\d{2})\b/;
// A bare figure, used only when the line has no currency-looking one ("TOTAL 96").
const BARE_FIGURE = /\d[\d,]*(?:\.\d{1,2})?/;

// Money is compared in integer cents so floating-point sums (e.g. 0.1 + 0.2) do not report
// a false mismatch; amounts are decimal currency, never fractions of a cent.
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

function checkClaimedAmountPositive(submission: tExpenseSubmission): tSubmissionCheck {
  const { claimed_amount } = submission;
  const name = "claimed_amount_positive";
  if (!Number.isFinite(claimed_amount)) {
    return { name, status: "fail", detail: `claimed_amount is not a finite number: ${claimed_amount}` };
  }
  if (claimed_amount <= 0) {
    return { name, status: "fail", detail: `claimed_amount must be greater than zero, got ${formatAmount(claimed_amount)}` };
  }
  return { name, status: "pass", detail: `claimed_amount is ${formatAmount(claimed_amount)}` };
}

function checkLineItemsSumMatchesClaim(submission: tExpenseSubmission): tSubmissionCheck {
  const name = "line_items_sum_matches_claim";
  const lineItems = submission.line_items ?? [];
  if (lineItems.length === 0) {
    return { name, status: "skipped", detail: "no line_items were submitted" };
  }
  const sum = lineItems.reduce((cents, item) => cents + toCents(item.amount), 0);
  const claimed = toCents(submission.claimed_amount);
  const summary = `${lineItems.length} line item(s) sum to ${formatAmount(sum / 100)}; claimed_amount is ${formatAmount(submission.claimed_amount)}`;
  return sum === claimed
    ? { name, status: "pass", detail: summary }
    : { name, status: "fail", detail: `${summary} — the difference is ${formatAmount((claimed - sum) / 100)}` };
}

function firstAmountOnLine(line: string): number | null {
  const currency = line.match(CURRENCY_FIGURE);
  const figure = currency?.[1] ?? currency?.[2] ?? line.match(BARE_FIGURE)?.[0];
  return figure === undefined ? null : Number(figure.replaceAll(",", ""));
}

// The last grand-total line, since receipts print it after any subtotals; failing that, the
// last remaining "total" line.
function findTotalLine(receipt: string): string | undefined {
  const totalLines = receipt.split("\n").filter((line) => TOTAL_LINE.test(line));
  return totalLines.findLast((line) => GRAND_TOTAL_LINE.test(line)) ?? totalLines.at(-1);
}

function checkReceiptTotalMatchesClaim(submission: tExpenseSubmission): tSubmissionCheck {
  const name = "receipt_total_matches_claim";
  const totalLine = findTotalLine(submission.receipt);
  if (totalLine === undefined) {
    return { name, status: "skipped", detail: "the receipt has no TOTAL line to compare against" };
  }
  const total = firstAmountOnLine(totalLine);
  if (total === null) {
    return { name, status: "fail", detail: `the receipt's TOTAL line carries no readable amount: "${totalLine.trim()}"` };
  }
  const summary = `receipt TOTAL reads ${formatAmount(total)}; claimed_amount is ${formatAmount(submission.claimed_amount)}`;
  return toCents(total) === toCents(submission.claimed_amount)
    ? { name, status: "pass", detail: summary }
    : { name, status: "fail", detail: summary };
}

function checkReceiptLegible(submission: tExpenseSubmission): tSubmissionCheck {
  const name = "receipt_legible";
  const markers = [...new Set(submission.receipt.match(ILLEGIBILITY_MARKER) ?? [])];
  return markers.length === 0
    ? { name, status: "pass", detail: "no illegibility markers found in the receipt" }
    : { name, status: "fail", detail: `the receipt contains illegibility markers: ${markers.join(", ")}` };
}

export function validateSubmission(submission: tExpenseSubmission): tSubmissionValidation {
  const checks = [
    checkClaimedAmountPositive(submission),
    checkLineItemsSumMatchesClaim(submission),
    checkReceiptTotalMatchesClaim(submission),
    checkReceiptLegible(submission),
  ];
  return {
    valid: checks.every((check) => check.status !== "fail"),
    currency: submission.currency ?? null,
    checks,
  };
}
