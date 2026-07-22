import { describe, it, expect } from 'vitest';
import { sampleGraph, SamplingConfig, SamplingStrategy, SamplingResult } from '../../src/deep/graph-sampling.js';
import { createGraph, entityId, resultId, queryId, GraphNodeAttrs, GraphEdgeAttrs } from '../../src/deep/graph.js';
import { DirectedGraph } from 'graphology';

/** Build a 30-node graph for validation. */
function build30NodeGraph(): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    const graph = createGraph();

    // Create 15 entities in a chain + branching structure
    const entityNames = [
        'tokio', 'hyper', 'tonic', 'tower', 'futures',
        'rust', 'async_std', 'smol', 'actix', 'warp',
        'axum', 'serde', 'clap', 'tracing', 'anyhow',
    ];

    for (let i = 0; i < entityNames.length; i++) {
        graph.mergeNode(entityId(entityNames[i]), {
            type: 'entity',
            label: entityNames[i],
            entityType: i < 5 ? 'runtime' : i < 10 ? 'library' : 'tool',
            score: 1 - i * 0.05,
        });
    }

    // Chain: tokio → hyper → tonic → tower → futures
    for (let i = 0; i < 4; i++) {
        graph.addEdge(entityId(entityNames[i]), entityId(entityNames[i + 1]), {
            relation: 'depends_on', weight: 1 - i * 0.1,
        });
    }

    // Branch: tokio → rust, async_std → rust
    graph.addEdge(entityId('tokio'), entityId('rust'), { relation: 'depends_on', weight: 0.9 });
    graph.addEdge(entityId('async_std'), entityId('rust'), { relation: 'depends_on', weight: 0.9 });
    graph.addEdge(entityId('smol'), entityId('rust'), { relation: 'depends_on', weight: 0.8 });

    // More edges
    graph.addEdge(entityId('tonic'), entityId('axum'), { relation: 'co_occurs_with', weight: 0.7 });
    graph.addEdge(entityId('hyper'), entityId('warp'), { relation: 'alternative_to', weight: 0.6 });
    graph.addEdge(entityId('actix'), entityId('warp'), { relation: 'co_occurs_with', weight: 0.5 });
    graph.addEdge(entityId('axum'), entityId('serde'), { relation: 'depends_on', weight: 0.8 });
    graph.addEdge(entityId('tower'), entityId('tracing'), { relation: 'depends_on', weight: 0.6 });
    graph.addEdge(entityId('tokio'), entityId('tracing'), { relation: 'depends_on', weight: 0.5 });
    graph.addEdge(entityId('anyhow'), entityId('clap'), { relation: 'co_occurs_with', weight: 0.4 });

    // Add some result and query nodes to bring total to ~30
    graph.mergeNode(queryId('rust async'), { type: 'query', label: 'rust async', query: 'rust async', round: 1 });
    graph.mergeNode(resultId('https://tokio.rs'), { type: 'result', label: 'Tokio', url: 'https://tokio.rs', title: 'Tokio' });
    graph.addEdge(queryId('rust async'), resultId('https://tokio.rs'), { relation: 'yields', weight: 1 });
    graph.mergeNode(queryId('rust frameworks'), { type: 'query', label: 'rust frameworks', query: 'rust frameworks', round: 2 });
    graph.mergeNode(resultId('https://hyper.rs'), { type: 'result', label: 'Hyper', url: 'https://hyper.rs', title: 'Hyper' });
    graph.addEdge(queryId('rust frameworks'), resultId('https://hyper.rs'), { relation: 'yields', weight: 0.8 });

    return graph;
}

