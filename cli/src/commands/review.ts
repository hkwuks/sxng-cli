/**
 * policy-aggregate / review-list — Review policy subcommands.
 */

import {
  loadClaims,
  loadReviews,
  loadEvidences,
  loadVerdicts,
  saveReviews,
  saveClaims,
  saveEvidences,
} from '../claims/store.js';
import { computeSourceClusterId } from '../claims/deterministic-checks.js';
import { EvidenceSpan } from '../claims/types.js';
import {
  aggregateClaim,
  aggregateAll,
  PolicyInput,
} from '../claims/policy.js';
import { resolveSessionPath } from '../deep/session.js';
import { createSuccessEnvelope } from '../protocol.js';

// ── policy-aggregate ────────────────────────────────────────────────

export async function runPolicyAggregate(
  session: string,
  options: {
    claimId?: string;
    format?: string;
  }
): Promise<number> {
  const sessionDir = resolveSessionPath(session);
  const allClaims = loadClaims(sessionDir);
  const allEvidences = loadEvidences(sessionDir);
  const allVerdicts = loadVerdicts(sessionDir);
  const existingReviews = loadReviews(sessionDir);

  // Determine which claims to aggregate
  let targets = allClaims;
  if (options.claimId) {
    targets = allClaims.filter(c => c.id === options.claimId);
    if (targets.length === 0) {
      console.log(JSON.stringify({ status: 'ok', data: { message: `Claim ${options.claimId} not found` } }));
      return 0;
    }
  }

  // Only aggregate claims that have verdicts
  const reviewable: Array<{ claim: typeof allClaims[0]; input: PolicyInput }> = [];

  for (const claim of targets) {
    const verdicts = allVerdicts.filter(v => v.claimId === claim.id);
    if (verdicts.length === 0) {
      continue; // skip claims without any verdict
    }
    const evidences = allEvidences.filter(e => e.claimId === claim.id);

    // Compute source cluster IDs on demand
    for (const ev of evidences) {
      if (!ev.sourceClusterId) {
        ev.sourceClusterId = computeSourceClusterId(ev);
      }
    }
    // Persist computed cluster IDs
    saveEvidences(sessionDir, allEvidences);

    reviewable.push({
      claim,
      input: {
        claimId: claim.id,
        riskLevel: claim.riskLevel,
        verdicts,
        evidences,
      },
    });
  }

  if (reviewable.length === 0) {
    console.log(JSON.stringify(createSuccessEnvelope({ message: 'No claims with verdicts to aggregate' }), null, 2));
    return 0;
  }

  // Aggregate
  const newReviews = aggregateAll(reviewable.map(r => r.input));

  // Merge with existing reviews (replace any that already exist for same claim)
  const reviewMap = new Map(existingReviews.map(r => [r.claimId, r]));
  for (const review of newReviews) {
    reviewMap.set(review.claimId, review);
  }

  // Update claim statuses to reviewed
  for (const { claim } of reviewable) {
    claim.status = 'reviewed';
  }
  saveClaims(sessionDir, allClaims);

  // Save reviews
  const mergedReviews = Array.from(reviewMap.values());
  saveReviews(sessionDir, mergedReviews);

  // Output
  const outputFormat = options.format || 'json';
  if (outputFormat === 'md') {
    console.log('## Policy Aggregate Results\n');
    console.log(`Aggregated ${newReviews.length} claim(s)\n`);
    console.log('| Claim ID | Decision | Rule | Auto-Pass |');
    console.log('|----------|----------|------|-----------|');
    for (const r of newReviews) {
      console.log(`| ${r.claimId} | ${r.decision} | ${r.matchedRule} | ${r.autoPass} |`);
    }
  } else {
    console.log(JSON.stringify(createSuccessEnvelope({
      aggregated: newReviews.length,
      reviews: newReviews,
    }), null, 2));
  }

  return 0;
}

export async function runReviewList(
  session: string,
  options: {
    status?: string;
    format?: string;
  }
): Promise<number> {
  const sessionDir = resolveSessionPath(session);
  const all = loadReviews(sessionDir);

  const filtered = options.status
    ? all.filter(r => r.decision === options.status)
    : all;

  const outputFormat = options.format || 'json';
  if (outputFormat === 'md') {
    if (filtered.length === 0) {
      console.log('No reviews found.');
      return 0;
    }
    console.log('## Reviews\n');
    console.log('| Claim ID | Decision | Rule | Auto-Pass |');
    console.log('|----------|----------|------|-----------|');
    for (const r of filtered) {
      console.log(`| ${r.claimId} | ${r.decision} | ${r.matchedRule} | ${r.autoPass} |`);
    }
  } else {
    console.log(JSON.stringify(createSuccessEnvelope({ reviews: filtered }), null, 2));
  }

  return 0;
}
