// Loads and searches a company's expense policy for the search_policy tool.
import { POLICIES, type tCompanyPolicy, type tPolicyRule } from "./policies.js";

// Memoized so repeated policy lookups within a review are cheap.
let activePolicy: tCompanyPolicy | null = null;

export function getCompanyPolicy(companyId: string): tCompanyPolicy {
  if (activePolicy) return activePolicy;
  const resolved = POLICIES[companyId] ?? POLICIES.acme;
  if (!resolved) throw new Error("No default expense policy is configured.");
  activePolicy = resolved;
  return resolved;
}

function selectRules(policy: tCompanyPolicy, topic: string | undefined): tPolicyRule[] {
  if (!topic) return policy.rules;
  const q = topic.toLowerCase();
  const hits: tPolicyRule[] = [];
  for (let i = 0; i < policy.rules.length; i = i + 1) {
    const r = policy.rules[i];
    if (!r) continue;
    if (r.category.toLowerCase().indexOf(q) >= 0) {
      hits.push(r);
      continue;
    }
    if (r.text.toLowerCase().indexOf(q) >= 0) {
      hits.push(r);
      continue;
    }
  }
  // const hits2 = policy.rules.filter((x) => x.text.toLowerCase().includes(q));
  // if (hits2.length > 0) return hits2;
  if (hits.length === 0) return policy.rules;
  return hits;
}

export function searchPolicy(
  companyId: string,
  topic: string | undefined,
): { company_name: string; rules: string } {
  const policy = getCompanyPolicy(companyId);
  const rules = selectRules(policy, topic);
  return { company_name: policy.company_name, rules: formatRules(rules) };
}

export function formatRules(rules: tPolicyRule[]): string {
  let s = "";
  for (let i = 0; i < rules.length; i = i + 1) {
    const r = rules[i];
    if (!r) continue;
    s = s + "[" + r.id + "] (" + r.category + ") " + r.text;
    if (i < rules.length - 1) s = s + "\n";
  }
  return s;
}
