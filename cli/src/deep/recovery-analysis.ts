/**
 * Recovery analysis for deep search sessions.
 *
 * When search quality is poor, analyze the session and suggest recovery
 * strategies for the Agent. CLI outputs analysis data only — Agent decides.
 *
 * Four recovery strategies:
 * - reformulate:    query too specific → remove qualifiers or use broader terms
 * - engine_rotation: current engines not covering sources → try different engines
 * - category_shift:  category results poor → switch category
 * - backtrack:       ≥2 consecutive poor rounds → return to last successful query direction
 *                    (uses graph traversal: query→yields→result backtracking)
 */

import { DirectedGraph } from 'graphology';
import { GraphNodeAttrs, GraphEdgeAttrs } from './graph.js';
import { SessionResult } from './session.js';
import { QualityScore, QualityThresholds, assessResultQuality } from './quality-assess.js';
import { StrategyConfig } from './search-strategy.js';

// ── Types ─────────────────────────────────────────────────────────

export type RecoveryStrategy = 'reformulate' | 'engine_rotation' | 'category_shift' | 'backtrack';

export interface RecoveryStrategyInfo {
    strategy: RecoveryStrategy;
    reason: string;
    suggestion: string;
    backtrackTo?: { round: number; query: string };
}

export interface RoundQuality {
    round: number;
    query: string;
    verdict: QualityScore['verdict'];
    failedIndicators: string[];
}

export interface RecoveryAnalysis {
    qualityScore: QualityScore;
    recentFailures: number;
    availableStrategies: RecoveryStrategyInfo[];
    lastSuccessfulRound: { round: number; query: string; quality: string } | null;
    roundQualityHistory: RoundQuality[];
}

// ── Quality history per round ─────────────────────────────────────

/** Build per-round quality history from the session graph and results.
 *  Each query node in the graph represents a round. We assess quality
 *  of results yielded by that query against the accumulated results up
 *  to that round. */
export function buildRoundQualityHistory(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    sessionResults: SessionResult[],
    qualityThresholds?: Partial<QualityThresholds>
): RoundQuality[] {
    // Collect query nodes sorted by round
    const queryNodes: Array<{ id: string; round: number; query: string }> = [];
    graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type === 'query' && attrs.query) {
            queryNodes.push({ id: node, round: attrs.round ?? 0, query: attrs.query });
        }
    });
    queryNodes.sort((a, b) => a.round - b.round);

    if (queryNodes.length === 0) return [];

    const history: RoundQuality[] = [];
    const seenUrls = new Set<string>();

    for (const qNode of queryNodes) {
        // Collect result URLs yielded by this query
        const roundResultUrls = new Set<string>();
        graph.forEachOutNeighbor(qNode.id, (neighbor: string) => {
            const nAttrs = graph.getNodeAttributes(neighbor);
            if (nAttrs.type === 'result' && nAttrs.url) {
                roundResultUrls.add(nAttrs.url);
            }
        });

        // Get SessionResult objects for these URLs
        const roundResults = sessionResults.filter(r => roundResultUrls.has(r.url));

        // Prior results are all results seen before this round
        const priorResults = sessionResults.filter(r => seenUrls.has(r.url));

        // Assess quality of this round's results
        const quality = assessResultQuality(roundResults, priorResults, graph, qualityThresholds);

        history.push({
            round: qNode.round,
            query: qNode.query,
            verdict: quality.verdict,
            failedIndicators: quality.failedIndicators,
        });

        // Mark these URLs as seen for subsequent rounds
        for (const url of roundResultUrls) {
            seenUrls.add(url);
        }
    }

    return history;
}

// ── Recovery analysis ─────────────────────────────────────────────

/** Analyze recovery options for a session with poor quality results.
 *  Returns available strategies with reasons and suggestions. */
