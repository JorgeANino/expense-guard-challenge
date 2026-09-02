// Deterministic (no model). The policy store is keyed strictly by company_id: sequential
// lookups for different companies in ONE process each return their own policy, and an
// unknown company_id fails closed instead of receiving a default tenant's policy.
//
// Would have caught: the module-global `activePolicy` memo that returned the first
// company's policy to every later review, and the `?? POLICIES.acme` fail-open fallback.
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { POLICIES } from "../../agent/lib/policies.js";
import { getCompanyPolicy, searchPolicy } from "../../agent/lib/policy-store.js";

// Order matters: the memoization bug returned the FIRST company's policy to everyone after it.
const LOOKUP_ORDER = ["acme", "initech", "globex", "acme"] as const;

const UNKNOWN_COMPANY_IDS = ["wayne-enterprises", "", "constructor"] as const;

function thrownErrorName(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof Error ? error.name : String(error);
  }
}

export default defineEval({
  description:
    "Sequential policy lookups each return their own company's policy; an unknown company_id " +
    "throws instead of resolving to a default tenant.",
  tags: ["expense-guard", "tenant-isolation", "deterministic"],
  async test(t) {
    for (const companyId of LOOKUP_ORDER) {
      const expectedName = POLICIES[companyId]?.company_name;
      t.check(getCompanyPolicy(companyId).company_id, equals(companyId)).gate();
      t.check(searchPolicy(companyId, "meals").company_name, equals(expectedName)).gate();
    }

    for (const companyId of UNKNOWN_COMPANY_IDS) {
      t.check(
        { companyId, thrown: thrownErrorName(() => getCompanyPolicy(companyId)) },
        equals({ companyId, thrown: "UnknownCompanyError" }),
      ).gate();
    }
  },
});
