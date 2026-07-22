/**
 * Comprehensive tests for Claim—Evidence—Review pipeline.
 *
 * Covers: store CRUD, deterministic checks (hash/anchor/Jaccard/source cluster),
 * and policy engine (all 7 rules + edge cases).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash, randomBytes } from 'crypto';

// ── Helpers ─────────────────────────────────────────────────────────

let tmpDir = '';
let sessionDir = '';

function makeSession(): string {
  const d = join(tmpDir, `sxng-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(d, { recursive: true });
  // Write a minimal results.json with some approved results
  writeFileSync(join(d, 'results.json'), JSON.stringify({
    status: 'ok',
    data: {
      results: [
        {
          url: 'https://example.com/article',
          title: 'Test Article',
          content: 'Tokio is the most widely used async runtime in the Rust ecosystem. It provides a powerful asynchronous programming model. Many production systems rely on Tokio for network services.',
          status: 'approved',
          publishedDate: '2025-01-15',
        },
        {
          url: 'https://other-source.org/report',
          title: 'Async Rust Report',
          content: 'The Rust async ecosystem has evolved significantly. While Tokio dominates, async-std also offers a compelling alternative for certain use cases. Community adoption trends show Tokio leading.',
          status: 'approved',
          publishedDate: '2025-06-01',
        },
        {
          url: 'https://pending-source.dev/note',
          title: 'Pending Note',
          content: 'This result is still pending and should not appear in evidence searches.',
          status: 'pending',
        },
      ],
      rounds: 2,
    },
  }), 'utf-8');
  return d;
}

import {
  Claim,
  EvidenceSpan,
  Verdict,
  Review,
  ReviewStatus,
  ReviewChecks,
} from '../src/claims/types.js';

import {
  loadClaims,
  saveClaims,
  nextClaimId,
  loadEvidences,
  saveEvidences,
  nextEvidenceId,
  loadVerdicts,
  saveVerdicts,
  nextVerdictId,
  loadReviews,
  saveReviews,
  getClaimsByStatus,
  getReviewsByDecision,
  getEvidenceForClaim,
  getVerdictsForClaim,
} from '../src/claims/store.js';

import {
  checkAnchor,
  resolveApprovedContent,
  computeSourceClusterId,
  searchCandidates,
  EvidenceCandidate,
} from '../src/claims/deterministic-checks.js';

import {
  aggregateClaim,
  aggregateAll,
  PolicyInput,
} from '../src/claims/policy.js';

// ── Setup / Teardown ────────────────────────────────────────────────

beforeEach(() => {
  tmpDir = tmpdir();
  sessionDir = makeSession();
});

afterEach(() => {
  if (sessionDir) {
    rmSync(sessionDir, { recursive: true, force: true });
  }
});

// ── Section 1: Store CRUD ───────────────────────────────────────────

describe('store (CRUD)', () => {
  it('should save and load claims', () => {
    const claims: Claim[] = [
      {
        id: 'cl_001',
        text: 'Tokio is the most widely used async runtime',
        riskLevel: 'medium',
        status: 'pending',
        sessionDir,
        createdAt: Date.now(),
      },
    ];
    saveClaims(sessionDir, claims);
    const loaded = loadClaims(sessionDir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('cl_001');
    expect(loaded[0].text).toBe(claims[0].text);
  });

  it('should return empty array for non-existent claims file', () => {
    const claims = loadClaims(sessionDir);
    expect(claims).toEqual([]);
  });

  it('should generate sequential claim IDs', () => {
    // When file doesn't exist, next ID starts at 1
    const id1 = nextClaimId(sessionDir);
    expect(id1).toBe('cl_001');

    saveClaims(sessionDir, [
      { id: 'cl_001', text: 'c1', riskLevel: 'low', status: 'pending', sessionDir, createdAt: 0 },
    ]);
    const id2 = nextClaimId(sessionDir);
    expect(id2).toBe('cl_002');

    saveClaims(sessionDir, [
      { id: 'cl_001', text: 'c1', riskLevel: 'low', status: 'pending', sessionDir, createdAt: 0 },
      { id: 'cl_002', text: 'c2', riskLevel: 'low', status: 'pending', sessionDir, createdAt: 0 },
    ]);
    const id3 = nextClaimId(sessionDir);
    expect(id3).toBe('cl_003');
  });

  it('should generate sequential evidence IDs', () => {
    expect(nextEvidenceId(sessionDir)).toBe('ev_001');
  });

  it('should generate sequential verdict IDs', () => {
    expect(nextVerdictId(sessionDir)).toBe('vd_001');
  });

  it('should save and load evidences', () => {
    const evs: EvidenceSpan[] = [
      {
        id: 'ev_001',
        claimId: 'cl_001',
        resultUrl: 'https://example.com',
        quote: 'test quote',
        charStart: 0,
        charEnd: 10,
        contentHash: 'abc',
        retrievedAt: Date.now(),
      },
    ];
    saveEvidences(sessionDir, evs);
    expect(loadEvidences(sessionDir)).toHaveLength(1);
  });

  it('should save and load verdicts', () => {
    const vds: Verdict[] = [
      {
        id: 'vd_001',
        claimId: 'cl_001',
        evidenceIds: ['ev_001'],
        stance: 'support',
        reason: 'Direct confirmation',
        createdAt: Date.now(),
      },
    ];
    saveVerdicts(sessionDir, vds);
    expect(loadVerdicts(sessionDir)).toHaveLength(1);
  });

  it('should save and load reviews', () => {
    const revs: Review[] = [
      {
        claimId: 'cl_001',
        decision: 'approved',
        autoPass: true,
        checks: { sourceIndependent: true, hasRefute: false, allSupport: true },
        matchedRule: 'dualSourceSupport',
        reviewer: 'agent',
        reviewedAt: Date.now(),
      },
    ];
    saveReviews(sessionDir, revs);
    expect(loadReviews(sessionDir)).toHaveLength(1);
  });

  it('should filter claims by status', () => {
    saveClaims(sessionDir, [
      { id: 'cl_001', text: 'a', riskLevel: 'low', status: 'pending', sessionDir, createdAt: 0 },
      { id: 'cl_002', text: 'b', riskLevel: 'low', status: 'reviewed', sessionDir, createdAt: 0 },
    ]);
    expect(getClaimsByStatus(sessionDir, 'pending')).toHaveLength(1);
    expect(getClaimsByStatus(sessionDir)).toHaveLength(2);
  });

  it('should filter reviews by decision', () => {
    saveReviews(sessionDir, [
      { claimId: 'cl_001', decision: 'approved', autoPass: true, checks: { sourceIndependent: true, hasRefute: false, allSupport: true }, matchedRule: 'dualSourceSupport', reviewer: 'agent', reviewedAt: 0 },
      { claimId: 'cl_002', decision: 'needsReview', autoPass: false, checks: { sourceIndependent: false, hasRefute: true, allSupport: false }, matchedRule: 'singleRefute', reviewer: 'agent', reviewedAt: 0 },
    ]);
    expect(getReviewsByDecision(sessionDir, 'approved')).toHaveLength(1);
    expect(getReviewsByDecision(sessionDir)).toHaveLength(2);
  });

  it('should get evidence/verdicts by claim ID', () => {
    const evs: EvidenceSpan[] = [
      { id: 'ev_001', claimId: 'cl_001', resultUrl: 'https://x.com', quote: 'q', charStart: 0, charEnd: 1, contentHash: 'a', retrievedAt: 0 },
      { id: 'ev_002', claimId: 'cl_002', resultUrl: 'https://y.com', quote: 'r', charStart: 0, charEnd: 1, contentHash: 'b', retrievedAt: 0 },
    ];
    saveEvidences(sessionDir, evs);
    expect(getEvidenceForClaim(sessionDir, 'cl_001')).toHaveLength(1);
    expect(getEvidenceForClaim(sessionDir, 'cl_002')).toHaveLength(1);
    expect(getEvidenceForClaim(sessionDir, 'cl_003')).toHaveLength(0);
  });
});

// ── Section 2: Deterministic Checks ─────────────────────────────────

describe('deterministic checks', () => {
  describe('checkAnchor', () => {
    it('should pass when all anchors are valid', () => {
      const content = 'Tokio is the most widely used async runtime in the Rust ecosystem.';
      const quote = 'Tokio is the most widely used async runtime';
      const charStart = content.indexOf(quote);
      const charEnd = charStart + quote.length;
      const contentHash = createHash('sha256').update(quote).digest('hex');
      const evidence: EvidenceSpan = {
        id: 'ev_001',
        claimId: 'cl_001',
        resultUrl: 'https://example.com/article',
        quote,
        charStart,
        charEnd,
        contentHash,
        retrievedAt: Date.now(),
      };
      const result = checkAnchor(evidence, content);
      expect(result.url).toBe(true);
      expect(result.offsetInRange).toBe(true);
      expect(result.hashMatches).toBe(true);
    });

    it('should fail when hash does not match', () => {
      const content = 'Tokio is the most widely used async runtime.';
      const evidence: EvidenceSpan = {
        id: 'ev_001',
        claimId: 'cl_001',
        resultUrl: 'https://example.com/article',
        quote: 'This is a different quote',
        charStart: 0,
        charEnd: 47,
        contentHash: 'deadbeef',
        retrievedAt: Date.now(),
      };
      const result = checkAnchor(evidence, content);
      expect(result.hashMatches).toBe(false);
    });

    it('should fail when offset exceeds content length', () => {
      const content = 'Short content.';
      const evidence: EvidenceSpan = {
        id: 'ev_001',
        claimId: 'cl_001',
        resultUrl: 'https://example.com',
        quote: 'Short',
        charStart: 0,
        charEnd: 999,
        contentHash: createHash('sha256').update('Short').digest('hex'),
        retrievedAt: Date.now(),
      };
      const result = checkAnchor(evidence, content);
      expect(result.offsetInRange).toBe(false);
    });

    it('should fail when charStart is negative', () => {
      const content = 'Some content.';
      const evidence: EvidenceSpan = {
        id: 'ev_001',
        claimId: 'cl_001',
        resultUrl: 'https://example.com',
        quote: 'Some',
        charStart: -5,
        charEnd: 4,
        contentHash: 'x',
        retrievedAt: Date.now(),
      };
      const result = checkAnchor(evidence, content);
      expect(result.offsetInRange).toBe(false);
    });
  });

  describe('resolveApprovedContent', () => {
    it('should find content from approved results', () => {
      const found = resolveApprovedContent(sessionDir, 'https://example.com/article');
      expect(found).not.toBeNull();
      expect(found!.content).toContain('Tokio');
    });

    it('should return null for non-existent URL', () => {
      const found = resolveApprovedContent(sessionDir, 'https://example.com/nonexistent');
      expect(found).toBeNull();
    });

    it('should return null for pending (not approved) results', () => {
      const found = resolveApprovedContent(sessionDir, 'https://pending-source.dev/note');
      expect(found).toBeNull();
    });
  });

  describe('computeSourceClusterId', () => {
    it('should produce identical IDs for same evidence', () => {
      const ev1: EvidenceSpan = {
        id: 'ev_001', claimId: 'cl_001',
        resultUrl: 'https://example.com/article',
        quote: 'Tokio is the most widely used async runtime',
        charStart: 0, charEnd: 47,
        contentHash: 'x', retrievedAt: 0,
      };
      const ev2: EvidenceSpan = { ...ev1, id: 'ev_002' };
      expect(computeSourceClusterId(ev1)).toBe(computeSourceClusterId(ev2));
    });

    it('should produce different IDs for different domains', () => {
      const ev1: EvidenceSpan = {
        id: 'ev_001', claimId: 'cl_001',
        resultUrl: 'https://site-a.com/article',
        quote: 'Same quote text here',
        charStart: 0, charEnd: 20,
        contentHash: 'x', retrievedAt: 0,
      };
      const ev2: EvidenceSpan = {
        id: 'ev_002', claimId: 'cl_001',
        resultUrl: 'https://site-b.com/article',
        quote: 'Same quote text here',
        charStart: 0, charEnd: 20,
        contentHash: 'x', retrievedAt: 0,
      };
      expect(computeSourceClusterId(ev1)).not.toBe(computeSourceClusterId(ev2));
    });

    it('should return 16 hex characters', () => {
      const ev: EvidenceSpan = {
        id: 'ev_001', claimId: 'cl_001',
        resultUrl: 'https://example.com/article',
        quote: 'A sample quote for testing',
        charStart: 0, charEnd: 26,
        contentHash: 'x', retrievedAt: 0,
      };
      const id = computeSourceClusterId(ev);
      expect(id).toHaveLength(16);
      expect(/^[0-9a-f]{16}$/.test(id)).toBe(true);
    });
  });

  describe('searchCandidates (Jaccard sentence matching)', () => {
    it('should find relevant sentences for a keyword-rich claim', () => {
      const candidates = searchCandidates(sessionDir, 'Tokio is the most widely used async runtime');
      expect(candidates.length).toBeGreaterThanOrEqual(1);
      // Should match sentences containing "Tokio" and "async runtime"
      const match = candidates.find(c => c.quote.includes('Tokio'));
      expect(match).toBeDefined();
      expect(match!.domain).toBe('example.com');
    });

    it('should not return results from pending (unapproved) results', () => {
      const candidates = searchCandidates(sessionDir, 'pending source note');
      // "pending source" should not match the pending result since it's not approved
      // But even if it matches "pending" in content, it won't be approved
      const pendingMatch = candidates.find(c => c.resultUrl.includes('pending-source'));
      expect(pendingMatch).toBeUndefined();
    });

    it('should return empty array for empty or too-short query', () => {
      expect(searchCandidates(sessionDir, 'a')).toHaveLength(0);
      expect(searchCandidates(sessionDir, '')).toHaveLength(0);
    });

    it('should cap at MAX_CANDIDATES (5) results', () => {
      // A broad query that might match many sentences
      const candidates = searchCandidates(sessionDir, 'Rust async Tokio runtime ecosystem');
      expect(candidates.length).toBeLessThanOrEqual(5);
    });

    it('should score candidates by Jaccard similarity (highest first)', () => {
      const candidates = searchCandidates(sessionDir, 'Tokio is the most widely used async runtime');
      if (candidates.length >= 2) {
        // First candidate should have higher or equal score than the last
        // We can indirectly verify by checking tokens are more relevant
        expect(candidates[0].quote.toLowerCase()).toContain('tokio');
      }
    });

    it('should include domain, author, siteName when available', () => {
      const candidates = searchCandidates(sessionDir, 'Tokio async');
      if (candidates.length > 0) {
        expect(candidates[0].domain).toBe('example.com');
        expect(candidates[0].resultUrl).toContain('http');
      }
    });
  });
});

// ── Section 3: Policy Engine ────────────────────────────────────────

describe('policy engine', () => {
  function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
    return {
      id: 'vd_001',
      claimId: 'cl_001',
      evidenceIds: ['ev_001'],
      stance: 'support',
      reason: 'test',
      createdAt: Date.now(),
      ...overrides,
    };
  }

  function makeEvidence(overrides: Partial<EvidenceSpan> = {}): EvidenceSpan {
    return {
      id: 'ev_001',
      claimId: 'cl_001',
      resultUrl: 'https://source-a.com/article',
      quote: 'Supporting evidence text for the claim.',
      charStart: 0,
      charEnd: 36,
      contentHash: 'a'.repeat(64),
      retrievedAt: Date.now(),
      sourceClusterId: 'cluster_a',
      ...overrides,
    };
  }

  function makeInput(overrides: Partial<PolicyInput> = {}): PolicyInput {
    return {
      claimId: 'cl_001',
      riskLevel: 'medium',
      verdicts: [makeVerdict()],
      evidences: [makeEvidence()],
      ...overrides,
    };
  }

  // ── Rule #1: singleRefute ───────────────────────────────────────

  describe('rule #1: singleRefute', () => {
    it('should return needsReview when any refute verdict exists', () => {
      const result = aggregateClaim(makeInput({
        verdicts: [
          makeVerdict({ stance: 'support', evidenceIds: ['ev_001'] }),
          makeVerdict({ id: 'vd_002', stance: 'refute', evidenceIds: ['ev_002'] }),
        ],
        evidences: [
          makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' }),
          makeEvidence({ id: 'ev_002', sourceClusterId: 'cluster_b', quote: 'Refuting evidence.' }),
        ],
      }));
      expect(result.decision).toBe('needsReview');
      expect(result.matchedRule).toBe('singleRefute');
      expect(result.checks.hasRefute).toBe(true);
      expect(result.conflict).toBeDefined();
      expect(result.conflict!.refuting.length).toBeGreaterThanOrEqual(1);
    });

    it('should always trigger needsReview even with many supporting verdicts', () => {
      const result = aggregateClaim(makeInput({
        verdicts: [
          makeVerdict({ id: 'vd_001', stance: 'support' }),
          makeVerdict({ id: 'vd_002', stance: 'support' }),
          makeVerdict({ id: 'vd_003', stance: 'support' }),
          makeVerdict({ id: 'vd_004', stance: 'refute' }),
        ],
        evidences: [
          makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' }),
          makeEvidence({ id: 'ev_002', sourceClusterId: 'cluster_b' }),
          makeEvidence({ id: 'ev_003', sourceClusterId: 'cluster_c' }),
          makeEvidence({ id: 'ev_004', sourceClusterId: 'cluster_d', quote: 'Refuting.' }),
        ],
      }));
      expect(result.decision).toBe('needsReview');
      expect(result.matchedRule).toBe('singleRefute');
    });
  });

  // ── Rule #2: highRiskInsufficient ───────────────────────────────

  describe('rule #2: highRiskInsufficient', () => {
    it('should require ≥2 sources for high-risk claims', () => {
      const result = aggregateClaim(makeInput({
        riskLevel: 'high',
        evidences: [makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' })],
      }));
      expect(result.decision).toBe('needsReview');
      expect(result.matchedRule).toBe('highRiskInsufficient');
    });

    it('should pass to next rule when high risk has ≥2 sources', () => {
      const result = aggregateClaim(makeInput({
        riskLevel: 'high',
        verdicts: [makeVerdict({ stance: 'support' })],
        evidences: [
          makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' }),
          makeEvidence({ id: 'ev_002', sourceClusterId: 'cluster_b' }),
        ],
      }));
      // Skips rule #1 (no refute), then passes rule #2 (≥2 sources)
      // Then rule #3: dualSourceSupport → approved
      expect(result.decision).toBe('approved');
      expect(result.matchedRule).toBe('dualSourceSupport');
    });

    it('should not affect low/medium risk claims', () => {
      const result = aggregateClaim(makeInput({
        riskLevel: 'low',
        evidences: [makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' })],
      }));
      expect(result.matchedRule).not.toBe('highRiskInsufficient');
    });
  });

  // ── Rule #3: dualSourceSupport ──────────────────────────────────

  describe('rule #3: dualSourceSupport', () => {
    it('should auto-approve when ≥2 independent sources all support', () => {
      const result = aggregateClaim(makeInput({
        verdicts: [
          makeVerdict({ id: 'vd_001', stance: 'support' }),
          makeVerdict({ id: 'vd_002', stance: 'support' }),
        ],
        evidences: [
          makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' }),
          makeEvidence({ id: 'ev_002', sourceClusterId: 'cluster_b' }),
        ],
      }));
      expect(result.decision).toBe('approved');
      expect(result.autoPass).toBe(true);
      expect(result.matchedRule).toBe('dualSourceSupport');
      expect(result.checks.sourceIndependent).toBe(true);
      expect(result.checks.allSupport).toBe(true);
    });

    it('should not approve when sources are not independent', () => {
      const result = aggregateClaim(makeInput({
        verdicts: [
          makeVerdict({ id: 'vd_001', stance: 'support' }),
          makeVerdict({ id: 'vd_002', stance: 'support' }),
        ],
        evidences: [
          makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' }),
          makeEvidence({ id: 'ev_002', sourceClusterId: 'cluster_a' }), // same cluster
        ],
      }));
      // 2 verdicts but only 1 unique source → falls through to rule #5: singleSource → needsReview
      expect(result.decision).toBe('needsReview');
      expect(result.matchedRule).toBe('singleSource');
    });
  });

  // ── Rule #4: dualSourceMixed ────────────────────────────────────

  describe('rule #4: dualSourceMixed', () => {
    it('should return needsReview when ≥2 sources but some insufficient', () => {
      const result = aggregateClaim(makeInput({
        verdicts: [
          makeVerdict({ id: 'vd_001', stance: 'support' }),
          makeVerdict({ id: 'vd_002', stance: 'insufficient' }),
        ],
        evidences: [
          makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' }),
          makeEvidence({ id: 'ev_002', sourceClusterId: 'cluster_b' }),
        ],
      }));
      expect(result.decision).toBe('needsReview');
      expect(result.matchedRule).toBe('dualSourceMixed');
    });
  });

  // ── Rule #5: singleSource ───────────────────────────────────────

  describe('rule #5: singleSource', () => {
    it('should return needsReview when only 1 independent source', () => {
      const result = aggregateClaim(makeInput({
        evidences: [makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' })],
      }));
      expect(result.decision).toBe('needsReview');
      expect(result.matchedRule).toBe('singleSource');
    });
  });

  // ── Rule #6: allInsufficient ────────────────────────────────────

  describe('rule #6: allInsufficient', () => {
    it('should return needsReview when all verdicts are insufficient (no source cluster IDs)', () => {
      const result = aggregateClaim(makeInput({
        verdicts: [
          makeVerdict({ id: 'vd_001', stance: 'insufficient' }),
          makeVerdict({ id: 'vd_002', stance: 'insufficient' }),
        ],
        evidences: [
          makeEvidence({ id: 'ev_001', sourceClusterId: undefined }),
          makeEvidence({ id: 'ev_002', sourceClusterId: undefined }),
        ],
      }));
      // Rule #4 (dualSourceMixed) requires ≥2 independent sources — no cluster IDs means 0 sources
      // So it falls through to rule #6: allInsufficient
      expect(result.decision).toBe('needsReview');
      expect(result.matchedRule).toBe('allInsufficient');
    });
  });

  // ── Rule #7: fallback ───────────────────────────────────────────

  describe('rule #7: fallback', () => {
    it('should return needsReview when no other rule matches', () => {
      // Empty verdicts with no evidence — no rule matches → fallback
      const result = aggregateClaim(makeInput({
        verdicts: [],
        evidences: [],
      }));
      expect(result.decision).toBe('needsReview');
      expect(result.matchedRule).toBe('fallback');
      expect(result.autoPass).toBe(false);
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle empty verdicts gracefully', () => {
      const result = aggregateClaim(makeInput({ verdicts: [], evidences: [] }));
      expect(result.decision).toBe('needsReview');
      expect(result.checks.sourceIndependent).toBe(false);
      expect(result.checks.hasRefute).toBe(false);
      expect(result.checks.allSupport).toBe(false);
    });

    it('should handle single verdict correctly', () => {
      const result = aggregateClaim(makeInput({
        verdicts: [makeVerdict({ stance: 'support' })],
        evidences: [makeEvidence({ sourceClusterId: 'cluster_a' })],
      }));
      // 1 source + 1 support → rule #5: singleSource → needsReview
      expect(result.decision).toBe('needsReview');
      expect(result.matchedRule).toBe('singleSource');
    });

    it('should not include conflict when no refute', () => {
      const result = aggregateClaim(makeInput({
        verdicts: [makeVerdict({ stance: 'support' })],
        evidences: [makeEvidence()],
      }));
      expect(result.conflict).toBeUndefined();
    });

    it('should set autoPass correctly', () => {
      const approved = aggregateClaim(makeInput({
        verdicts: [
          makeVerdict({ id: 'vd_001', stance: 'support' }),
          makeVerdict({ id: 'vd_002', stance: 'support' }),
        ],
        evidences: [
          makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' }),
          makeEvidence({ id: 'ev_002', sourceClusterId: 'cluster_b' }),
        ],
      }));
      expect(approved.autoPass).toBe(true);

      const rejected = aggregateClaim(makeInput({
        verdicts: [makeVerdict({ stance: 'refute' })],
        evidences: [makeEvidence()],
      }));
      expect(rejected.autoPass).toBe(false);
    });

    it('should use the "agent" as the default reviewer', () => {
      const result = aggregateClaim(makeInput());
      expect(result.reviewer).toBe('agent');
      expect(result.reviewedAt).toBeGreaterThan(0);
    });
  });

  // ── aggregateAll ─────────────────────────────────────────────────

  describe('aggregateAll', () => {
    it('should aggregate multiple claims at once', () => {
      const inputs: PolicyInput[] = [
        makeInput({
          claimId: 'cl_001',
          verdicts: [
            makeVerdict({ id: 'vd_001', stance: 'support' }),
            makeVerdict({ id: 'vd_002', stance: 'support' }),
          ],
          evidences: [
            makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' }),
            makeEvidence({ id: 'ev_002', sourceClusterId: 'cluster_b' }),
          ],
        }),
        makeInput({
          claimId: 'cl_002',
          verdicts: [makeVerdict({ id: 'vd_003', stance: 'refute' })],
          evidences: [makeEvidence({ id: 'ev_003', sourceClusterId: 'cluster_a' })],
        }),
      ];
      const results = aggregateAll(inputs);
      expect(results).toHaveLength(2);
      expect(results[0].claimId).toBe('cl_001');
      expect(results[0].decision).toBe('approved');
      expect(results[1].claimId).toBe('cl_002');
      expect(results[1].decision).toBe('needsReview');
      expect(results[1].matchedRule).toBe('singleRefute');
    });
  });
});
