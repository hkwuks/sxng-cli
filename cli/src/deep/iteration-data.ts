/**
 * Unified interface for all deep search iteration data commands.
 *
 * Composes the individual data modules into a single analysis call:
 * - checkQueryRedundancy
 * - assessResultQuality
 * - generateQuerySuggestions
 * - analyzeRecoveryOptions
 * - getStrategyInfo
 *
 * Agent can call getSessionAnalysis() to get a comprehensive snapshot
 * of the session state for decision-making.
 */

import { DirectedGraph } from 'graphology';
import { GraphNodeAttrs, GraphEdgeAttrs } from './graph.js';
import { SessionResult } from './session.js';
import { QualityScore, QualityThresholds, assessResultQuality } from './quality-assess.js';
import { QuerySuggestionData, SearchStage, generateQuerySuggestions } from './query-suggest.js';
import { StrategyConfig, StrategyInfo, getStrategyInfo } from './search-strategy.js';
import { RecoveryAnalysis, analyzeRecoveryOptions } from './recovery-analysis.js';
import { RedundancyConfig, RedundancyResult, checkQueryRedundancy } from './query-redundancy.js';

// ── Types ─────────────────────────────────────────────────────────

export interface SessionAnalysis {
    quality: QualityScore;
    strategy: StrategyInfo;
    suggestions: QuerySuggestionData;
    recovery: RecoveryAnalysis;
}

// ── Unified analysis ──────────────────────────────────────────────

/** Get a comprehensive analysis of the current session state.
 *  Combines quality assessment, strategy info, query suggestions,
 *  and recovery analysis into a single output for Agent decision-making. */
export function getSessionAnalysis(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    sessionResults: SessionResult[],
    options?: {
        qualityThresholds?: Partial<QualityThresholds>;
        strategyConfig?: Partial<StrategyConfig>;
    }
): SessionAnalysis {
    // Quality assessment
    const quality = assessResultQuality(
        sessionResults,
        sessionResults,
        options?.qualityThresholds
    );

    // Strategy info
    const strategy = getStrategyInfo(graph, options?.strategyConfig);

    // Query suggestions
    const suggestions = generateQuerySuggestions(
        graph,
        sessionResults,
        strategy.currentStage,
        quality
    );

    // Recovery analysis
    const recovery = analyzeRecoveryOptions(
        graph,
        sessionResults,
        quality,
        options?.strategyConfig
    );

    return { quality, strategy, suggestions, recovery };
}

/** Check a new query for redundancy before execution.
 *  Standalone convenience function — also available via query-redundancy.ts. */
export function checkNewQueryRedundancy(
    newQuery: string,
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    config?: Partial<RedundancyConfig>
): RedundancyResult {
    const history: string[] = [];
    graph.forEachNode((_node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type === 'query' && attrs.query) {
            history.push(attrs.query);
        }
    });

    return checkQueryRedundancy(newQuery, history, {
        jaccardThreshold: config?.jaccardThreshold ?? 0.7,
        bigramThreshold: config?.bigramThreshold,
        action: config?.action ?? 'warn',
    });
}
