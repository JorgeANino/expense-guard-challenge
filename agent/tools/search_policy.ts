// Retrieves a company's written expense policy rules for the model to reason against.
import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchPolicy } from "../lib/policy-store.js";

export default defineTool({
  description:
    "Look up the expense policy rules for a company. Pass the company_id from the submission " +
    "under review and an optional topic (a category or keyword) to narrow the rules returned, " +
    "e.g. 'meals', 'travel', 'software', 'alcohol'.",
  inputSchema: z.object({
    company_id: z.string().min(1).describe("The company_id of the submission under review."),
    topic: z
      .string()
      .optional()
      .describe("Optional category or keyword to narrow the rules returned."),
  }),
  async execute({ company_id, topic }) {
    return searchPolicy(company_id, topic);
  },
});
