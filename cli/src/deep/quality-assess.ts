/**
 * Result quality assessment for deep search sessions.
 *
 * After each search round, compute quality indicators independently.
 * Each indicator has its own threshold — no weighted sum.
 *
 * Verdict logic:
 * - good:    all indicators pass
 * - acceptable: ≤2 indicators fail
 * - poor:    ≥3 indicators fail
 *
 * Novelty uses SimHash similarity < 0.75 as "not similar" threshold
 * (paired with dedup threshold of 0.85).
 */

import { DirectedGraph } from 'graphology';
import { SimHash } from './simhash.js';
import { SessionResult } from './session.js';
import { GraphNodeAttrs, GraphEdgeAttrs } from './graph.js';

// ── Types ─────────────────────────────────────────────────────────

export interface IndicatorResult {
    value: number;
    threshold: number;
    pass: boolean;
}

export interface QualityBreakdown {
    contentDepth: IndicatorResult;
    entityRichness: IndicatorResult;
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
    entityRichness: number;
    sourceDiversity: number;
    novelty: number;
}

const DEFAULT_THRESHOLDS: QualityThresholds = {
    contentDepth: 150,
    entityRichness: 2,
    sourceDiversity: 3,
    novelty: 0.3,
};

// ── Indicator computations ────────────────────────────────────────

/** Extract domain from URL */
function extractDomain(url: string): string {
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

/** Compute entity richness indicator — count of Agent-added entities in the graph */
function computeEntityRichness(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    threshold: number
): IndicatorResult {
    let entityCount = 0;
    graph.forEachNode((_node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type === 'entity') entityCount++;
    });
    return { value: entityCount, threshold, pass: entityCount >= threshold };
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
 *  All indicators use independent thresholds — no weighted sum.
 *  Note: resultCount is intentionally excluded — Agent decides how many results to keep.
 */
export function assessResultQuality(
    results: SessionResult[],
    sessionResults: SessionResult[],
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    thresholds?: Partial<QualityThresholds>
): QualityScore {
    const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

    const breakdown: QualityBreakdown = {
        contentDepth: computeContentDepth(results, t.contentDepth),
        entityRichness: computeEntityRichness(graph, t.entityRichness),
        sourceDiversity: computeSourceDiversity(results, t.sourceDiversity),
        novelty: computeNovelty(results, sessionResults, t.novelty),
    };

    const failedIndicators = Object.entries(breakdown)
        .filter(([, v]) => !v.pass)
        .map(([k]) => k);

    let verdict: QualityScore['verdict'];
    if (failedIndicators.length === 0) {
        verdict = 'good';
    } else if (failedIndicators.length <= 2) {
        verdict = 'acceptable';
    } else {
        verdict = 'poor';
    }

    return { verdict, breakdown, failedIndicators };
}
