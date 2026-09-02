// Dynamic instructions resolver. Runs at turn open, resolves the submission from the
// channel metadata (or the fixture in dev / eval), seeds it into submissionState so
// tools can read the authoritative fields, and renders the per-review system block. The
// static review guide lives in review-guide.ts so this volatile block stays last.
import { defineDynamic, defineInstructions } from "eve/instructions";
import { buildSubmissionInstructions } from "../lib/build-instructions.js";
import { resolveExpenseSubmission, submissionState } from "../lib/request-context.js";

export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => {
      const submission = resolveExpenseSubmission(ctx.channel.metadata);
      submissionState.update(() => submission);
      return defineInstructions({ markdown: buildSubmissionInstructions(submission, new Date()) });
    },
  },
});
