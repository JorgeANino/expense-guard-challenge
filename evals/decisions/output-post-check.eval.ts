// Deterministic (no model). The channel's output post-check passes a consistent decision
// through unchanged, forgives case and whitespace in the echoed category, and degrades to
// flag_for_review — never refuses, never leaves an approve standing — a decision that
// describes different facts than the submission (another category or amount) or whose
// cited rule does not check out, reporting the problems beside it.
//
// Would have caught: the channel returning the model's echo of category, claimed_amount and
// cited_rule unverified, so an approve citing another tenant's limit reached the caller; and
// a strict category comparison that refused a correct decision over "Meals" vs "meals".
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { postCheckDecision } from "../../agent/lib/decision-post-check.js";
import type { tExpenseDecision } from "../../agent/lib/expense.schema.js";
import { getCompanyPolicy } from "../../agent/lib/policy-store.js";
import { loadFixture } from "../lib/fixtures.js";

export default defineEval({
  description:
    "The output post-check passes a consistent approve through, tolerates a re-cased category, " +
    "and degrades other facts or an unverifiable citation to flag_for_review with the problems " +
    "reported, never refusing a parsed decision.",
  tags: ["expense-guard", "decisions", "deterministic"],
  async test(t) {
    const submission = loadFixture("valid.json");
    const policy = getCompanyPolicy(submission.company_id);
    const approve: tExpenseDecision = {
      decision: "approve",
      reason: "Two attendees at $48 each, under the $50 per-attendee limit.",
      cited_rule: "MEAL-01: business meals up to $50 per attendee",
      category: submission.category,
      claimed_amount: submission.claimed_amount,
    };

    // A sound decision passes through unchanged.
    t.check(postCheckDecision(approve, submission, policy), equals({ decision: approve, problems: [] })).gate();

    // Case and surrounding whitespace in the echoed category are not a different expense.
    for (const category of ["Meals", " meals ", "MEALS"]) {
      const recased = { ...approve, category };
      t.check(postCheckDecision(recased, submission, policy), equals({ decision: recased, problems: [] })).gate();
    }

    // Facts that are not the submission's degrade to flag_for_review with the mismatch
    // reported, whatever the model decided; the request is not refused.
    for (const [name, decision] of Object.entries({
      "other category": { ...approve, category: "travel" },
      "other amount": { ...approve, claimed_amount: 9.6 },
      "reject about other amount": { ...approve, decision: "reject" as const, claimed_amount: 960 },
    })) {
      const checked = postCheckDecision(decision, submission, policy);
      t.check(
        { name, decision: checked.decision.decision, reported: checked.problems.length > 0 },
        equals({ name, decision: "flag_for_review", reported: true }),
      ).gate();
    }

    // An unverifiable citation keeps the decision but never as an approve; the problems
    // are reported so the reviewer sees why.
    for (const [name, cited_rule] of Object.entries({
      "another tenant's limit": "MEAL-01: $35 per attendee",
      "invented rule": "MEAL-99: $500 limit",
      "no rule id": "Company meal policy",
    })) {
      const checked = postCheckDecision({ ...approve, cited_rule }, submission, policy);
      t.check(
        { name, decision: checked.decision.decision, reported: checked.problems.length > 0 },
        equals({ name, decision: "flag_for_review", reported: true }),
      ).gate();
    }

    // A reject with a bad citation is also sent to a human rather than trusted.
    const reject = postCheckDecision({ ...approve, decision: "reject", cited_rule: "ALC-99" }, submission, policy);
    t.check(reject.decision.decision, equals("flag_for_review")).gate();

    // Both kinds of problem are reported together when both occur: one fact mismatch plus
    // one citation problem (a real id with another tenant's limit).
    const both = postCheckDecision({ ...approve, category: "travel", cited_rule: "MEAL-01: $35 per attendee" }, submission, policy);
    t.check({ decision: both.decision.decision, problems: both.problems.length }, equals({ decision: "flag_for_review", problems: 2 })).gate();
  },
});
