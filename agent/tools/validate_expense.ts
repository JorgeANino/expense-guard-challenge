// Runs the deterministic sanity checks on the submission under review before the model
// decides. It reads the server-seeded submission rather than model-supplied arguments, so
// an injected receipt cannot swap in a different company, category, or amount — and the
// model cannot "validate" numbers that differ from the real submission.
import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireSubmission } from "../lib/request-context.js";
import { validateSubmission } from "../lib/validate-submission.js";

export default defineTool({
  description:
    "Sanity-check the expense submission under review before deciding. Deterministically " +
    "checks that the claimed amount is positive, that the line items and the receipt's TOTAL " +
    "line add up to the claimed amount, and that the receipt carries no illegibility markers. " +
    "Returns `valid` plus one entry per check (pass / fail / skipped) with the evidence, and " +
    "the receipt currency. Takes no arguments.",
  inputSchema: z.object({}),
  async execute() {
    return validateSubmission(requireSubmission());
  },
});