export function analyzeRecoveryOptions(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    sessionResults: SessionResult[],
    qualityScore: QualityScore,
    config?: Partial<StrategyConfig>
): RecoveryAnalysis {
    const history = buildRoundQualityHistory(graph, sessionResults);

    // Count consecutive poor/acceptable rounds from the end
    let recentFailures = 0;
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].verdict === 'poor') {
            recentFailures++;
        } else {
            break;
        }
    }

    // Find last successful round (good verdict)
    const lastSuccessfulRound = findLastSuccessfulRound(history);

    // Build available strategies
    const strategies: RecoveryStrategyInfo[] = [];

    // Reformulate: suggest when contentDepth failed
    if (qualityScore.failedIndicators.includes('contentDepth')) {
        strategies.push({
            strategy: 'reformulate',
            reason: '查询过于具体或范围过窄，可能需要简化',
            suggestion: '移除限定词或尝试更宽泛的表达',
        });
    }

    // Engine rotation: suggest when sourceDiversity failed
    if (qualityScore.failedIndicators.includes('sourceDiversity')) {
        strategies.push({
            strategy: 'engine_rotation',
            reason: '当前引擎组合可能未覆盖相关来源',
            suggestion: '尝试不同引擎组合（如从 google 切换到 duckduckgo 或添加专业引擎）',
        });
    }

    // Category shift: suggest when novelty failed
    if (qualityScore.failedIndicators.includes('novelty')) {
        strategies.push({
            strategy: 'category_shift',
            reason: '当前分类结果不佳或结果重复',
            suggestion: '切换到更宽泛或不同分类（如从 science 切换到 general 或 it）',
        });
    }

    // Backtrack: suggest when ≥2 consecutive poor rounds
    if (recentFailures >= 2 && lastSuccessfulRound) {
        strategies.push({
            strategy: 'backtrack',
            reason: `连续 ${recentFailures} 轮质量不佳`,
            suggestion: '回到较早成功的查询方向分支',
            backtrackTo: {
                round: lastSuccessfulRound.round,
                query: lastSuccessfulRound.query,
            },
        });
    }

    // If no strategies were triggered but verdict is still poor/acceptable,
    // add a generic reformulate strategy
    if (strategies.length === 0 && qualityScore.verdict !== 'good') {
        strategies.push({
            strategy: 'reformulate',
            reason: '搜索结果未达标',
            suggestion: '尝试调整查询表达或更换搜索方向',
        });
    }

    return {
        qualityScore,
        recentFailures,
        availableStrategies: strategies,
        lastSuccessfulRound,
        roundQualityHistory: history,
    };
}

// ── Helpers ───────────────────────────────────────────────────────

/** Find the last round with 'good' verdict in quality history. */
function findLastSuccessfulRound(
    history: RoundQuality[]
): { round: number; query: string; quality: string } | null {
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].verdict === 'good') {
            return {
                round: history[i].round,
                query: history[i].query,
                quality: 'good',
            };
        }
    }
    return null;
}

/** Backtrack via graph traversal: find the query node that yielded
 *  the most results connected to high-degree entity nodes.
 *  Returns the query and round to backtrack to. */
export function backtrackToBestQuery(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>
): { round: number; query: string } | null {
    const queryScores: Array<{ id: string; query: string; round: number; score: number }> = [];

    graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type !== 'query' || !attrs.query) return;

        let score = 0;
        let resultCount = 0;

        // Walk query → result → entity and sum entity degrees
        graph.forEachOutNeighbor(node, (resultNode: string) => {
            const rAttrs = graph.getNodeAttributes(resultNode);
            if (rAttrs.type !== 'result') return;
            resultCount++;

            graph.forEachInNeighbor(resultNode, (entityNode: string) => {
                const eAttrs = graph.getNodeAttributes(entityNode);
                if (eAttrs.type === 'entity') {
                    score += graph.inDegree(entityNode) + graph.outDegree(entityNode);
                }
            });
        });

        queryScores.push({
            id: node,
            query: attrs.query,
            round: attrs.round ?? 0,
            score: resultCount > 0 ? score / resultCount : 0,
        });
    });

    if (queryScores.length === 0) return null;

    // Sort by score descending, then by round ascending (prefer earlier on tie)
    queryScores.sort((a, b) => b.score - a.score || a.round - b.round);

    return {
        round: queryScores[0].round,
        query: queryScores[0].query,
    };
}
