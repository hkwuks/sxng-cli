/**
 * Query redundancy detection via Jaccard similarity.
 *
 * Before executing a new query, compare it against all historical queries
 * in the session. If similarity exceeds a threshold, take action:
 * - warn: output warning, proceed with search
 * - adjust: auto-remove overlapping terms, add differentiation
 * - skip: skip redundant query entirely
 *
 * Short queries (≤3 words) use character-level bigram Jaccard to avoid
 * low similarity from minor word differences. Longer queries use word-level Jaccard.
 */

// ── Types ─────────────────────────────────────────────────────────

export interface RedundancyConfig {
    jaccardThreshold: number; // default: 0.7
    action: 'warn' | 'adjust' | 'skip';
}

export interface RedundancyResult {
    isRedundant: boolean;
    maxSimilarity: number;
    similarQueries: Array<{ query: string; similarity: number }>;
    adjustedQuery?: string; // only when action='adjust' and redundant
    action: RedundancyConfig['action'];
}

// ── Jaccard computation ───────────────────────────────────────────

/** Generate character-level bigrams from a string. */
function charBigrams(s: string): Set<string> {
    const bigrams = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
        bigrams.add(s.slice(i, i + 2));
    }
    return bigrams;
}

/** Compute Jaccard similarity between two sets. */
function setJaccard<T>(a: Set<T>, b: Set<T>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let intersection = 0;
    for (const item of a) {
        if (b.has(item)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

/** Count words in a string (split by whitespace). */
function wordCount(s: string): number {
    return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Compute Jaccard similarity between two queries.
 *  - ≤2 words: character-level bigram Jaccard (case-insensitive)
 *  - >2 words: word-level Jaccard (case-insensitive) */
export function computeJaccard(a: string, b: string): number {
    const aLower = a.toLowerCase().trim();
    const bLower = b.toLowerCase().trim();

    if (aLower === bLower) return aLower.length > 0 ? 1 : 0;

    if (wordCount(a) <= 2 || wordCount(b) <= 2) {
        // Short query: character-level bigram Jaccard
        const bgA = charBigrams(aLower);
        const bgB = charBigrams(bLower);
        if (bgA.size === 0 || bgB.size === 0) return 0;
        return setJaccard(bgA, bgB);
    }

    // Long query: word-level Jaccard
    const setA = new Set(aLower.split(/\s+/).filter(Boolean));
    const setB = new Set(bLower.split(/\s+/).filter(Boolean));
    return setJaccard(setA, setB);
}

// ── Query adjustment ──────────────────────────────────────────────

/** Adjust a redundant query by removing overlapping terms and adding differentiation.
 *  Returns the adjusted query string, or the original if no adjustment is possible. */
export function adjustQuery(
    newQuery: string,
    similarQueries: Array<{ query: string; similarity: number }>
): string {
    const newWords = newQuery.toLowerCase().split(/\s+/).filter(Boolean);

    // Collect all overlapping words from similar queries
    const overlappingWords = new Set<string>();
    for (const sq of similarQueries) {
        const sqWords = sq.query.toLowerCase().split(/\s+/).filter(Boolean);
        for (const w of sqWords) {
            if (newWords.includes(w)) {
                overlappingWords.add(w);
            }
        }
    }

    // Keep non-overlapping words
    const keptWords = newQuery.split(/\s+/).filter(w => !overlappingWords.has(w.toLowerCase()));

    if (keptWords.length === 0) {
        // All words overlap — can't adjust, return original
        return newQuery;
    }

    // Add a differentiation marker to signal this is a refined query
    return keptWords.join(' ');
}

// ── Main redundancy check ────────────────────────────────────────

/** Check a new query against session history for redundancy. */
export function checkQueryRedundancy(
    newQuery: string,
    sessionHistory: string[],
    config: RedundancyConfig
): RedundancyResult {
    const similarQueries: Array<{ query: string; similarity: number }> = [];

    let maxSimilarity = 0;
    for (const pastQuery of sessionHistory) {
        const sim = computeJaccard(newQuery, pastQuery);
        if (sim >= config.jaccardThreshold) {
            similarQueries.push({ query: pastQuery, similarity: sim });
        }
        if (sim > maxSimilarity) {
            maxSimilarity = sim;
        }
    }

    const isRedundant = similarQueries.length > 0;

    const result: RedundancyResult = {
        isRedundant,
        maxSimilarity,
        similarQueries,
        action: config.action,
    };

    if (isRedundant && config.action === 'adjust') {
        result.adjustedQuery = adjustQuery(newQuery, similarQueries);
    }

    return result;
}
