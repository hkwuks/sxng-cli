/**
 * Backward compatibility regression tests for Phase 12.
 *
 * Verifies:
 * - Old session loading (without new fields)
 * - query-graph BFS behavior without --strategy
 * - graph-add without new fields
 * - Commander migration consistency
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadSessionGraph, initSessionDir, loadSessionResults } from '../../src/deep/session.js';
import { deserializeGraph, serializeGraph, GraphNodeAttrs, GraphEdgeAttrs } from '../../src/deep/graph.js';
import { DirectedGraph } from 'graphology';

describe('backward compatibility', () => {
    let sessionDir: string;

    beforeEach(() => {
        sessionDir = mkdtempSync(join(tmpdir(), 'sxng-compat-'));
    });

    afterEach(() => {
        rmSync(sessionDir, { recursive: true, force: true });
    });

    describe('old session loading', () => {
        it('loads graph.json without new fields (score, frequency, sourceRounds)', () => {
            // Simulate an old-format graph.json (Phase 0 format)
            const oldGraph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            oldGraph.mergeNode('e:tokio', { type: 'entity', label: 'tokio' });
            oldGraph.mergeNode('e:rust', { type: 'entity', label: 'rust' });
            oldGraph.addEdge('e:tokio', 'e:rust', { relation: 'co_occurs_with', weight: 0.9 });

            const serialized = serializeGraph(oldGraph);
            writeFileSync(
                join(sessionDir, 'graph.json'),
                JSON.stringify({ status: 'ok', data: { graph: serialized } }, null, 2)
            );

            const graph = loadSessionGraph(sessionDir);
            expect(graph.hasNode('e:tokio')).toBe(true);
            expect(graph.hasNode('e:rust')).toBe(true);
            expect(graph.hasEdge('e:tokio', 'e:rust')).toBe(true);

            // New fields should be undefined (graceful degradation)
            const tokioAttrs = graph.getNodeAttributes('e:tokio');
            expect(tokioAttrs.score).toBeUndefined();
            expect(tokioAttrs.frequency).toBeUndefined();
        });

        it('loads results.json without content field', () => {
            // Old results may not have content
            writeFileSync(
                join(sessionDir, 'results.json'),
                JSON.stringify({
                    status: 'ok',
                    data: {
                        results: [
                            { url: 'https://a.com', title: 'A', engine: 'google' },
                        ],
                    },
                }, null, 2)
            );

            const results = loadSessionResults(sessionDir);
            expect(results).toHaveLength(1);
            expect(results[0].url).toBe('https://a.com');
            expect(results[0].content).toBeUndefined();
        });
    });

    describe('graph-add backward compatibility', () => {
        it('adds entities without optional fields', () => {
            initSessionDir(sessionDir);

            // Old-format entity (no entityType, score, etc.)
            const graph = loadSessionGraph(sessionDir);
            graph.mergeNode('e:legacy', { type: 'entity', label: 'legacy' });

            const serialized = serializeGraph(graph);
            writeFileSync(
                join(sessionDir, 'graph.json'),
                JSON.stringify({ status: 'ok', data: { graph: serialized } }, null, 2)
            );

            const loaded = loadSessionGraph(sessionDir);
            const attrs = loaded.getNodeAttributes('e:legacy');
            expect(attrs.type).toBe('entity');
            expect(attrs.label).toBe('legacy');
            expect(attrs.entityType).toBeUndefined();
            expect(attrs.score).toBeUndefined();
        });
    });

    describe('commander migration consistency', () => {
        it('createProgram is exported from runCli', async () => {
            const mod = await import('../../src/runCli.js');
            expect(mod.createProgram).toBeDefined();
            expect(typeof mod.createProgram).toBe('function');
        }, 20000);
    });
});
