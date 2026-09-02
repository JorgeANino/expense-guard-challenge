// Retrieves the written expense policy of the company under review for the model to reason
// against. The company comes from the server-seeded submission, never from the model: the
// receipt is untrusted text, so a model-chosen company_id could be steered into another
// tenant's policy.
import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchPolicy } from "../lib/policy-store.js";
import { requireSubmission } from "../lib/request-context.js";

export default defineTool({
  description:
    "Look up the expense policy rules of the company whose submission is under review. " +
    "Pass an optional topic (a category or keyword) to narrow the rules returned, " +
    "e.g. 'meals', 'travel', 'software', 'alcohol'.",
  inputSchema: z.object({
    topic: z
      .string()
      .optional()
      .describe("Optional category or keyword to narrow the rules returned."),
  }),
  async execute({ topic }) {
    return searchPolicy(requireSubmission().company_id, topic);
  },
});
