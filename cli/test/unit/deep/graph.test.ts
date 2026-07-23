import { describe, it, expect } from 'vitest';
import {
    createGraph,
    entityId,
    resultId,
    queryId,
    domainId,
    nextPathId,
    buildStructuralEdges,
    bfsSubgraph,
    serializeGraph,
    deserializeGraph,
    graphStats,
    EDGE_RELATIONS,
    PathType,
} from '../../src/deep/graph.js';

describe('graph', () => {
    describe('ID generation', () => {
        it('generates entity ID with e: prefix', () => {
            expect(entityId('Tokio')).toMatch(/^e:tokio_/);
        });

        it('generates result ID with r: prefix', () => {
            expect(resultId('https://example.com')).toMatch(/^r:https_example_com_/);
        });

        it('generates query ID with q: prefix', () => {
            expect(queryId('rust async')).toMatch(/^q:rust_async_/);
        });

        it('generates domain ID with d: prefix', () => {
            expect(domainId('example.com')).toMatch(/^d:example_com_/);
        });

        it('keeps long values within a bounded ID length', () => {
            const longLabel = 'a'.repeat(100);
            const id = entityId(longLabel);
            expect(id.length).toBeLessThanOrEqual(60);
        });

        it('replaces non-word characters with underscore', () => {
            expect(entityId('tokio runtime')).toMatch(/^e:tokio_runtime_/);
            expect(entityId('async-std')).toMatch(/^e:async_std_/);
        });

        it('keeps collision-prone identifiers distinct', () => {
            const longPrefix = 'a'.repeat(70);

            expect(resultId(`${longPrefix}-one`)).not.toBe(resultId(`${longPrefix}-two`));
            expect(queryId(`${longPrefix}-one`)).not.toBe(queryId(`${longPrefix}-two`));
            expect(domainId(`${longPrefix}-one`)).not.toBe(domainId(`${longPrefix}-two`));
            expect(entityId('中文实体 A')).not.toBe(entityId('中文实体 B'));
        });
    });

    describe('createGraph', () => {
        it('creates an empty directed graph', () => {
            const graph = createGraph();
            expect(graph.order).toBe(0);
            expect(graph.size).toBe(0);
        });
    });

    describe('buildStructuralEdges', () => {
        it('builds query→result→domain edges', () => {
            const graph = createGraph();
            buildStructuralEdges(graph, 'rust async', [
                { url: 'https://tokio.rs', title: 'Tokio', rank: 1 },
                { url: 'https://async.rs', title: 'Async', rank: 2 },
            ], 1);

            expect(graph.order).toBe(5); // 1 query + 2 results + 2 domains
            expect(graph.size).toBe(4); // 2 query→result + 2 result→domain
        });

        it('adds round number to query node', () => {
            const graph = createGraph();
            buildStructuralEdges(graph, 'test', [], 3);

            const qId = queryId('test', 3);
            const attrs = graph.getNodeAttributes(qId);
            expect(attrs.round).toBe(3);
        });

        it('sets yields edge weight inversely to rank', () => {
            const graph = createGraph();
            buildStructuralEdges(graph, 'test', [
                { url: 'https://a.com', title: 'A', rank: 1 },
                { url: 'https://b.com', title: 'B', rank: 2 },
            ]);

            const qId = queryId('test');
            const r1 = resultId('https://a.com');
            const r2 = resultId('https://b.com');

            const w1 = graph.getEdgeAttributes(qId, r1).weight;
            const w2 = graph.getEdgeAttributes(qId, r2).weight;
            expect(w1).toBeGreaterThan(w2);
        });

        it('does not duplicate existing nodes', () => {
            const graph = createGraph();
            buildStructuralEdges(graph, 'test', [
                { url: 'https://a.com', title: 'A' },
            ]);
            const orderBefore = graph.order;

            buildStructuralEdges(graph, 'test', [
                { url: 'https://a.com', title: 'A' },
            ]);

            expect(graph.order).toBe(orderBefore);
        });

        it('keeps identical queries from different rounds distinct', () => {
            const graph = createGraph();
            buildStructuralEdges(graph, 'repeat query', [{ url: 'https://a.com', title: 'A' }], 1);
            buildStructuralEdges(graph, 'repeat query', [{ url: 'https://b.com', title: 'B' }], 2);

            expect(graphStats(graph).queries).toBe(2);
        });

        it('keeps local chunks with a shared long path as separate result nodes', () => {
            const graph = createGraph();
            const baseUrl = `file:///D:/documents/${'very-long-folder/'.repeat(6)}notes.md`;

            buildStructuralEdges(graph, 'local chunks', [
                { url: `${baseUrl}#chunk-1`, title: 'Notes' },
                { url: `${baseUrl}#chunk-2`, title: 'Notes' },
            ]);

            expect(graphStats(graph).results).toBe(2);
        });
    });

    describe('bfsSubgraph', () => {
        it('returns subgraph within given depth', () => {
            const graph = createGraph();
            buildStructuralEdges(graph, 'test', [
                { url: 'https://a.com', title: 'A' },
                { url: 'https://b.com', title: 'B' },
            ]);

            const qId = queryId('test');
            const sub = bfsSubgraph(graph, [qId], 1);
            expect(sub.order).toBe(3); // query + 2 results
        });

        it('returns empty graph for non-existent seeds', () => {
            const graph = createGraph();
            buildStructuralEdges(graph, 'test', [
                { url: 'https://a.com', title: 'A' },
            ]);

            const sub = bfsSubgraph(graph, ['e:nonexistent'], 2);
            expect(sub.order).toBe(0);
        });

        it('includes edges between visited nodes', () => {
            const graph = createGraph();
            buildStructuralEdges(graph, 'test', [
                { url: 'https://a.com', title: 'A' },
            ]);

            const qId = queryId('test');
            const sub = bfsSubgraph(graph, [qId], 2);
            expect(sub.size).toBeGreaterThan(0);
        });
    });

    describe('serialization', () => {
        it('round-trips through serialize/deserialize', () => {
            const graph = createGraph();
            buildStructuralEdges(graph, 'test', [
                { url: 'https://a.com', title: 'A' },
            ]);

            const serialized = serializeGraph(graph);
            const restored = deserializeGraph(serialized);

            expect(restored.order).toBe(graph.order);
            expect(restored.size).toBe(graph.size);
        });

        it('preserves node attributes after round-trip', () => {
            const graph = createGraph();
            buildStructuralEdges(graph, 'test', [
                { url: 'https://a.com', title: 'A Title' },
            ]);

            const serialized = serializeGraph(graph);
            const restored = deserializeGraph(serialized);

            const rId = resultId('https://a.com');
            const attrs = restored.getNodeAttributes(rId);
            expect(attrs.label).toBe('A Title');
            expect(attrs.type).toBe('result');
        });
    });

    describe('graphStats', () => {
        it('counts nodes by type', () => {
            const graph = createGraph();
            buildStructuralEdges(graph, 'test', [
                { url: 'https://a.com', title: 'A' },
            ]);

            const stats = graphStats(graph);
            expect(stats.queries).toBe(1);
            expect(stats.results).toBe(1);
            expect(stats.domains).toBe(1);
            expect(stats.entities).toBe(0);
        });

        it('counts entities added via mergeNode', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), {
                type: 'entity',
                label: 'tokio',
                entityType: 'runtime',
                score: 0.95,
            });

            const stats = graphStats(graph);
            expect(stats.entities).toBe(1);
            expect(stats.nodes).toBe(1);
        });
    });

    describe('new entity fields', () => {
        it('stores and retrieves reasoningPaths', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), {
                type: 'entity',
                label: 'tokio',
                reasoningPaths: ['p:chain_001'],
            });

            const attrs = graph.getNodeAttributes(entityId('tokio'));
            expect(attrs.reasoningPaths).toEqual(['p:chain_001']);
        });

        it('stores and retrieves sourceRounds and frequency', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), {
                type: 'entity',
                label: 'tokio',
                sourceRounds: [1, 2, 3],
                frequency: 5,
            });

            const attrs = graph.getNodeAttributes(entityId('tokio'));
            expect(attrs.sourceRounds).toEqual([1, 2, 3]);
            expect(attrs.frequency).toBe(5);
        });

        it('stores and retrieves obfuscatedLabel', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), {
                type: 'entity',
                label: 'tokio',
                obfuscatedLabel: 'an async runtime',
            });

            const attrs = graph.getNodeAttributes(entityId('tokio'));
            expect(attrs.obfuscatedLabel).toBe('an async runtime');
        });

        it('new fields survive serialization round-trip', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), {
                type: 'entity',
                label: 'tokio',
                reasoningPaths: ['p:chain_001', 'p:conj_002'],
                sourceRounds: [1, 2],
                frequency: 3,
                obfuscatedLabel: 'an async runtime',
            });

            const restored = deserializeGraph(serializeGraph(graph));
            const attrs = restored.getNodeAttributes(entityId('tokio'));
            expect(attrs.reasoningPaths).toEqual(['p:chain_001', 'p:conj_002']);
            expect(attrs.sourceRounds).toEqual([1, 2]);
            expect(attrs.frequency).toBe(3);
            expect(attrs.obfuscatedLabel).toBe('an async runtime');
        });

        it('old graph without new fields loads correctly', () => {
            const oldGraphExport = {
                attributes: {},
                nodes: [
                    { key: 'e:tokio', attributes: { type: 'entity', label: 'tokio', score: 0.9 } },
                    { key: 'r:https_example_com', attributes: { type: 'result', label: 'Example', url: 'https://example.com', rank: 1 } },
                ],
                edges: [],
                options: { allowSelfLoops: false, multi: false, type: 'directed' },
            };

            const graph = deserializeGraph(oldGraphExport);
            const attrs = graph.getNodeAttributes('e:tokio');
            expect(attrs.type).toBe('entity');
            expect(attrs.label).toBe('tokio');
            expect(attrs.reasoningPaths).toBeUndefined();
            expect(attrs.frequency).toBeUndefined();
            expect(attrs.obfuscatedLabel).toBeUndefined();
        });
    });

    describe('path nodes', () => {
        it('creates path node with auto-increment ID', () => {
            const graph = createGraph();
            const id1 = nextPathId(graph, 'composition_chain');
            expect(id1).toBe('p:chain_001');

            graph.mergeNode(id1, {
                type: 'path',
                label: 'Chain 1',
                pathType: 'composition_chain',
                hops: 3,
                entities: ['e:tokio', 'e:async_std', 'e:futures'],
            });

            const id2 = nextPathId(graph, 'composition_chain');
            expect(id2).toBe('p:chain_002');
        });

        it('different path types have independent counters', () => {
            const graph = createGraph();

            const chainId = nextPathId(graph, 'composition_chain');
            graph.mergeNode(chainId, { type: 'path', label: 'Chain 1', pathType: 'composition_chain' });

            const conjId = nextPathId(graph, 'conjunction');
            graph.mergeNode(conjId, { type: 'path', label: 'Conj 1', pathType: 'conjunction' });

            expect(chainId).toBe('p:chain_001');
            expect(conjId).toBe('p:conj_001');
        });

        it('rebuilds counter from existing nodes after deserialization', () => {
            const graph = createGraph();
            graph.mergeNode('p:chain_001', { type: 'path', label: 'Chain 1', pathType: 'composition_chain' });
            graph.mergeNode('p:chain_002', { type: 'path', label: 'Chain 2', pathType: 'composition_chain' });

            const serialized = serializeGraph(graph);
            const restored = deserializeGraph(serialized);

            const nextId = nextPathId(restored, 'composition_chain');
            expect(nextId).toBe('p:chain_003');
        });

        it('path node survives serialization round-trip', () => {
            const graph = createGraph();
            graph.mergeNode('p:chain_001', {
                type: 'path',
                label: 'Chain 1',
                pathType: 'composition_chain',
                hops: 3,
                entities: ['e:a', 'e:b', 'e:c'],
            });

            const restored = deserializeGraph(serializeGraph(graph));
            const attrs = restored.getNodeAttributes('p:chain_001');
            expect(attrs.type).toBe('path');
            expect(attrs.pathType).toBe('composition_chain');
            expect(attrs.hops).toBe(3);
            expect(attrs.entities).toEqual(['e:a', 'e:b', 'e:c']);
        });

        it('graphStats counts path nodes', () => {
            const graph = createGraph();
            graph.mergeNode('p:chain_001', { type: 'path', label: 'Chain 1', pathType: 'composition_chain' });
            graph.mergeNode('p:conj_001', { type: 'path', label: 'Conj 1', pathType: 'conjunction' });
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio' });

            const stats = graphStats(graph);
            expect(stats.paths).toBe(2);
            expect(stats.entities).toBe(1);
        });
    });

    describe('new edge relation types', () => {
        it('EDGE_RELATIONS contains all relation types', () => {
            expect(EDGE_RELATIONS.co_occurs_with).toBe('co_occurs_with');
            expect(EDGE_RELATIONS.mentioned_in).toBe('mentioned_in');
            expect(EDGE_RELATIONS.includes).toBe('includes');
        });

        it('can add co_occurs_with edge between entities', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio' });
            graph.mergeNode(entityId('hyper'), { type: 'entity', label: 'hyper' });
            graph.addEdge(entityId('tokio'), entityId('hyper'), {
                relation: 'co_occurs_with',
                weight: 0.8,
            });

            const edge = graph.getEdgeAttributes(entityId('tokio'), entityId('hyper'));
            expect(edge.relation).toBe('co_occurs_with');
            expect(edge.weight).toBe(0.8);
        });

        it('can add includes edge from path to entity', () => {
            const graph = createGraph();
            graph.mergeNode('p:chain_001', { type: 'path', label: 'Chain 1', pathType: 'composition_chain' });
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio' });
            graph.addEdge('p:chain_001', entityId('tokio'), {
                relation: 'includes',
                weight: 1,
            });

            const edge = graph.getEdgeAttributes('p:chain_001', entityId('tokio'));
            expect(edge.relation).toBe('includes');
        });
    });
});
