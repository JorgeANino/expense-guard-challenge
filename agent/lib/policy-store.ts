// Loads and searches a company's expense policy for the search_policy tool. Every lookup is
// keyed by the company under review and fails closed: there is no default tenant and no
// cross-review caching (POLICIES is an in-memory map, so a lookup is already O(1)).
import { POLICIES, type tCompanyPolicy, type tPolicyRule } from "./policies.js";

export class UnknownCompanyError extends Error {
  readonly companyId: string;

  constructor(companyId: string) {
    super(`No expense policy is configured for company "${companyId}".`);
    this.name = "UnknownCompanyError";
    this.companyId = companyId;
  }
}

// Own-property check so inherited names ("constructor", "toString") are not tenants.
export function hasCompanyPolicy(companyId: string): boolean {
  return Object.hasOwn(POLICIES, companyId);
}

export function getCompanyPolicy(companyId: string): tCompanyPolicy {
  const policy = hasCompanyPolicy(companyId) ? POLICIES[companyId] : undefined;
  if (!policy) throw new UnknownCompanyError(companyId);
  return policy;
}

// Rules whose category or text mention the topic; the whole policy when nothing matches, so
// the model always has real rules to reason against rather than an empty result.
function selectRules(policy: tCompanyPolicy, topic: string | undefined): tPolicyRule[] {
  if (!topic) return policy.rules;
  const needle = topic.toLowerCase();
  const hits = policy.rules.filter(
    (rule) =>
      rule.category.toLowerCase().includes(needle) || rule.text.toLowerCase().includes(needle),
  );
  return hits.length > 0 ? hits : policy.rules;
}

export function searchPolicy(
  companyId: string,
  topic: string | undefined,
): { company_name: string; rules: string } {
  const policy = getCompanyPolicy(companyId);
  return { company_name: policy.company_name, rules: formatRules(selectRules(policy, topic)) };
}

export function formatRules(rules: tPolicyRule[]): string {
  return rules.map((rule) => `[${rule.id}] (${rule.category}) ${rule.text}`).join("\n");
}
