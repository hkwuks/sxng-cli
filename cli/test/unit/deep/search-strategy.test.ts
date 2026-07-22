import { describe, it, expect } from 'vitest';
import {
    determineSearchStage,
    computeGrowthRate,
    getStrategyInfo,
    StrategyConfig,
} from '../../src/deep/search-strategy.js';
import { DirectedGraph } from 'graphology';
import { GraphNodeAttrs, GraphEdgeAttrs } from '../../src/deep/graph.js';

function buildGraphWithRounds(
    roundData: Array<{ round: number; entityCount: number }>
): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
    let entityIdx = 0;

    for (const { round, entityCount } of roundData) {
        // Add query node for this round
        graph.mergeNode(`q:query_r${round}`, {
            type: 'query',
            label: `query round ${round}`,
            query: `query round ${round}`,
            round,
        });

        // Add entities attributed to this round
        for (let i = 0; i < entityCount; i++) {
            graph.mergeNode(`e:entity_r${round}_${i}`, {
                type: 'entity',
                label: `Entity R${round}-${i}`,
                sourceRounds: [round],
            });
        }
    }

    return graph;
}

describe('search-strategy', () => {
    describe('computeGrowthRate', () => {
        it('returns 1.0 when only one round of data', () => {
            const graph = buildGraphWithRounds([{ round: 1, entityCount: 5 }]);
            const rate = computeGrowthRate(graph);
            expect(rate).toBe(1.0);
        });

        it('returns 1.0 when no entity rounds', () => {
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            const rate = computeGrowthRate(graph);
            expect(rate).toBe(1.0);
        });

        it('computes positive growth when more entities in latest round', () => {
            // Round 1: 3 entities, Round 2: 6 entities
            const graph = buildGraphWithRounds([
                { round: 1, entityCount: 3 },
                { round: 2, entityCount: 6 },
            ]);
            const rate = computeGrowthRate(graph);
            // (6 - 3) / max(3, 1) = 1.0
            expect(rate).toBe(1.0);
        });

        it('computes negative growth when fewer entities in latest round', () => {
            const graph = buildGraphWithRounds([
                { round: 1, entityCount: 10 },
                { round: 2, entityCount: 3 },
            ]);
            const rate = computeGrowthRate(graph);
            // (3 - 10) / max(10, 1) = -0.7
            expect(rate).toBeCloseTo(-0.7);
        });

        it('computes slow growth when entities plateau', () => {
            const graph = buildGraphWithRounds([
                { round: 1, entityCount: 10 },
                { round: 2, entityCount: 11 },
            ]);
            const rate = computeGrowthRate(graph);
            // (11 - 10) / 10 = 0.1
            expect(rate).toBeCloseTo(0.1);
        });
    });

    describe('determineSearchStage', () => {
        it('stays in broad_exploration for early rounds', () => {
            const graph = buildGraphWithRounds([{ round: 1, entityCount: 5 }]);
            const stage = determineSearchStage(graph);
            expect(stage).toBe('broad_exploration');
        });

        it('transitions to targeted_deep_dive when growth slows', () => {
            // Round 1: 10 entities, Round 2: 11 entities → growth rate = 0.1 < 0.2
            const graph = buildGraphWithRounds([
                { round: 1, entityCount: 10 },
                { round: 2, entityCount: 11 },
            ]);
            const stage = determineSearchStage(graph);
            expect(stage).toBe('targeted_deep_dive');
        });

        it('stays broad when growth is strong', () => {
            // Round 1: 3 entities, Round 2: 8 entities → growth rate = 5/3 ≈ 1.67
            const graph = buildGraphWithRounds([
                { round: 1, entityCount: 3 },
                { round: 2, entityCount: 8 },
            ]);
            const stage = determineSearchStage(graph);
            expect(stage).toBe('broad_exploration');
        });

        it('respects broadRounds config', () => {
            // Only 1 round, but broadRounds=1 → can transition if growth slow
            const graph = buildGraphWithRounds([
                { round: 1, entityCount: 10 },
                { round: 2, entityCount: 10 },
            ]);
            const stage = determineSearchStage(graph, { broadRounds: 1 });
            expect(stage).toBe('targeted_deep_dive');
        });

        it('respects transitionThreshold config', () => {
            // Growth rate = 0.1, default threshold = 0.2 → deep dive
            const graph = buildGraphWithRounds([
                { round: 1, entityCount: 10 },
                { round: 2, entityCount: 11 },
            ]);
            // With threshold 0.05, 0.1 > 0.05 → still broad
            const stage = determineSearchStage(graph, { transitionThreshold: 0.05 });
            expect(stage).toBe('broad_exploration');
        });

        it('stays broad when autoTransition is false', () => {
            const graph = buildGraphWithRounds([
                { round: 1, entityCount: 10 },
                { round: 2, entityCount: 10 },
            ]);
            const stage = determineSearchStage(graph, { autoTransition: false });
            expect(stage).toBe('broad_exploration');
        });
    });

    describe('getStrategyInfo', () => {
        it('returns full strategy info with broad engines', () => {
            const graph = buildGraphWithRounds([{ round: 1, entityCount: 5 }]);
            const info = getStrategyInfo(graph);

            expect(info.currentStage).toBe('broad_exploration');
            expect(info.recommendedEngines).toContain('google');
            expect(info.recommendedEngines).toContain('bing');
            expect(info.recommendedCategories).toContain('general');
            expect(info.roundNumber).toBe(1);
            expect(info.transitionReason).toBeUndefined();
        });

        it('returns deep-dive engines when transitioned', () => {
            const graph = buildGraphWithRounds([
                { round: 1, entityCount: 10 },
                { round: 2, entityCount: 10 },
            ]);
            const info = getStrategyInfo(graph);

            expect(info.currentStage).toBe('targeted_deep_dive');
            expect(info.recommendedEngines).toContain('arxiv');
            expect(info.recommendedEngines).toContain('github');
            expect(info.recommendedCategories).toContain('science');
            expect(info.transitionReason).toBeDefined();
        });

        it('includes growth rate in info', () => {
            const graph = buildGraphWithRounds([
                { round: 1, entityCount: 10 },
                { round: 2, entityCount: 12 },
            ]);
            const info = getStrategyInfo(graph);
            // growth rate = (12-10)/10 = 0.2
            expect(info.growthRate).toBeCloseTo(0.2);
        });
    });
});
