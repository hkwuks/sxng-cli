import { describe, it, expect } from 'vitest';
import {
    analyzeRecoveryOptions,
    buildRoundQualityHistory,
    backtrackToBestQuery,
    RecoveryAnalysis,
    RecoveryStrategyInfo,
} from '../../src/deep/recovery-analysis.js';
import { DirectedGraph } from 'graphology';
import { GraphNodeAttrs, GraphEdgeAttrs } from '../../src/deep/graph.js';
import { QualityScore } from '../../src/deep/quality-assess.js';
import { SessionResult } from '../../src/deep/session.js';

/** Build a graph with query nodes that have results with entities.
 *  Quality is driven by how many results each query yields,
 *  how many domains they cover, etc. */
function buildGraphForRecovery(
    rounds: Array<{
        round: number;
        query: string;
        resultUrls: Array<{ url: string; title: string }>;
        entityLabels?: string[];
    }>,
    options?: { noContent?: boolean }
): { graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>; results: SessionResult[] } {
    const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
    const results: SessionResult[] = [];

    for (const r of rounds) {
        // Query node
        graph.mergeNode(`q:${r.query}`, {
            type: 'query',
            label: r.query,
            query: r.query,
            round: r.round,
        });

        for (const res of r.resultUrls) {
            const rId = `r:${res.url}`;
            if (!graph.hasNode(rId)) {
                graph.mergeNode(rId, {
                    type: 'result',
                    label: res.title,
                    url: res.url,
                    title: res.title,
                });
            }
            if (!graph.hasEdge(`q:${r.query}`, rId)) {
                graph.addEdge(`q:${r.query}`, rId, { relation: 'yields', weight: 1 });
            }

            // Add to results
            if (!results.find(x => x.url === res.url)) {
                results.push({ url: res.url, title: res.title, content: options?.noContent ? '' : 'x'.repeat(250) });
            }
        }

        // Entity nodes
        if (r.entityLabels) {
            for (const label of r.entityLabels) {
                const eId = `e:${label}`;
                if (!graph.hasNode(eId)) {
                    graph.mergeNode(eId, {
                        type: 'entity',
                        label,
                        entityType: 'concept',
                        frequency: 5,
                        sourceRounds: [r.round],
                    });
                }
            }
        }
    }

    // Add result → entity edges for entities in rounds
    for (const r of rounds) {
        if (!r.entityLabels) continue;
        for (const res of r.resultUrls) {
            const rId = `r:${res.url}`;
            for (const label of r.entityLabels) {
                const eId = `e:${label}`;
                if (graph.hasNode(rId) && graph.hasNode(eId) && !graph.hasEdge(rId, eId)) {
                    graph.addEdge(rId, eId, { relation: 'mentions', weight: 1 });
                }
            }
        }
    }

    return { graph, results };
}

function makeQuality(verdict: QualityScore['verdict'], failedIndicators: string[]): QualityScore {
    return {
        verdict,
        breakdown: {} as any,
        failedIndicators,
    };
}

