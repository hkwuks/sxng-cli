/**
 * Result quality assessment for deep search sessions.
 *
 * Programmatic pre-filter: removes obviously poor results before
 * Agent review. Agent makes the final quality decision based on
 * title, content, and source.
 *
 * Three indicators (independent thresholds, no weighted sum):
 * - contentDepth: average extracted content length
 * - sourceDiversity: number of distinct domains
 * - novelty: fraction not similar to existing results (SimHash)
 *
 * Verdict logic:
 * - good:    all pass
 * - acceptable: 1 fails
 * - poor:    ≥2 fail
 */

import { SimHash } from './simhash.js';
import { SessionResult } from './session.js';

// ── Types ─────────────────────────────────────────────────────────

export interface IndicatorResult {
    value: number;
    threshold: number;
    pass: boolean;
}

export interface QualityBreakdown {
    contentDepth: IndicatorResult;
    sourceDiversity: IndicatorResult;
    novelty: IndicatorResult;
}

export interface QualityScore {
    verdict: 'good' | 'acceptable' | 'poor';
    breakdown: QualityBreakdown;
    failedIndicators: string[];
}

export interface QualityThresholds {
    contentDepth: number;
    sourceDiversity: number;
    novelty: number;
}

const DEFAULT_THRESHOLDS: QualityThresholds = {
    contentDepth: 150,
    sourceDiversity: 3,
    novelty: 0.3,
};

// ── Indicator computations ────────────────────────────────────────

/** Extract domain from URL */
function extractDomain(url: string): string {
    if (url.startsWith('file://')) return ''; // local docs → no domain
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

/** Compute content depth indicator — average content length of extracted results only */
function computeContentDepth(results: SessionResult[], threshold: number): IndicatorResult {
    const extracted = results.filter(r => r.content && r.content.length > 0);
    if (extracted.length === 0) {
        return { value: 0, threshold, pass: false };
    }
    const totalLength = extracted.reduce((sum, r) => sum + (r.content?.length ?? 0), 0);
    const value = totalLength / extracted.length;
    return { value, threshold, pass: value >= threshold };
}

/** Compute source diversity indicator — number of distinct domains */
function computeSourceDiversity(newResults: SessionResult[], threshold: number): IndicatorResult {
    const domains = new Set<string>();
    for (const r of newResults) {
        const domain = extractDomain(r.url);
        if (domain) domains.add(domain);
    }
    const value = domains.size;
    return { value, threshold, pass: value >= threshold };
}

/** Compute novelty indicator — fraction of new results not similar to existing session results.
 *  Uses SimHash similarity < 0.75 as "not similar" threshold.
 *  Caches SimHash results for performance. */
function computeNovelty(
    newResults: SessionResult[],
    sessionResults: SessionResult[],
    threshold: number
): IndicatorResult {
    if (newResults.length === 0) {
        return { value: 0, threshold, pass: false };
    }

    if (sessionResults.length === 0) {
        // No prior results → everything is novel
        return { value: 1, threshold, pass: true };
    }

    const simhash = new SimHash();

    // Cache existing hashes to avoid recomputation
    const existingHashes = sessionResults.map(r =>
        simhash.hash(`${r.title} ${r.content || ''}`)
    );

    let novelCount = 0;
    for (const r of newResults) {
        const h = simhash.hash(`${r.title} ${r.content || ''}`);
        let isSimilar = false;
        for (const existing of existingHashes) {
            if (simhash.similarity(h, existing) >= 0.75) {
                isSimilar = true;
                break;
            }
        }
        if (!isSimilar) novelCount++;
    }

    const value = novelCount / newResults.length;
    return { value, threshold, pass: value >= threshold };
}

// ── Main assessment ───────────────────────────────────────────────

/** Assess the quality of results against session context.
 *  Programmatic pre-filter only — Agent makes final quality decision.
 *  All indicators use independent thresholds — no weighted sum.
 */
export function assessResultQuality(
    results: SessionResult[],
    sessionResults: SessionResult[],
    thresholds?: Partial<QualityThresholds>
): QualityScore {
    const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

    const breakdown: QualityBreakdown = {
        contentDepth: computeContentDepth(results, t.contentDepth),
        sourceDiversity: computeSourceDiversity(results, t.sourceDiversity),
        novelty: computeNovelty(results, sessionResults, t.novelty),
    };

    const failedIndicators = Object.entries(breakdown)
        .filter(([, v]) => !v.pass)
        .map(([k]) => k);

    let verdict: QualityScore['verdict'];
    if (failedIndicators.length === 0) {
        verdict = 'good';
    } else if (failedIndicators.length === 1) {
        verdict = 'acceptable';
    } else {
        verdict = 'poor';
    }

    return { verdict, breakdown, failedIndicators };
}
