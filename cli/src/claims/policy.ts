/**
 * Policy aggregation engine — pure rule engine, no LLM.
 *
 * Input: all Verdicts + associated EvidenceSpans for one Claim
 * Output: a Review with decision and matched rule
 *
 * Rules are evaluated in order, first match wins.
 */

import {
  Verdict,
  EvidenceSpan,
  Review,
  ReviewStatus,
  ReviewChecks,
  ReviewConflict,
} from './types.js';

// ── Input ───────────────────────────────────────────────────────────

export interface PolicyInput {
  claimId: string;
  riskLevel: 'low' | 'medium' | 'high';
  verdicts: Verdict[];
  evidences: EvidenceSpan[];
}

// ── Rule definition ─────────────────────────────────────────────────

interface Rule {
  name: string;
  evaluate(input: PolicyInput): ReviewStatus | null;
}

/**
 * Evaluate deterministic checks for a set of verdicts + evidences.
 */
function computeChecks(verdicts: Verdict[], evidences: EvidenceSpan[]): ReviewChecks {
  const stanceCounts = { support: 0, refute: 0, insufficient: 0 };
  for (const v of verdicts) {
    stanceCounts[v.stance]++;
  }

  // Domain-level source independence: count publisher-domain cluster IDs.
  const uniqueSources = new Set(
    evidences
      .filter(e => e.sourceClusterId)
      .map(e => e.sourceClusterId!)
  );
  const sourceIndependent = uniqueSources.size >= 2;

  return {
    sourceIndependent,
    hasRefute: stanceCounts.refute > 0,
    allSupport: stanceCounts.support > 0 && stanceCounts.refute === 0 && stanceCounts.insufficient === 0,
  };
}

/**
 * Build conflict info from verdicts+evidences for refute scenarios.
 */
function buildConflict(verdicts: Verdict[], evidences: EvidenceSpan[]): ReviewConflict | undefined {
  const refutingVerdicts = verdicts.filter(v => v.stance === 'refute');
  const supportingVerdicts = verdicts.filter(v => v.stance === 'support');

  if (refutingVerdicts.length === 0) return undefined;

  const supportingQuotes = supportingVerdicts
    .slice(0, 5)
    .map(v => {
      const ev = evidences.find(e => v.evidenceIds.includes(e.id));
      return `${v.id}: ${ev?.quote.slice(0, 100) || 'no quote'}`;
    });

  const refutingQuotes = refutingVerdicts
    .slice(0, 5)
    .map(v => {
      const ev = evidences.find(e => v.evidenceIds.includes(e.id));
      return `${v.id}: ${ev?.quote.slice(0, 100) || 'no quote'}`;
    });

  return {
    summary: `Claim is supported by ${supportingVerdicts.length} evidence(s) and refuted by ${refutingVerdicts.length} evidence(s)`,
    supporting: supportingQuotes,
    refuting: refutingQuotes,
  };
}

// ── Rules (evaluated in order) ──────────────────────────────────────

const RULES: Rule[] = [
  // #1 singleRefute: any refute → needsReview
  {
    name: 'singleRefute',
    evaluate(input) {
      const hasRefute = input.verdicts.some(v => v.stance === 'refute');
      return hasRefute ? 'needsReview' : null;
    },
  },

  // #2 highRiskInsufficient: high risk + <2 publisher domains → needsReview
  {
    name: 'highRiskInsufficient',
    evaluate(input) {
      if (input.riskLevel !== 'high') return null;
      const uniqueSources = new Set(
        input.evidences.filter(e => e.sourceClusterId).map(e => e.sourceClusterId!)
      );
      if (uniqueSources.size < 2) return 'needsReview';
      return null;
    },
  },

  // #3 dualSourceSupport: >= 2 publisher domains + all support → approved
  {
    name: 'dualSourceSupport',
    evaluate(input) {
      const uniqueSources = new Set(
        input.evidences.filter(e => e.sourceClusterId).map(e => e.sourceClusterId!)
      );
      if (uniqueSources.size < 2) return null;
      const allSupport = input.verdicts.every(v => v.stance === 'support');
      if (allSupport) return 'approved';
      return null;
    },
  },

  // #4 dualSourceMixed: >= 2 publisher domains but some insufficient → needsReview
  {
    name: 'dualSourceMixed',
    evaluate(input) {
      const uniqueSources = new Set(
        input.evidences.filter(e => e.sourceClusterId).map(e => e.sourceClusterId!)
      );
      if (uniqueSources.size < 2) return null;
      const hasInsufficient = input.verdicts.some(v => v.stance === 'insufficient');
      if (hasInsufficient) return 'needsReview';
      return null;
    },
  },

  // #5 singleSource: only 1 publisher domain → needsReview
  {
    name: 'singleSource',
    evaluate(input) {
      const uniqueSources = new Set(
        input.evidences.filter(e => e.sourceClusterId).map(e => e.sourceClusterId!)
      );
      if (uniqueSources.size === 1) return 'needsReview';
      return null;
    },
  },

  // #6 allInsufficient: all verdicts are insufficient → needsReview
  {
    name: 'allInsufficient',
    evaluate(input) {
      if (input.verdicts.length === 0) return null;
      const allInsufficient = input.verdicts.every(v => v.stance === 'insufficient');
      return allInsufficient ? 'needsReview' : null;
    },
  },

  // #7 fallback: catch-all
  {
    name: 'fallback',
    evaluate() {
      return 'needsReview';
    },
  },
];

// ── Aggregation ─────────────────────────────────────────────────────

/**
 * Run all rules against a single claim's data and produce a Review.
 */
export function aggregateClaim(input: PolicyInput): Review {
  const checks = computeChecks(input.verdicts, input.evidences);

  let decision: ReviewStatus = 'needsReview';
  let matchedRule = 'fallback';

  for (const rule of RULES) {
    const result = rule.evaluate(input);
    if (result !== null) {
      decision = result;
      matchedRule = rule.name;
      break;
    }
  }

  const review: Review = {
    claimId: input.claimId,
    decision,
    autoPass: decision === 'approved',
    checks,
    matchedRule,
    reviewer: 'agent',
    reviewedAt: Date.now(),
  };

  // Populate conflict only when refute exists
  if (checks.hasRefute) {
    review.conflict = buildConflict(input.verdicts, input.evidences);
  }

  return review;
}

/**
 * Aggregate all claims that have verdicts but no review yet.
 * Returns the new reviews.
 */
export function aggregateAll(
  claimVerdicts: Array<PolicyInput>
): Review[] {
  return claimVerdicts.map(aggregateClaim);
}