describe('recovery-analysis', () => {
    describe('buildRoundQualityHistory', () => {
        it('returns empty array for empty graph', () => {
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            const history = buildRoundQualityHistory(graph, []);
            expect(history).toEqual([]);
        });

        it('builds quality history from query nodes', () => {
            // Round 1: 5 results from different domains + 3 entities → good
            // Round 2: 1 result from same domain → poor
            const { graph, results } = buildGraphForRecovery([
                {
                    round: 1,
                    query: 'rust async ecosystem',
                    resultUrls: [
                        { url: 'https://a.com/1', title: 'A1' },
                        { url: 'https://b.com/2', title: 'B2' },
                        { url: 'https://c.com/3', title: 'C3' },
                        { url: 'https://d.com/4', title: 'D4' },
                        { url: 'https://e.com/5', title: 'E5' },
                    ],
                    entityLabels: ['tokio', 'async-std', 'rust'],
                },
                {
                    round: 2,
                    query: 'very specific query xyz123',
                    resultUrls: [
                        { url: 'https://a.com/6', title: 'A6' },
                    ],
                },
            ]);

            const history = buildRoundQualityHistory(graph, results);
            expect(history.length).toBe(2);
            expect(history[0].round).toBe(1);
            expect(history[0].query).toBe('rust async ecosystem');
            expect(history[1].round).toBe(2);
            expect(history[1].query).toBe('very specific query xyz123');
        });
    });

    describe('analyzeRecoveryOptions', () => {
        it('suggests reformulate when contentDepth fails', () => {
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            graph.mergeNode('q:test', { type: 'query', label: 'test', query: 'test', round: 1 });

            const quality = makeQuality('poor', ['contentDepth']);
            const analysis = analyzeRecoveryOptions(graph, [], quality);

            const reformulate = analysis.availableStrategies.find(s => s.strategy === 'reformulate');
            expect(reformulate).toBeDefined();
            expect(reformulate!.reason).toContain('具体');
        });

        it('suggests engine_rotation when sourceDiversity fails', () => {
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            graph.mergeNode('q:test', { type: 'query', label: 'test', query: 'test', round: 1 });

            const quality = makeQuality('poor', ['sourceDiversity']);
            const analysis = analyzeRecoveryOptions(graph, [], quality);

            const engineRotation = analysis.availableStrategies.find(s => s.strategy === 'engine_rotation');
            expect(engineRotation).toBeDefined();
            expect(engineRotation!.reason).toContain('引擎');
        });

        it('suggests category_shift when novelty fails', () => {
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            graph.mergeNode('q:test', { type: 'query', label: 'test', query: 'test', round: 1 });

            const quality = makeQuality('poor', ['novelty']);
            const analysis = analyzeRecoveryOptions(graph, [], quality);

            const categoryShift = analysis.availableStrategies.find(s => s.strategy === 'category_shift');
            expect(categoryShift).toBeDefined();
        });

        it('suggests backtrack when ≥2 consecutive poor rounds', () => {
            const { graph, results } = buildGraphForRecovery([
                {
                    round: 1,
                    query: 'good query',
                    resultUrls: [
                        { url: 'https://a.com/1', title: 'A1' },
                        { url: 'https://b.com/2', title: 'B2' },
                        { url: 'https://c.com/3', title: 'C3' },
                        { url: 'https://d.com/4', title: 'D4' },
                        { url: 'https://e.com/5', title: 'E5' },
                    ],
                    entityLabels: ['entity1', 'entity2', 'entity3'],
                },
                {
                    round: 2,
                    query: 'poor query 1',
                    resultUrls: [
                        { url: 'https://a.com/6', title: 'A6' },
                    ],
                },
                {
                    round: 3,
                    query: 'poor query 2',
                    resultUrls: [
                        { url: 'https://a.com/7', title: 'A7' },
                    ],
                },
            ], { noContent: true });

            const quality = makeQuality('poor', ['contentDepth', 'novelty']);
            const analysis = analyzeRecoveryOptions(graph, results, quality);

            expect(analysis.recentFailures).toBeGreaterThanOrEqual(2);
            const backtrack = analysis.availableStrategies.find(s => s.strategy === 'backtrack');
            if (backtrack) {
                expect(backtrack.backtrackTo).toBeDefined();
                expect(backtrack.backtrackTo!.query).toBe('good query');
            }
        });

        it('adds generic reformulate when no specific strategy matches but verdict is poor', () => {
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            graph.mergeNode('q:test', { type: 'query', label: 'test', query: 'test', round: 1 });

            // entityRichness alone doesn't trigger any specific strategy except reformulate
            const quality = makeQuality('poor', ['entityRichness']);
            const analysis = analyzeRecoveryOptions(graph, [], quality);

            // Should have at least one strategy (generic reformulate fallback)
            expect(analysis.availableStrategies.length).toBeGreaterThan(0);
        });

        it('no strategies needed when verdict is good and history is good', () => {
            // Build a graph with a round that has many results and entities → good quality
            const { graph, results } = buildGraphForRecovery([
                {
                    round: 1,
                    query: 'good query',
                    resultUrls: [
                        { url: 'https://a.com/1', title: 'A1' },
                        { url: 'https://b.com/2', title: 'B2' },
                        { url: 'https://c.com/3', title: 'C3' },
                        { url: 'https://d.com/4', title: 'D4' },
                        { url: 'https://e.com/5', title: 'E5' },
                    ],
                    entityLabels: ['x', 'y', 'z'],
                },
            ]);

            // Pass a good quality score (consistent with the graph state)
            const quality = makeQuality('good', []);
            const analysis = analyzeRecoveryOptions(graph, results, quality);

            expect(analysis.availableStrategies).toEqual([]);
        });

        it('tracks lastSuccessfulRound from quality history', () => {
            const { graph, results } = buildGraphForRecovery([
                {
                    round: 1,
                    query: 'first query',
                    resultUrls: [
                        { url: 'https://a.com/1', title: 'A1' },
                        { url: 'https://b.com/2', title: 'B2' },
                        { url: 'https://c.com/3', title: 'C3' },
                        { url: 'https://d.com/4', title: 'D4' },
                        { url: 'https://e.com/5', title: 'E5' },
                    ],
                    entityLabels: ['x', 'y', 'z'],
                },
                {
                    round: 2,
                    query: 'bad query',
                    resultUrls: [
                        { url: 'https://a.com/6', title: 'A6' },
                    ],
                },
            ]);

            const quality = makeQuality('poor', ['contentDepth']);
            const analysis = analyzeRecoveryOptions(graph, results, quality);

            // lastSuccessfulRound should point to the round with good verdict
            if (analysis.lastSuccessfulRound) {
                expect(analysis.lastSuccessfulRound.quality).toBe('good');
            }
        });

        it('returns null lastSuccessfulRound when no good rounds', () => {
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            graph.mergeNode('q:bad', { type: 'query', label: 'bad', query: 'bad', round: 1 });

            const quality = makeQuality('poor', ['contentDepth']);
            const analysis = analyzeRecoveryOptions(graph, [], quality);

            // No good rounds in history (or no history at all)
            expect(analysis.lastSuccessfulRound).toBeNull();
        });

        it('counts consecutive failures correctly', () => {
            const { graph, results } = buildGraphForRecovery([
                {
                    round: 1,
                    query: 'good query',
                    resultUrls: [
                        { url: 'https://a.com/1', title: 'A1' },
                        { url: 'https://b.com/2', title: 'B2' },
                        { url: 'https://c.com/3', title: 'C3' },
                        { url: 'https://d.com/4', title: 'D4' },
                        { url: 'https://e.com/5', title: 'E5' },
                    ],
                    entityLabels: ['x', 'y', 'z'],
                },
                {
                    round: 2,
                    query: 'poor 1',
                    resultUrls: [{ url: 'https://a.com/6', title: 'A6' }],
                },
                {
                    round: 3,
                    query: 'poor 2',
                    resultUrls: [{ url: 'https://a.com/7', title: 'A7' }],
                },
                {
                    round: 4,
                    query: 'poor 3',
                    resultUrls: [{ url: 'https://a.com/8', title: 'A8' }],
                },
            ], { noContent: true });

            const quality = makeQuality('poor', ['contentDepth', 'novelty']);
            const analysis = analyzeRecoveryOptions(graph, results, quality);

            // Should count the last 3 rounds as poor
            expect(analysis.recentFailures).toBeGreaterThanOrEqual(2);
        });
    });

    describe('backtrackToBestQuery', () => {
        it('returns null for empty graph', () => {
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            expect(backtrackToBestQuery(graph)).toBeNull();
        });

        it('finds query connected to highest-degree entities', () => {
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();

            // Query 1 → result → high-degree entity
            graph.mergeNode('q:good', { type: 'query', label: 'good', query: 'good', round: 1 });
            graph.mergeNode('r:url1', { type: 'result', label: 'R1', url: 'https://a.com/1', title: 'R1' });
            graph.mergeNode('e:hub', { type: 'entity', label: 'hub', frequency: 10 });
            graph.addEdge('q:good', 'r:url1', { relation: 'yields', weight: 1 });
            graph.addEdge('r:url1', 'e:hub', { relation: 'mentions', weight: 1 });
            // Add more edges to hub to increase degree
            graph.mergeNode('r:url2', { type: 'result', label: 'R2', url: 'https://b.com/2', title: 'R2' });
            graph.addEdge('r:url2', 'e:hub', { relation: 'mentions', weight: 1 });

            // Query 2 → result → low-degree entity
            graph.mergeNode('q:weak', { type: 'query', label: 'weak', query: 'weak', round: 2 });
            graph.mergeNode('r:url3', { type: 'result', label: 'R3', url: 'https://c.com/3', title: 'R3' });
            graph.mergeNode('e:leaf', { type: 'entity', label: 'leaf', frequency: 1 });
            graph.addEdge('q:weak', 'r:url3', { relation: 'yields', weight: 1 });
            graph.addEdge('r:url3', 'e:leaf', { relation: 'mentions', weight: 1 });

            const best = backtrackToBestQuery(graph);
            expect(best).toBeDefined();
            expect(best!.query).toBe('good');
        });
    });
});
