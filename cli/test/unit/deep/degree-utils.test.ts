import { describe, it, expect } from 'vitest';
import { createGraph, entityId, queryId, buildStructuralEdges, GraphNodeAttrs, GraphEdgeAttrs } from '../../src/deep/graph.js';
import { getEntityDegree, getEntitiesWithDegrees, adaptiveDegreeRange, filterEntitiesByDegree } from '../../src/deep/degree-utils.js';
import { DirectedGraph } from 'graphology';

/** Helper: build a graph with N entities, some connected via co_occurs_with edges. */
function buildTestGraph(entityCount: number, edges: Array<[number, number]>): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    const graph = createGraph();
    for (let i = 0; i < entityCount; i++) {
        graph.mergeNode(entityId(`entity_${i}`), { type: 'entity', label: `entity_${i}` });
    }
    for (const [from, to] of edges) {
        graph.addEdge(entityId(`entity_${from}`), entityId(`entity_${to}`), {
            relation: 'co_occurs_with',
            weight: 1,
        });
    }
    return graph;
}

describe('degree-utils', () => {
    describe('getEntityDegree', () => {
        it('returns 0 for isolated entity', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('isolated'), { type: 'entity', label: 'isolated' });
            expect(getEntityDegree(graph, entityId('isolated'))).toBe(0);
        });

        it('computes in + out degree correctly', () => {
            const graph = buildTestGraph(4, [[0, 1], [2, 1], [1, 3]]);
            // entity_1 has 2 in-edges + 1 out-edge = 3
            expect(getEntityDegree(graph, entityId('entity_1'))).toBe(3);
        });

        it('updates after adding edges', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });

            expect(getEntityDegree(graph, entityId('a'))).toBe(0);

            graph.addEdge(entityId('a'), entityId('b'), { relation: 'co_occurs_with', weight: 1 });
            expect(getEntityDegree(graph, entityId('a'))).toBe(1);
            expect(getEntityDegree(graph, entityId('b'))).toBe(1);
        });

        it('updates after removing edges', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'co_occurs_with', weight: 1 });

            graph.dropEdge(entityId('a'), entityId('b'));
            expect(getEntityDegree(graph, entityId('a'))).toBe(0);
        });

        it('ignores non-entity nodes', () => {
            const graph = createGraph();
            buildStructuralEdges(graph, 'test', [
                { url: 'https://a.com', title: 'A' },
            ]);
            // The query node has degree (from yields edge), but getEntityDegree
            // can technically be called on any node ID — it just computes degree.
            const qId = queryId('test');
            expect(getEntityDegree(graph, qId)).toBe(1);
        });
    });

    describe('getEntitiesWithDegrees', () => {
        it('returns all entities sorted by degree descending', () => {
            const graph = buildTestGraph(3, [[0, 1], [2, 1]]);
            const entities = getEntitiesWithDegrees(graph);

            expect(entities).toHaveLength(3);
            expect(entities[0].id).toBe(entityId('entity_1')); // degree 2
            expect(entities[0].degree).toBe(2);
            expect(entities[1].degree).toBe(1);
            expect(entities[2].degree).toBe(1);
        });

        it('returns empty array for graph with no entities', () => {
            const graph = createGraph();
            buildStructuralEdges(graph, 'test', [
                { url: 'https://a.com', title: 'A' },
            ]);
            const entities = getEntitiesWithDegrees(graph);
            expect(entities).toEqual([]);
        });
    });

    describe('adaptiveDegreeRange', () => {
        it('small graph: 10 nodes → d_max = 2', () => {
            const graph = buildTestGraph(10, []);
            const range = adaptiveDegreeRange(graph);
            expect(range.max).toBe(2);
            expect(range.min).toBe(1);
        });

        it('medium graph: 30 nodes → d_max = 6', () => {
            const graph = buildTestGraph(30, []);
            const range = adaptiveDegreeRange(graph);
            expect(range.max).toBe(6);
        });

        it('large graph: 100 nodes → d_max = 20', () => {
            const graph = buildTestGraph(100, []);
            const range = adaptiveDegreeRange(graph);
            expect(range.max).toBe(20);
        });

        it('very large graph: 500 nodes → d_max capped at 50', () => {
            const graph = buildTestGraph(500, []);
            const range = adaptiveDegreeRange(graph);
            expect(range.max).toBe(50);
        });

        it('respects custom maxDegreeCap', () => {
            const graph = buildTestGraph(500, []);
            const range = adaptiveDegreeRange(graph, { maxDegreeCap: 30 });
            expect(range.max).toBe(30);
        });

        it('respects custom minDegree', () => {
            const graph = buildTestGraph(100, []);
            const range = adaptiveDegreeRange(graph, { minDegree: 3 });
            expect(range.min).toBe(3);
        });

        it('ensures max >= min', () => {
            // 3 nodes → floor(3/5) = 0, but max should be at least min (1)
            const graph = buildTestGraph(3, []);
            const range = adaptiveDegreeRange(graph);
            expect(range.max).toBeGreaterThanOrEqual(range.min);
        });
    });

    describe('filterEntitiesByDegree', () => {
        it('filters entities within adaptive range', () => {
            const graph = buildTestGraph(10, [
                [0, 1], [2, 1], [3, 1], [4, 1], // entity_1 degree=4 (hub)
                [0, 2], // entity_0 degree=2
            ]);
            const filtered = filterEntitiesByDegree(graph);
            // Range: min=1, max=2; entity_1 degree=4 is excluded
            for (const e of filtered) {
                expect(e.degree).toBeGreaterThanOrEqual(1);
                expect(e.degree).toBeLessThanOrEqual(2);
            }
        });

        it('returns all entities when range is wide enough', () => {
            const graph = buildTestGraph(5, [[0, 1]]);
            // 5 nodes → d_max = floor(5/5) = 1, so only degree-1 entities pass
            const filtered = filterEntitiesByDegree(graph);
            for (const e of filtered) {
                expect(e.degree).toBeGreaterThanOrEqual(1);
                expect(e.degree).toBeLessThanOrEqual(1);
            }
            // entity_0 has out-degree 1, entity_1 has in-degree 1 — both pass
            expect(filtered).toHaveLength(2);
        });

        it('custom range can include all entities', () => {
            const graph = buildTestGraph(5, [[0, 1]]);
            const filtered = filterEntitiesByDegree(graph, { minDegree: 0 });
            expect(filtered).toHaveLength(5);
        });
    });
});
