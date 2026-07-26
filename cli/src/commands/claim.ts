/**
 * claim-add / claim-list — Claim subcommands for the review pipeline.
 */

import {
  Claim,
} from '../claims/types.js';
import { EvidenceCandidate } from '../claims/deterministic-checks.js';
import {
  loadClaims,
  saveClaims,
  getClaimsByStatus,
} from '../claims/store.js';
import { searchCandidates } from '../claims/deterministic-checks.js';
import { createSuccessEnvelope, createErrorEnvelope } from '../protocol.js';
import { resolveSessionPath } from '../deep/session.js';

interface ClaimInput {
  text: string;
  subject?: string;
  predicate?: string;
  object?: string;
  time?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

export async function runClaimAdd(
  session: string,
  options: {
    claim?: string;   // single claim JSON
    claims?: string;  // batch claims JSON array
    format?: string;
  }
): Promise<number> {
  const sessionDir = resolveSessionPath(session);

  // Parse input
  let inputs: ClaimInput[] = [];

  if (options.claims) {
    try {
      const parsed = JSON.parse(options.claims);
      if (!Array.isArray(parsed)) {
        console.log(JSON.stringify(createErrorEnvelope('INVALID_CLAIMS', '--claims must be a JSON array', { hint: 'Example: --claims \'[{"text":"..."}]\'' }), null, 2));
        return 1;
      }
      inputs = parsed;
    } catch {
      console.log(JSON.stringify(createErrorEnvelope('INVALID_JSON', 'Failed to parse --claims JSON', { hint: 'Ensure valid JSON array' }), null, 2));
      return 1;
    }
  } else if (options.claim) {
    try {
      const parsed = JSON.parse(options.claim);
      inputs = [parsed];
    } catch {
      console.log(JSON.stringify(createErrorEnvelope('INVALID_JSON', 'Failed to parse --claim JSON', { hint: 'Ensure valid JSON object' }), null, 2));
      return 1;
    }
  } else {
    console.log(JSON.stringify(createErrorEnvelope('MISSING_CLAIM', 'Provide either --claim or --claims', { hint: 'Use: sxng claim-add <session> --claim \'{"text":"..."}\'' }), null, 2));
    return 1;
  }

  // Validate required fields
  for (let i = 0; i < inputs.length; i++) {
    if (!inputs[i].text || typeof inputs[i].text !== 'string') {
      console.log(JSON.stringify(createErrorEnvelope('MISSING_TEXT', `Entry ${i} is missing required field "text"`), null, 2));
      return 1;
    }
  }

  const now = Date.now();
  const existing = loadClaims(sessionDir);
  const newClaims: Claim[] = [];
  const candidates: Record<string, EvidenceCandidate[]> = {};

  for (const [index, input] of inputs.entries()) {
    const id = `cl_${String(existing.length + index + 1).padStart(3, '0')}`;
    const claim: Claim = {
      id,
      text: input.text,
      subject: input.subject,
      predicate: input.predicate,
      object: input.object,
      time: input.time,
      riskLevel: input.riskLevel || 'medium',
      status: 'pending',
      sessionDir,
      createdAt: now,
    };
    newClaims.push(claim);

    // Auto-trigger evidence search
    candidates[id] = searchCandidates(sessionDir, claim.text);
  }

  // Append to existing claims
  saveClaims(sessionDir, [...existing, ...newClaims]);

  const result: Record<string, any> = {
    claims: newClaims.map(c => ({ id: c.id, text: c.text, status: c.status })),
    candidates,
  };

  const outputFormat = options.format || 'json';
  if (outputFormat === 'md') {
    console.log('## Claim-Add Results\n');
    for (const c of newClaims) {
      console.log(`**${c.id}**: ${c.text}`);
      console.log(`- Status: ${c.status}, Risk: ${c.riskLevel}`);
      const cs = candidates[c.id] || [];
      if (cs.length > 0) {
        console.log(`- Candidates: ${cs.length} found`);
        for (const cand of cs) {
          console.log(`  - [${cand.domain}] ${cand.quote.slice(0, 80)}...`);
        }
      } else {
        console.log('- Candidates: none');
      }
      console.log('');
    }
  } else {
    console.log(JSON.stringify(createSuccessEnvelope(result), null, 2));
  }

  return 0;
}

export async function runClaimList(
  session: string,
  options: {
    status?: string;
    format?: string;
  }
): Promise<number> {
  const sessionDir = resolveSessionPath(session);

  const statusFilter = options.status as Claim['status'] | undefined;
  const claims = getClaimsByStatus(sessionDir, statusFilter);
  const outputFormat = options.format || 'json';

  if (outputFormat === 'md') {
    if (claims.length === 0) {
      console.log('No claims found.');
      return 0;
    }
    console.log('## Claims\n');
    console.log('| ID | Text | Status | Risk |');
    console.log('|---:|------|--------|------|');
    for (const c of claims) {
      console.log(`| ${c.id} | ${c.text} | ${c.status} | ${c.riskLevel} |`);
    }
  } else {
    console.log(JSON.stringify(createSuccessEnvelope({ claims }), null, 2));
  }

  return 0;
}
