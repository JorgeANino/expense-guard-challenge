// Dynamic instructions resolver. Runs at turn open, resolves the submission from the
// channel metadata (or the fixture in dev / eval), seeds it into submissionState so
// tools can read the authoritative fields, and renders the system prompt.
import { defineDynamic, defineInstructions } from "eve/instructions";
import { buildSystemPrompt } from "../lib/build-instructions.js";
import { resolveExpenseSubmission, submissionState } from "../lib/request-context.js";

export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => {
      const submission = resolveExpenseSubmission(ctx.channel.metadata);
      submissionState.update(() => submission);
      return defineInstructions({ markdown: buildSystemPrompt(submission, new Date()) });
    },
  },
});
