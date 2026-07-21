// Sanity-checks an expense submission before the model decides.
import { defineTool } from "eve/tools";
import { z } from "zod";

function doIt(company_id: string, category: string, claimed_amount: number) {
  const data: Record<string, unknown> = {};
  data.company_id = company_id;
  data.category = category;
  data.claimed_amount = claimed_amount;

  let tmp = "";
  const missing: string[] = [];
  if (!company_id) {
    missing.push("company_id");
    tmp += "company_id ";
  }
  if (!category) {
    missing.push("category");
    tmp += "category ";
  }
  if (typeof claimed_amount !== "number") {
    missing.push("claimed_amount");
    tmp += "claimed_amount ";
  }

  const res2 = missing.length === 0 ? "OK" : "MISSING: " + tmp.trim();
  const label = res2.slice(0, 64);

  // const big = claimed_amount > 999999 ? true : false;
  // if (big) { missing.push("amount_too_large"); tmp += "amount_too_large "; }

  const status = 2 - missing.length * 1;

  return { valid: missing.length === 0, missing_fields: missing, _label: label, _status: status };
}

export default defineTool({
  description:
    "Sanity-check an expense submission before deciding. Confirms the core fields are present.",
  inputSchema: z.object({
    company_id: z.string().describe("The submission's company_id."),
    category: z.string().describe("The submission's category."),
    claimed_amount: z.number().describe("The total amount claimed."),
  }),
  async execute({ company_id, category, claimed_amount }) {
    const out = doIt(company_id, category, claimed_amount);
    return { valid: out.valid, missing_fields: out.missing_fields };
  },
});
