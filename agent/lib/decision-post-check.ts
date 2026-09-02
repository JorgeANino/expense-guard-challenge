// Deterministic post-check the review channel runs on the model's decision before it is
// returned. The model's output is a recommendation, not a verdict: the facts it echoes
// (category, claimed amount) must be the submission's own, and the rule it cites must be
// one the submitting company's policy really states. Pure, no model.
//
// Asymmetric fallback: a decision that parsed is never refused here, and never upgraded.
// Any problem — echoed facts that are not the submission's, or a citation that does not
// check out — degrades the decision to flag_for_review, never approve, and the problems
// travel with it so a human reviewer sees why. A wrong echo or citation is evidence the
// model may have reviewed the wrong thing, which is a reason to have a human look, not a
// reason to fail the request.
import { verifyCitedRule } from "./cited-rule.js";
import type { tExpenseDecision } from "./expense.schema.js";
import type { tCompanyPolicy } from "./policies.js";
import type { tExpenseSubmission } from "./request-context.js";

export type tDecisionPostCheck = {
  decision: tExpenseDecision;
  // Empty when the decision was returned as the model emitted it.
  problems: string[];
};

// The schema asks for the category verbatim; letter case and surrounding whitespace are
// still forgiven so "Meals" is not treated as a different expense than "meals".
function sameCategory(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function factProblems(decision: tExpenseDecision, submission: tExpenseSubmission): string[] {
  const problems: string[] = [];
  if (!sameCategory(decision.category, submission.category)) {
    problems.push(
      `the decision is about category "${decision.category}" but the submission is "${submission.category}"`,
    );
  }
  if (decision.claimed_amount !== submission.claimed_amount) {
    problems.push(
      `the decision is about a claimed amount of ${decision.claimed_amount} but the submission claims ${submission.claimed_amount}`,
    );
  }
  return problems;
}

export function postCheckDecision(
  decision: tExpenseDecision,
  submission: tExpenseSubmission,
  policy: tCompanyPolicy,
): tDecisionPostCheck {
  const problems = [
    ...factProblems(decision, submission),
    ...verifyCitedRule(decision.cited_rule, policy, submission.claimed_amount).problems,
  ];
  if (problems.length === 0) return { decision, problems };
  return { decision: { ...decision, decision: "flag_for_review" }, problems };
}
