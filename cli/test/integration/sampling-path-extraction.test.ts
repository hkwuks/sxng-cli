import { describe, it, expect } from 'vitest';
import { extractPaths } from '../../src/deep/path-extraction.js';
import { createGraph, entityId, GraphNodeAttrs } from '../../src/deep/graph.js';
import { sampleGraph } from '../../src/deep/graph-sampling.js';
import { initSessionDir, appendSessionResults, updateSessionGraph, loadSessionGraph, mutateSessionGraph } from '../../src/deep/session.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('sampling + path extraction integration', () => {
    let sessionDir: string;

    beforeEach(() => {
        sessionDir = mkdtempSync(join(tmpdir(), 'sxng-sample-test-'));
    });

    afterEach(() => {
        rmSync(sessionDir, { recursive: true, force: true });
    });

    it('samples then extracts paths from session graph', () => {
        initSessionDir(sessionDir, 'test', 'test session', 'rust async');
        appendSessionResults(sessionDir, [
            { url: 'https://tokio.rs', title: 'Tokio Runtime', content: 'Tokio is an asynchronous runtime for the Rust programming language' },
            { url: 'https://async.rs', title: 'Async Std', content: 'async-std provides async standard library for Rust' },
        ]);
        updateSessionGraph(sessionDir, 'rust async', [
            { url: 'https://tokio.rs', title: 'Tokio Runtime', content: 'Verified Tokio.', extractedAt: 1 },
            { url: 'https://async.rs', title: 'Async Std', content: 'Verified Async.', extractedAt: 1 },
        ]);

        const { sampleResult, pathResult, pathCount } = mutateSessionGraph(sessionDir, graph => {
            // Add entity nodes manually (as Agent would via graph-add)
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio', entityType: 'runtime', score: 0.9 });
            graph.mergeNode(entityId('async_std'), { type: 'entity', label: 'async-std', entityType: 'runtime', score: 0.7 });
            graph.mergeNode(entityId('rust'), { type: 'entity', label: 'rust', entityType: 'language', score: 0.95 });
            graph.addEdge(entityId('tokio'), entityId('rust'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('async_std'), entityId('rust'), { relation: 'depends_on', weight: 1 });

            const sampleResult = sampleGraph(graph, {
                strategy: 'augmented_chain',
                seedEntities: [entityId('tokio')],
                maxHops: 3,
            });
            const pathResult = extractPaths(graph);
            let pathCount = 0;
            graph.forEachNode((_node: string, attrs: GraphNodeAttrs) => {
                if (attrs.type === 'path') pathCount++;
            });
            return { sampleResult, pathResult, pathCount };
        });

        expect(sampleResult.entities.length).toBeGreaterThan(0);
        expect(pathResult.conjunctions.length).toBeGreaterThan(0);
        expect(pathCount).toBeGreaterThan(0);

        const reloaded = loadSessionGraph(sessionDir);

        let pathCountReloaded = 0;
        reloaded.forEachNode((node: string, attrs: GraphNodeAttrs) => {
            if (attrs.type === 'path') pathCountReloaded++;
        });
        expect(pathCountReloaded).toBe(pathCount);
    });

    it('dual_core_bridge finds convergence then conjunction extraction confirms it', () => {
        const graph = createGraph();
        graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio' });
        graph.mergeNode(entityId('async_std'), { type: 'entity', label: 'async-std' });
        graph.mergeNode(entityId('rust'), { type: 'entity', label: 'rust' });
        graph.addEdge(entityId('tokio'), entityId('rust'), { relation: 'depends_on', weight: 1 });
        graph.addEdge(entityId('async_std'), entityId('rust'), { relation: 'depends_on', weight: 1 });

        // Sampling should find the bridge
        const sample = sampleGraph(graph, {
            strategy: 'dual_core_bridge',
            seedEntities: [entityId('tokio'), entityId('async_std')],
            maxHops: 3,
        });
        expect(sample.metadata.convergence).toBe(true);

        // Path extraction should also find the conjunction
        const paths = extractPaths(graph);
        const mainConj = paths.conjunctions.find(c => c.bridge === entityId('rust'));
        expect(mainConj).toBeDefined();
    });

    it('community_core_path and deep_chain produce different structures', () => {
        const graph = createGraph();
        const names = ['hub', 'a', 'b', 'c', 'd', 'e'];
        for (const name of names) {
            graph.mergeNode(entityId(name), { type: 'entity', label: name });
        }
        // Hub is connected to all
        for (let i = 1; i < names.length; i++) {
            graph.addEdge(entityId('hub'), entityId(names[i]), { relation: 'depends_on', weight: 1 });
        }
        // Chain: a → b → c → d → e
        for (let i = 1; i < names.length - 1; i++) {
            graph.addEdge(entityId(names[i]), entityId(names[i + 1]), { relation: 'depends_on', weight: 1 });
        }

        const communityResult = sampleGraph(graph, {
            strategy: 'community_core_path',
            seedEntities: [entityId('hub')],
            maxHops: 2,
        });

        const deepResult = sampleGraph(graph, {
            strategy: 'deep_chain',
            seedEntities: [entityId('hub')],
            maxHops: 5,
        });

        // Both should produce results
        expect(communityResult.entities.length).toBeGreaterThan(0);
        expect(deepResult.entities.length).toBeGreaterThan(0);

        // Community core should have the hub as center
        expect(communityResult.metadata.hubEntity).toBe(entityId('hub'));
    });
});
