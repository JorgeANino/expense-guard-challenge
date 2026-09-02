// Static instructions: the review guide that is identical for every review. Kept in its
// own system block, ahead of the per-review dynamic block (system.ts), so the prompt cache
// can serve it as a cache read across reviews.
import { defineInstructions } from "eve/instructions";
import { REVIEW_INSTRUCTIONS } from "../lib/build-instructions.js";

export default defineInstructions({ markdown: REVIEW_INSTRUCTIONS });
