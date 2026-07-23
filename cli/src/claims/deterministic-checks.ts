/**
 * Deterministic checks — no LLM dependency.
 *
 * - checkAnchor: URL in approved results, offset in range, hash matches
 * - computeSourceClusterId: normalized publisher domain → SHA256 fingerprint
 * - searchCandidates: keyword + Jaccard sentence matching
 */

import { createHash } from 'crypto';
import { EvidenceSpan } from './types.js';
import { SessionResult, getApprovedResults } from '../deep/session.js';
import { loadSessionResults } from '../deep/session.js';

// ── Anchor check ────────────────────────────────────────────────────

export interface AnchorCheck {
  url: boolean;            // resultUrl is in approved results
  offsetInRange: boolean;  // charStart/end within content.length
  hashMatches: boolean;    // SHA256(content.slice(start,end)) === hash
}

/**
 * Verify that an EvidenceSpan is properly anchored to approved content.
 */
export function checkAnchor(
  evidence: EvidenceSpan,
  content: string
): AnchorCheck {
  const slice = content.slice(evidence.charStart, evidence.charEnd);
  const computedHash = createHash('sha256').update(slice).digest('hex');
  return {
    url: true,  // caller must have resolved url → content already
    offsetInRange: evidence.charEnd <= content.length && evidence.charStart >= 0,
    hashMatches: computedHash === evidence.contentHash,
  };
}

/**
 * Verify that evidence.resultUrl exists in the session's approved results.
 * Returns the matching Result's content, or null if not found.
 */
export function resolveApprovedContent(
  sessionDir: string,
  resultUrl: string
): { content: string } | null {
  const approved = getApprovedResults(sessionDir);
  for (const r of approved) {
    if (r.url === resultUrl && r.content) {
      return { content: r.content };
    }
  }
  return null;
}

// ── Source clustering ───────────────────────────────────────────────

/**
 * Compute a source cluster ID for an EvidenceSpan.
 * Groups evidence by normalized publisher domain for domain-level checks.
 * It does not determine cross-domain corporate or editorial affiliation.
 */
export function computeSourceClusterId(
  evidence: EvidenceSpan
): string {
  let publisher = '';
  try {
    publisher = new URL(evidence.resultUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch { /* empty */ }

  // Unknown publishers share one cluster so they cannot inflate domain diversity.
  return createHash('sha256').update(publisher).digest('hex').slice(0, 16);
}

// ── Candidate search (keyword + Jaccard) ────────────────────────────

/** A candidate evidence match, not persisted until verified by Agent. */
export interface EvidenceCandidate {
  resultUrl: string;
  quote: string;
  charStart: number;
  charEnd: number;
  contentHash: string;
  domain: string;
  author?: string;
  siteName?: string;
}

/** Simple stopwords for tokenization */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'just', 'because', 'but', 'and', 'or', 'if', 'while',
  'although', 'this', 'that', 'these', 'those', 'it', 'its',
  'the', 'which', 'who', 'whom', 'what',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const JACCARD_THRESHOLD = 0.3;
const MAX_CANDIDATES = 5;

/**
 * Search approved session results for candidate evidence supporting the claim.
 * Uses keyword + Jaccard sentence matching. Read-only — results not persisted.
 */
export function searchCandidates(
  sessionDir: string,
  claimText: string
): EvidenceCandidate[] {
  const keywords = tokenize(claimText);
  if (keywords.length === 0) return [];

  const keywordSet = new Set(keywords);
  const allResults = loadSessionResults(sessionDir);
  const approved = allResults.filter(r => r.status === 'approved' && r.content);

  const candidates: Array<{ score: number; candidate: EvidenceCandidate }> = [];

  for (const result of approved) {
    const content = result.content!;
    // Split into sentences
    const sentences = content.split(/(?<=[.!?])\s+|(?<=\n)\s*/);

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length < 10) continue;

      const words = tokenize(trimmed);
      if (words.length === 0) continue;

      const wordSet = new Set(words);
      const score = jaccardSimilarity(keywordSet, wordSet);
      if (score < JACCARD_THRESHOLD) continue;

      const charStart = content.indexOf(trimmed);
      if (charStart === -1) continue;
      const charEnd = charStart + trimmed.length;
      const contentHash = createHash('sha256')
        .update(trimmed)
        .digest('hex');

      let domain = '';
      try { domain = new URL(result.url).hostname; } catch { /* empty */ }

      candidates.push({
        score,
        candidate: {
          resultUrl: result.url,
          quote: trimmed,
          charStart,
          charEnd,
          contentHash,
          domain,
          author: (result as any).byline || undefined,
          siteName: (result as any).siteName || undefined,
        },
      });
    }
  }

  // Sort by Jaccard score descending, take top N
  candidates.sort((a, b) => b.score - a.score);

  return candidates.slice(0, MAX_CANDIDATES).map(c => c.candidate);
}
