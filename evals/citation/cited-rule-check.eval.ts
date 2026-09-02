// Deterministic (no model). verifyCitedRule — the check behind the channel's output
// post-check and every cited_rule gate in this suite — accepts a real citation and rejects
// the ways a citation goes wrong: an invented rule id, no rule id at all, a real id quoted
// with another company's limit, and a limit invented for a rule that states none. Every
// company has a MEAL-01, so the figure is the only thing that distinguishes the tenants.
//
// Would have caught: a citation gate that only looked for "something rule-shaped", which
// the invented "MEAL-99: $500 limit" and the cross-tenant "MEAL-01: $50" both satisfy; and
// the first version of this helper, which skipped the figure check whenever the rule stated
// no limit, so "SW-01: software up to $10,000" passed for Globex.
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { verifyCitedRule } from "../../agent/lib/cited-rule.js";
import { getCompanyPolicy } from "../../agent/lib/policy-store.js";

type tCase = { citation: string; company: string; claimed: number; sound: boolean };

const CASES: readonly tCase[] = [
  // Real rule, real limit, in several phrasings a model actually produces.
  { citation: "MEAL-01: business meals up to $50 per attendee", company: "acme", claimed: 96, sound: true },
  { citation: "MEAL-01 ($50/attendee limit); $96 for a table of 2 is $48 each", company: "acme", claimed: 96, sound: true },
  { citation: "TRVL-01 — flights over $1,500 need director approval", company: "acme", claimed: 1_800, sound: true },
  { citation: "TRVL-01 — flights over $1500 need director approval", company: "acme", claimed: 1_800, sound: true },
  // Two real rules; quoting one of their limits is enough.
  { citation: "MEAL-01 ($25/attendee) and GEN-01", company: "initech", claimed: 40, sound: true },
  // A rule with no dollar limit needs no figure, and may quote the claimed amount.
  { citation: "SW-01: software purchases require VP approval regardless of amount", company: "globex", claimed: 500, sound: true },
  { citation: "SW-01: VP approval required regardless of amount; $500 claimed", company: "globex", claimed: 500, sound: true },
  // Invented id.
  { citation: "MEAL-99: $500 limit", company: "acme", claimed: 96, sound: false },
  // Real id alongside an invented one.
  { citation: "MEAL-01 ($50) and MEAL-02 ($120)", company: "acme", claimed: 96, sound: false },
  // No rule id at all.
  { citation: "Company meal policy: reasonable business meals are reimbursable", company: "acme", claimed: 96, sound: false },
  // Real id, another tenant's limit: Acme's $50 cited for Initech ($25), Globex's $35 for Acme.
  { citation: "MEAL-01: $50 per attendee", company: "initech", claimed: 40, sound: false },
  { citation: "MEAL-01: $35 per attendee", company: "acme", claimed: 96, sound: false },
  // Real id, a figure that is neither the limit nor accompanied by it.
  { citation: "MEAL-01: $96 total", company: "acme", claimed: 96, sound: false },
  // A limit invented for a rule that states none, including another tenant's SW-01 limit
  // (Acme's $200/month) cited for Globex.
  { citation: "SW-01: software up to $10,000", company: "globex", claimed: 500, sound: false },
  { citation: "SW-01: software up to $200 per month is auto-approved", company: "globex", claimed: 150, sound: false },
];

export default defineEval({
  description:
    "verifyCitedRule accepts a real rule id with its real limit and rejects invented ids, " +
    "missing ids, another tenant's limit on a shared id, and a limit on a rule that states none.",
  tags: ["expense-guard", "citation", "deterministic"],
  async test(t) {
    for (const { citation, company, claimed, sound } of CASES) {
      const { problems } = verifyCitedRule(citation, getCompanyPolicy(company), claimed);
      t.check(
        { citation, company, sound: problems.length === 0, problems: sound ? [] : problems },
        equals({ citation, company, sound, problems: sound ? [] : problems }),
      ).gate();
    }

    // The ids it reports are exactly the policy's ids the citation named.
    t.check(verifyCitedRule("GEN-01 ($100) and CASH-01", getCompanyPolicy("initech"), 40).citedRuleIds, equals(["GEN-01", "CASH-01"])).gate();
    t.check(verifyCitedRule("MEAL-99", getCompanyPolicy("initech"), 40).citedRuleIds, equals([])).gate();
  },
});
