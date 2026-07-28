/**
 * evidence-search / evidence-verify / evidence-list — Evidence subcommands.
 */

import {
  EvidenceSpan,
  Verdict,
} from '../claims/types.js';
import {
  loadEvidences,
  saveEvidences,
  nextEvidenceId,
  loadVerdicts,
  saveVerdicts,
  nextVerdictId,
  loadClaims,
  loadReviews,
  saveReviews,
} from '../claims/store.js';
import { aggregateClaim, PolicyInput } from '../claims/policy.js';
import { computeSourceClusterId } from '../claims/deterministic-checks.js';
import { resolveSessionPath, loadSessionResults, hasVerifiedContent } from '../deep/session.js';
import { createSuccessEnvelope, createErrorEnvelope } from '../protocol.js';
import { searchCandidates } from '../claims/deterministic-checks.js';
import { isJsonObject, readSingleJsonInput } from './json-input.js';

// ── evidence-search ─────────────────────────────────────────────────

export async function runEvidenceSearch(
  session: string,
  options: {
    claimId: string;
    format?: string;
  }
): Promise<number> {
  const sessionDir = resolveSessionPath(session);

  // Load the claim to get its text
  const claims = loadClaims(sessionDir);
  const claim = claims.find(c => c.id === options.claimId);
  if (!claim) {
    console.log(JSON.stringify(createErrorEnvelope('CLAIM_NOT_FOUND', `Claim ${options.claimId} not found`), null, 2));
    return 1;
  }

  const candidates = searchCandidates(sessionDir, claim.text);

  const outputFormat = options.format || 'json';
  if (outputFormat === 'md') {
    console.log(`## Evidence Candidates for ${options.claimId}\n`);
    if (candidates.length === 0) {
      console.log('No candidates found.');
    }
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      console.log(`**${i + 1}.** [${c.domain}](${c.resultUrl})`);
      console.log(`   ${c.quote.slice(0, 200)}`);
      console.log(`   offset: ${c.charStart}-${c.charEnd}`);
      console.log('');
    }
  } else {
    console.log(JSON.stringify(createSuccessEnvelope({ candidates }), null, 2));
  }

  return 0;
}

// ── evidence-verify ─────────────────────────────────────────────────

interface EvidenceInput {
  resultUrl: string;
  quote: string;
  charStart: number;
  charEnd: number;
  contentHash?: string;  // computed if omitted
}

