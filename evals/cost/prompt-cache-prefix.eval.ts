// Deterministic (no model). The system instructions are cache-friendly: the review guide
// is a static block with no per-review content, the per-review block carries only the
// submission and the calendar date, and two reviews on the same day share a byte-identical
// prefix up to the submission JSON.
//
// Would have caught: buildSystemPrompt rendering the submission and a millisecond
// timestamp FIRST, inside the same block as the static guide, so no two reviews — not even
// an identical resubmission — could share a cacheable prefix.
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import reviewGuide from "../../agent/instructions/review-guide.js";
import {
  REVIEW_INSTRUCTIONS,
  buildSubmissionInstructions,
  formatCalendarDate,
} from "../../agent/lib/build-instructions.js";
import { loadFixture } from "../lib/fixtures.js";

// Everything before the submission JSON is the shared prefix of the per-review block.
function prefixBeforeSubmissionJson(block: string): string {
  return block.slice(0, block.indexOf("{"));
}

const MORNING = new Date("2026-08-29T08:15:00.000Z");
const EVENING_SAME_DAY = new Date("2026-08-29T21:45:12.345Z");

export default defineEval({
  description:
    "Static review guide and per-review submission block are separate; the submission block " +
    "is date-only (no timestamp) so same-day reviews share an identical prefix.",
  tags: ["expense-guard", "cost", "deterministic"],
  async test(t) {
    const acme = loadFixture("request.json");
    const other = loadFixture("cross-company.json");

    // The static block really is static: it is what the instructions slot serves, and it
    // contains nothing from any submission.
    t.check(reviewGuide.markdown, equals(REVIEW_INSTRUCTIONS)).gate();
    for (const submission of [acme, other]) {
      t.check(REVIEW_INSTRUCTIONS.includes(submission.company_id), equals(false)).gate();
      t.check(REVIEW_INSTRUCTIONS.includes(submission.receipt), equals(false)).gate();
    }

    // The per-review block does not drag the static guide along with it.
    const acmeBlock = buildSubmissionInstructions(acme, MORNING);
    t.check(acmeBlock.includes("Decision rubric"), equals(false)).gate();
    // The receipt is rendered inside the JSON payload, so match its JSON-encoded form.
    t.check(acmeBlock.includes(JSON.stringify(acme.receipt)), equals(true)).gate();

    // Only the calendar day is rendered — never the time.
    t.check(formatCalendarDate(EVENING_SAME_DAY), equals("2026-08-29")).gate();
    t.check(acmeBlock.includes("T08:15"), equals(false)).gate();

    // An identical resubmission later the same day renders byte-identically...
    t.check(buildSubmissionInstructions(acme, EVENING_SAME_DAY), equals(acmeBlock)).gate();

    // ...and a different company's review on the same day shares the whole prefix up to
    // the submission JSON.
    const otherBlock = buildSubmissionInstructions(other, EVENING_SAME_DAY);
    t.check(prefixBeforeSubmissionJson(otherBlock), equals(prefixBeforeSubmissionJson(acmeBlock))).gate();
    t.check(otherBlock === acmeBlock, equals(false)).gate();
  },
});
