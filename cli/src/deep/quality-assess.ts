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
 * - novelty: fraction not similar to earlier approved results (Jaccard)
 *
 * Verdict logic:
 * - good:    all pass
 * - acceptable: 1 fails
 * - poor:    two or more fail
 */

import { jaccardSimilarity, resultUrlKey } from './dedupe.js';
import { SessionResult } from './session.js';


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

const NOVELTY_SIMILARITY_THRESHOLD = 0.75;

// Indicator computations

/** Extract domain from URL */
function extractDomain(url: string): string {
    if (url.startsWith('file://')) return ''; // Local documents have no domain.
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

/** Compute content depth from extracted results only. */
function computeContentDepth(results: SessionResult[], threshold: number): IndicatorResult {
    const extracted = results.filter(r => r.content && r.content.length > 0);
    if (extracted.length === 0) {
        return { value: 0, threshold, pass: false };
    }
    const totalLength = extracted.reduce((sum, r) => sum + (r.content?.length ?? 0), 0);
    const value = totalLength / extracted.length;
    return { value, threshold, pass: value >= threshold };
}

/** Compute source diversity as the number of distinct domains. */
function computeSourceDiversity(newResults: SessionResult[], threshold: number): IndicatorResult {
    const domains = new Set<string>();
    for (const r of newResults) {
        const domain = extractDomain(r.url);
        if (domain) domains.add(domain);
    }
    const value = domains.size;
    return { value, threshold, pass: value >= threshold };
}

/** Compute text novelty against distinct historical URLs. */
function computeNovelty(
    newResults: SessionResult[],
    sessionResults: SessionResult[],
    threshold: number,
    seenEarlierUrls?: ReadonlySet<string>
): IndicatorResult {
    if (newResults.length === 0) {
        return { value: 0, threshold, pass: false };
    }

    if (sessionResults.length === 0 && !seenEarlierUrls?.size) {
        return { value: 1, threshold, pass: true };
    }

    let novelCount = 0;
    for (const r of newResults) {
        const text = r.content || r.title;
        const repeatedFromEarlierRound = seenEarlierUrls?.has(resultUrlKey(r)) ?? false;
        const isSimilarToPriorResult = sessionResults.some(existing =>
            existing.url !== r.url
            && jaccardSimilarity(text, existing.content || existing.title) >= NOVELTY_SIMILARITY_THRESHOLD
        );
        if (!repeatedFromEarlierRound && !isSimilarToPriorResult) novelCount++;
    }

    const value = novelCount / newResults.length;
    return { value, threshold, pass: value >= threshold };
}

/** Assess results from the newest recorded round against earlier approved results. */
export function assessLatestResultQuality(
    sessionResults: SessionResult[],
    thresholds?: Partial<QualityThresholds>
): QualityScore {
    const rounds = sessionResults.flatMap(result =>
        (result.origins || []).map(origin => origin.round).filter((round): round is number => Number.isInteger(round))
    );
    if (rounds.length === 0) return assessResultQuality(sessionResults, sessionResults, thresholds);

    const latestRound = Math.max(...rounds);
    const isFromRound = (result: SessionResult, predicate: (round: number) => boolean): boolean =>
        (result.origins || []).some(origin => origin.round !== undefined && predicate(origin.round));
    const latestResults = sessionResults.filter(result => isFromRound(result, round => round === latestRound));
    const priorApproved = sessionResults.filter(result =>
        result.status === 'approved' && isFromRound(result, round => round < latestRound)
    );
    const seenEarlierUrls = new Set(
        sessionResults
            .filter(result => isFromRound(result, round => round < latestRound))
            .map(result => resultUrlKey(result))
    );

    return assessQuality(latestResults, priorApproved, thresholds, seenEarlierUrls);
}

// Main assessment

/** Assess result quality against session context.
 * Programmatic pre-filter only; the Agent makes the final quality decision.
 * All indicators use independent thresholds with no weighted sum.
 */
export function assessResultQuality(
    results: SessionResult[],
    sessionResults: SessionResult[],
    thresholds?: Partial<QualityThresholds>
): QualityScore {
    return assessQuality(results, sessionResults, thresholds);
}

function assessQuality(
    results: SessionResult[],
    sessionResults: SessionResult[],
    thresholds?: Partial<QualityThresholds>,
    seenEarlierUrls?: ReadonlySet<string>
): QualityScore {
    const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

    const breakdown: QualityBreakdown = {
        contentDepth: computeContentDepth(results, t.contentDepth),
        sourceDiversity: computeSourceDiversity(results, t.sourceDiversity),
        novelty: computeNovelty(results, sessionResults, t.novelty, seenEarlierUrls),
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