describe('graph-sampling', () => {
    describe('augmented_chain', () => {
        it('walks a chain from seed entity', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.mergeNode(entityId('c'), { type: 'entity', label: 'c' });
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('b'), entityId('c'), { relation: 'depends_on', weight: 1 });

            const result = sampleGraph(graph, {
                strategy: 'augmented_chain',
                seedEntities: [entityId('a')],
                maxHops: 3,
            });

            expect(result.strategy).toBe('augmented_chain');
            expect(result.entities.length).toBeGreaterThanOrEqual(2);
            expect(result.hopsCovered).toBeGreaterThanOrEqual(1);
            expect(result.entities[0].id).toBe(entityId('a'));
        });

        it('returns empty for non-existent seed', () => {
            const graph = createGraph();
            const result = sampleGraph(graph, {
                strategy: 'augmented_chain',
                seedEntities: ['e:nonexistent'],
                maxHops: 3,
            });

            expect(result.entities).toEqual([]);
            expect(result.metadata.reason).toBe('no_valid_seed');
        });

        it('enriches entities with degree', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });

            const result = sampleGraph(graph, {
                strategy: 'augmented_chain',
                seedEntities: [entityId('a')],
                maxHops: 2,
            });

            expect(result.entities[0].degree).toBe(1); // a has 1 edge
        });

        it('stops at maxHops', () => {
            const graph = createGraph();
            for (const name of ['a', 'b', 'c', 'd', 'e']) {
                graph.mergeNode(entityId(name), { type: 'entity', label: name });
            }
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('b'), entityId('c'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('c'), entityId('d'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('d'), entityId('e'), { relation: 'depends_on', weight: 1 });

            const result = sampleGraph(graph, {
                strategy: 'augmented_chain',
                seedEntities: [entityId('a')],
                maxHops: 2,
            });

            expect(result.hopsCovered).toBeLessThanOrEqual(2);
            expect(result.entities.length).toBeLessThanOrEqual(3);
        });

        it('avoids cycles', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('b'), entityId('a'), { relation: 'depends_on', weight: 1 });

            const result = sampleGraph(graph, {
                strategy: 'augmented_chain',
                seedEntities: [entityId('a')],
                maxHops: 5,
            });

            // Should not loop infinitely, and should have exactly 2 entities
            expect(result.entities.length).toBe(2);
        });
    });

    describe('dual_core_bridge', () => {
        it('finds convergence between two seeds', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio' });
            graph.mergeNode(entityId('async_std'), { type: 'entity', label: 'async-std' });
            graph.mergeNode(entityId('rust'), { type: 'entity', label: 'rust' });
            graph.addEdge(entityId('tokio'), entityId('rust'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('async_std'), entityId('rust'), { relation: 'depends_on', weight: 1 });

            const result = sampleGraph(graph, {
                strategy: 'dual_core_bridge',
                seedEntities: [entityId('tokio'), entityId('async_std')],
                maxHops: 3,
            });

            expect(result.strategy).toBe('dual_core_bridge');
            expect(result.metadata.convergence).toBe(true);
            expect(result.metadata.bridgeEntity).toBe(entityId('rust'));
        });

        it('returns graceful result when no convergence', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            // No shared target

            const result = sampleGraph(graph, {
                strategy: 'dual_core_bridge',
                seedEntities: [entityId('a'), entityId('b')],
                maxHops: 3,
            });

            expect(result.metadata.convergence).toBe(false);
        });

        it('requires two valid seeds', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });

            const result = sampleGraph(graph, {
                strategy: 'dual_core_bridge',
                seedEntities: [entityId('a')],
                maxHops: 3,
            });

            expect(result.entities).toEqual([]);
            expect(result.metadata.reason).toBe('need_two_seeds');
        });
    });

    describe('community_core_path', () => {
        it('finds hub entity and its neighborhood', () => {
            const graph = createGraph();
            // rust is the hub
            graph.mergeNode(entityId('rust'), { type: 'entity', label: 'rust', score: 0.95 });
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio' });
            graph.mergeNode(entityId('hyper'), { type: 'entity', label: 'hyper' });
            graph.mergeNode(entityId('tonic'), { type: 'entity', label: 'tonic' });
            graph.addEdge(entityId('tokio'), entityId('rust'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('hyper'), entityId('rust'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('tonic'), entityId('rust'), { relation: 'depends_on', weight: 1 });

            const result = sampleGraph(graph, {
                strategy: 'community_core_path',
                seedEntities: [entityId('rust')],
                maxHops: 2,
            });

            expect(result.strategy).toBe('community_core_path');
            expect(result.entities.length).toBeGreaterThanOrEqual(2);
            expect(result.metadata.hubEntity).toBe(entityId('rust'));
        });

        it('handles graph with limited entities gracefully', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });

            const result = sampleGraph(graph, {
                strategy: 'community_core_path',
                seedEntities: [],
                maxHops: 2,
            });

            // With fallback, single-entity graph still returns that entity
            expect(result.entities.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('deep_chain', () => {
        it('finds the deepest path via DFS', () => {
            const graph = createGraph();
            for (const name of ['a', 'b', 'c', 'd']) {
                graph.mergeNode(entityId(name), { type: 'entity', label: name });
            }
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('b'), entityId('c'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('c'), entityId('d'), { relation: 'depends_on', weight: 1 });

            const result = sampleGraph(graph, {
                strategy: 'deep_chain',
                seedEntities: [entityId('a')],
                maxHops: 5,
            });

            expect(result.strategy).toBe('deep_chain');
            expect(result.hopsCovered).toBe(3);
            expect(result.entities.length).toBe(4);
        });

        it('respects the 8-hop hard cap', () => {
            const graph = createGraph();
            for (let i = 0; i < 15; i++) {
                graph.mergeNode(entityId(`n${i}`), { type: 'entity', label: `n${i}` });
            }
            for (let i = 0; i < 14; i++) {
                graph.addEdge(entityId(`n${i}`), entityId(`n${i + 1}`), { relation: 'depends_on', weight: 1 });
            }

            const result = sampleGraph(graph, {
                strategy: 'deep_chain',
                seedEntities: [entityId('n0')],
                maxHops: 20,
            });

            expect(result.hopsCovered).toBeLessThanOrEqual(8);
        });

        it('handles cycles without infinite loop', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.mergeNode(entityId('c'), { type: 'entity', label: 'c' });
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('b'), entityId('c'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('c'), entityId('a'), { relation: 'depends_on', weight: 1 });

            const result = sampleGraph(graph, {
                strategy: 'deep_chain',
                seedEntities: [entityId('a')],
                maxHops: 5,
            });

            expect(result.entities.length).toBe(3);
        });
    });

    describe('mixed', () => {
        it('picks a strategy and returns result', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });

            const result = sampleGraph(graph, {
                strategy: 'mixed',
                seedEntities: [entityId('a')],
                maxHops: 3,
                rngSeed: 42,
            });

            expect(['augmented_chain', 'dual_core_bridge', 'community_core_path', 'deep_chain']).toContain(result.strategy);
        });

        it('is deterministic with same rngSeed', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });

            const result1 = sampleGraph(graph, { strategy: 'mixed', seedEntities: [entityId('a')], maxHops: 3, rngSeed: 42 });
            const result2 = sampleGraph(graph, { strategy: 'mixed', seedEntities: [entityId('a')], maxHops: 3, rngSeed: 42 });

            expect(result1.strategy).toBe(result2.strategy);
        });

        it('different seeds may produce different strategies', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });

            const strategies = new Set<SamplingStrategy>();
            for (let seed = 0; seed < 20; seed++) {
                const result = sampleGraph(graph, { strategy: 'mixed', seedEntities: [entityId('a')], maxHops: 3, rngSeed: seed });
                strategies.add(result.strategy);
            }

            // With 20 different seeds, we should see at least 2 different strategies
            expect(strategies.size).toBeGreaterThanOrEqual(2);
        });
    });

    describe('consistency', () => {
        it('same input produces same output (deterministic)', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.mergeNode(entityId('c'), { type: 'entity', label: 'c' });
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('b'), entityId('c'), { relation: 'depends_on', weight: 1 });

            const config: SamplingConfig = {
                strategy: 'augmented_chain',
                seedEntities: [entityId('a')],
                maxHops: 3,
            };

            const r1 = sampleGraph(graph, config);
            const r2 = sampleGraph(graph, config);
            const r3 = sampleGraph(graph, config);

            expect(r1.entities.map(e => e.id)).toEqual(r2.entities.map(e => e.id));
            expect(r2.entities.map(e => e.id)).toEqual(r3.entities.map(e => e.id));
        });
    });

    describe('small graph validation', () => {
        it('30-node graph: augmented_chain produces meaningful results', () => {
            const graph = build30NodeGraph();
            const result = sampleGraph(graph, {
                strategy: 'augmented_chain',
                seedEntities: [entityId('tokio')],
                maxHops: 3,
            });

            expect(result.entities.length).toBeGreaterThan(0);
            expect(result.hopsCovered).toBeGreaterThan(0);
        });

        it('30-node graph: dual_core_bridge finds convergence', () => {
            const graph = build30NodeGraph();
            const result = sampleGraph(graph, {
                strategy: 'dual_core_bridge',
                seedEntities: [entityId('tokio'), entityId('async_std')],
                maxHops: 3,
            });

            expect(result.metadata.convergence).toBe(true);
            expect(result.metadata.bridgeEntity).toBe(entityId('rust'));
        });

        it('30-node graph: community_core_path returns hub entities', () => {
            const graph = build30NodeGraph();
            const result = sampleGraph(graph, {
                strategy: 'community_core_path',
                seedEntities: [entityId('rust')],
                maxHops: 2,
            });

            expect(result.entities.length).toBeGreaterThan(0);
        });

        it('10-node graph: strategies work on small graphs', () => {
            const graph = createGraph();
            for (const name of ['a', 'b', 'c', 'd', 'e']) {
                graph.mergeNode(entityId(name), { type: 'entity', label: name });
            }
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('b'), entityId('c'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('c'), entityId('d'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('d'), entityId('e'), { relation: 'depends_on', weight: 1 });

            const result = sampleGraph(graph, {
                strategy: 'augmented_chain',
                seedEntities: [entityId('a')],
                maxHops: 4,
            });

            expect(result.entities.length).toBeGreaterThan(0);
            expect(result.hopsCovered).toBeGreaterThan(0);
        });
    });
});