export async function runEvidenceVerify(
  session: string,
  options: {
    claimId: string;
    evidence?: string;    // JSON
    evidenceFile?: string;
    stance: 'support' | 'refute' | 'insufficient';
    reason: string;
    confidence?: number;
    complete?: boolean;
    format?: string;
  }
): Promise<number> {
  const sessionDir = resolveSessionPath(session);

  const input = readSingleJsonInput([
    { option: '--evidence', value: options.evidence },
    { option: '--evidence-file', value: options.evidenceFile, file: true },
  ]);
  if (!input.ok) {
    console.log(JSON.stringify(createErrorEnvelope(input.code, input.message), null, 2));
    return 1;
  }
  if (!isJsonObject(input.value)) {
    console.log(JSON.stringify(createErrorEnvelope('INVALID_EVIDENCE', '--evidence must be a JSON object'), null, 2));
    return 1;
  }
  const evInput: EvidenceInput = {
    resultUrl: input.value.resultUrl as string,
    quote: input.value.quote as string,
    charStart: input.value.charStart as number,
    charEnd: input.value.charEnd as number,
    contentHash: typeof input.value.contentHash === 'string' ? input.value.contentHash : undefined,
  };

  // Validate required fields
  if (typeof evInput.resultUrl !== 'string' || typeof evInput.quote !== 'string'
      || !Number.isSafeInteger(evInput.charStart) || !Number.isSafeInteger(evInput.charEnd)) {
    console.log(JSON.stringify(createErrorEnvelope('MISSING_FIELDS', '--evidence must contain string resultUrl and quote plus integer charStart and charEnd'), null, 2));
    return 1;
  }

  // Verify the claim exists
  const claims = loadClaims(sessionDir);
  const claim = claims.find(c => c.id === options.claimId);
  if (!claim) {
    console.log(JSON.stringify(createErrorEnvelope(
      'CLAIM_NOT_FOUND', `Claim ${options.claimId} not found`), null, 2));
    return 1;
  }

  // Deterministic checks: anchor the evidence
  const sessionResults = loadSessionResults(sessionDir);
  const approvedResults = sessionResults.filter(r => r.status === 'approved');
  const result = approvedResults.find(r => r.url === evInput.resultUrl);

  if (!result) {
    console.log(JSON.stringify(createErrorEnvelope('URL_NOT_APPROVED', `Result URL ${evInput.resultUrl} is not in approved results`), null, 2));
    return 1;
  }

  if (!hasVerifiedContent(result)) {
    console.log(JSON.stringify(createErrorEnvelope('RESULT_NOT_VERIFIED', 'Approved result has no verified extracted content; re-extract the source before verifying evidence'), null, 2));
    return 1;
  }

  const content = result.content;
  if (evInput.charEnd > content.length || evInput.charStart < 0) {
    console.log(JSON.stringify(createErrorEnvelope('OFFSET_OUT_OF_RANGE', `charStart/charEnd out of range (content length: ${content.length})`), null, 2));
    return 1;
  }
  // Verify content hash
  const { createHash } = await import('crypto');
  const slice = content.slice(evInput.charStart, evInput.charEnd);
  if (slice !== evInput.quote) {
    console.log(JSON.stringify(createErrorEnvelope('QUOTE_MISMATCH', 'Quote does not match source content at the provided offsets'), null, 2));
    return 1;
  }
  const computedHash = createHash('sha256').update(slice).digest('hex');
  const providedHash = evInput.contentHash || computedHash;
  if (providedHash !== computedHash) {
    console.log(JSON.stringify(createErrorEnvelope('HASH_MISMATCH', 'Content hash mismatch — quote does not match source'), null, 2));
    return 1;
  }

  // All checks passed — write evidence
  const now = Date.now();
  const evId = nextEvidenceId(sessionDir);

  const evidence: EvidenceSpan = {
    id: evId,
    claimId: options.claimId,
    resultUrl: evInput.resultUrl,
    quote: evInput.quote,
    charStart: evInput.charStart,
    charEnd: evInput.charEnd,
    contentHash: computedHash,
    extractedAt: result.extractedAt,
    sourceClusterId: undefined, // computed during policy-aggregate
  };

  const existingEvs = loadEvidences(sessionDir);
  saveEvidences(sessionDir, [...existingEvs, evidence]);

  // Write verdict alongside evidence
  const vdId = nextVerdictId(sessionDir);
  const verdict: Verdict = {
    id: vdId,
    claimId: options.claimId,
    evidenceIds: [evId],
    stance: options.stance,
    confidence: options.confidence,
    reason: options.reason,
    createdAt: now,
  };

  const existingVds = loadVerdicts(sessionDir);
  saveVerdicts(sessionDir, [...existingVds, verdict]);

  // Update claim status to verifying
  claim.status = 'verifying';
  const { saveClaims } = await import('../claims/store.js');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  saveClaims(sessionDir, claims);

  // If --complete, trigger policy aggregation
  let review = undefined;
  if (options.complete) {
    // Gather all evidence and verdicts for this claim
    const storedEvidences = loadEvidences(sessionDir);
    const allEvs = storedEvidences.filter(e => e.claimId === options.claimId);
    const allVds = loadVerdicts(sessionDir).filter(v => v.claimId === options.claimId);

    // Refresh source cluster IDs using the current publisher-domain rule.
    for (const ev of allEvs) {
      ev.sourceClusterId = computeSourceClusterId(ev);
    }
    saveEvidences(sessionDir, storedEvidences);

    const input: PolicyInput = {
      claimId: options.claimId,
      riskLevel: claim.riskLevel,
      verdicts: allVds,
      evidences: allEvs,
    };

    const result = aggregateClaim(input);

    // Update claim status
    claim.status = 'reviewed';
    saveClaims(sessionDir, claims);

    // Persist review
    const existingReviews = loadReviews(sessionDir);
    saveReviews(sessionDir, [...existingReviews, result]);

    review = result;
  }

  const output = {
    evidence: { id: evId, claimId: options.claimId },
    verdict: { id: vdId, stance: options.stance },
    ...(review ? { review: { claimId: review.claimId, decision: review.decision, matchedRule: review.matchedRule, autoPass: review.autoPass } } : {}),
  };

  const outputFormat = options.format || 'json';
  if (outputFormat === 'md') {
    console.log('## Evidence-Verify Result\n');
    console.log(`**Evidence**: ${evId} → ${options.claimId}`);
    console.log(`**Verdict**: ${vdId} — ${options.stance}`);
    if (review) {
      console.log(`**Review**: ${review.decision} (rule: ${review.matchedRule}, autoPass: ${review.autoPass})`);
    }
  } else {
    console.log(JSON.stringify(createSuccessEnvelope(output), null, 2));
  }

  return 0;
}

// ── evidence-list ───────────────────────────────────────────────────

export async function runEvidenceList(
  session: string,
  options: {
    claimId: string;
    format?: string;
  }
): Promise<number> {
  const sessionDir = resolveSessionPath(session);
  const evidences = loadEvidences(sessionDir).filter(e => e.claimId === options.claimId);

  const outputFormat = options.format || 'json';
  if (outputFormat === 'md') {
    if (evidences.length === 0) {
      console.log('No evidence found for this claim.');
      return 0;
    }
    console.log('## Evidence\n');
    console.log('| ID | Source | Quote |');
    console.log('|----|--------|-------|');
    for (const e of evidences) {
      console.log(`| ${e.id} | ${e.resultUrl} | ${e.quote.slice(0, 60)}... |`);
    }
  } else {
    console.log(JSON.stringify(createSuccessEnvelope({ evidences }), null, 2));
  }

  return 0;
}
