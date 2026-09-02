// Deterministic check that a decision's cited_rule refers to a rule that really exists in
// the submitting company's policy, with the limit that rule really states. Pure, no model.
// Used by the review channel's output post-check and by the citation gates in evals/.
//
// Rule ids alone cannot tell tenants apart: every company in policies.ts has a MEAL-01, at
// $50 (Acme), $35 (Globex) and $25 (Initech) per attendee. The dollar figure in the citation
// is what shows which policy the agent actually read, so when the cited rules state a limit
// the citation must quote one of them, and when they state none the only figure the
// citation may carry is the claimed amount itself.
import type { tCompanyPolicy, tPolicyRule } from "./policies.js";

export type tCitedRuleCheck = {
  // Ids from the company's policy that the citation names.
  citedRuleIds: string[];
  // Empty when the citation is sound; each entry is one human-readable defect.
  problems: string[];
};

// The id shape used throughout policies.ts: a short upper-case prefix, a dash, a number
// (MEAL-01, TRVL-01, CASH-01). Anything of this shape that is not in the policy is invented.
const RULE_ID_SHAPE = /\b[A-Z]{2,6}-\d{2,}\b/g;

// A dollar figure as policies and citations write it: "$50", "$1,500", "$200/month".
const DOLLAR_FIGURE = /\$\s?(\d[\d,]*(?:\.\d+)?)/g;

function dollarFigures(text: string): number[] {
  return [...text.matchAll(DOLLAR_FIGURE)].map((match) => Number(match[1]?.replaceAll(",", "")));
}

function formatDollars(figures: number[]): string {
  return figures.length === 0 ? "no dollar figure" : figures.map((figure) => `$${figure}`).join(", ");
}

// A citation may also quote the claimed amount ("$96 for 2 attendees") or derived arithmetic
// ("$48 each"), so when the cited rules state limits it only has to mention at least ONE of
// them. When none of the cited rules states a figure there is no limit to quote, so any
// figure other than the claimed amount is one the policy does not contain.
function citesTheRuleLimit(citation: string, rules: tPolicyRule[], claimedAmount: number): string | null {
  const ids = rules.map((rule) => rule.id).join(", ");
  const limits = rules.flatMap((rule) => dollarFigures(rule.text));
  const cited = dollarFigures(citation);
  if (limits.length > 0) {
    if (cited.some((figure) => limits.includes(figure))) return null;
    return `cites ${ids} with ${formatDollars(cited)} but ${ids} states ${formatDollars(limits)}`;
  }
  const notTheClaim = cited.filter((figure) => figure !== claimedAmount);
  if (notTheClaim.length === 0) return null;
  return `cites ${ids} with ${formatDollars(notTheClaim)} but ${ids} states no dollar figure (claimed amount is $${claimedAmount})`;
}

export function verifyCitedRule(citation: string, policy: tCompanyPolicy, claimedAmount: number): tCitedRuleCheck {
  const knownIds = new Set(policy.rules.map((rule) => rule.id));
  const namedIds = [...new Set(citation.match(RULE_ID_SHAPE) ?? [])];
  const citedRuleIds = namedIds.filter((id) => knownIds.has(id));
  const inventedIds = namedIds.filter((id) => !knownIds.has(id));

  const problems: string[] = [];
  if (inventedIds.length > 0) {
    problems.push(`cites rule id(s) that are not in ${policy.company_name}'s policy: ${inventedIds.join(", ")}`);
  }
  if (citedRuleIds.length === 0) {
    problems.push(`names no rule id from ${policy.company_name}'s policy`);
  } else {
    const citedRules = policy.rules.filter((rule) => citedRuleIds.includes(rule.id));
    const limitProblem = citesTheRuleLimit(citation, citedRules, claimedAmount);
    if (limitProblem) problems.push(limitProblem);
  }
  return { citedRuleIds, problems };
}
