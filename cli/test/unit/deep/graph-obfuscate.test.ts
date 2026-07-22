import { describe, it, expect } from 'vitest';
import {
    listObfuscationCandidates,
    applyFallbackRules,
    runGraphObfuscate,
    ObfuscationResult,
} from '../../src/deep/graph-obfuscate.js';
import { createGraph, entityId, GraphNodeAttrs, GraphEdgeAttrs, serializeGraph, deserializeGraph } from '../../src/deep/graph.js';
import { DirectedGraph } from 'graphology';

describe('graph-obfuscate', () => {
    describe('listObfuscationCandidates', () => {
        it('lists entities without obfuscatedLabel', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio', entityType: 'runtime' });
            graph.mergeNode(entityId('rust'), { type: 'entity', label: 'rust', entityType: 'language' });

            const result = listObfuscationCandidates(graph);

            expect(result.mode).toBe('list');
            expect(result.candidates.length).toBe(2);
            expect(result.stats.totalEntities).toBe(2);
            expect(result.stats.alreadyObfuscated).toBe(0);
            expect(result.stats.needObfuscation).toBe(2);
            expect(result.candidates[0].hasObfuscatedLabel).toBe(false);
        });

        it('marks entities with obfuscatedLabel', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), {
                type: 'entity', label: 'tokio',
                obfuscatedLabel: 'a popular async runtime',
            });
            graph.mergeNode(entityId('rust'), { type: 'entity', label: 'rust' });

            const result = listObfuscationCandidates(graph);

            expect(result.stats.alreadyObfuscated).toBe(1);
            expect(result.stats.needObfuscation).toBe(1);
            const tokio = result.candidates.find(c => c.label === 'tokio');
            expect(tokio?.hasObfuscatedLabel).toBe(true);
            expect(tokio?.obfuscatedLabel).toBe('a popular async runtime');
        });

        it('skips specified entity types', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio', entityType: 'runtime' });
            graph.mergeNode(entityId('rust'), { type: 'entity', label: 'rust', entityType: 'language' });

            const result = listObfuscationCandidates(graph, { skipEntityTypes: ['language'] });

            expect(result.candidates.length).toBe(1);
            expect(result.candidates[0].label).toBe('tokio');
        });

        it('returns empty for graph with no entities', () => {
            const graph = createGraph();
            graph.mergeNode('r:example.com', { type: 'result', label: 'Example' });

            const result = listObfuscationCandidates(graph);

            expect(result.candidates).toEqual([]);
            expect(result.stats.totalEntities).toBe(0);
        });
    });

    describe('fallback rules (experimental)', () => {
        describe('version removal', () => {
            it('removes version number: "TypeScript 5.8" → "TypeScript latest"', () => {
                const graph = createGraph();
                graph.mergeNode(entityId('typescript_5_8'), { type: 'entity', label: 'TypeScript 5.8', entityType: 'language' });

                const result = applyFallbackRules(graph);

                expect(result.fallbackResults!.length).toBe(1);
                expect(result.fallbackResults![0].rule).toBe('remove_version');
                expect(result.fallbackResults![0].obfuscated).toBe('TypeScript latest');

                const attrs = graph.getNodeAttributes(entityId('typescript_5_8'));
                expect(attrs.obfuscatedLabel).toBe('TypeScript latest');
            });

            it('removes "v" prefixed version: "React v19" → "React latest"', () => {
                const graph = createGraph();
                graph.mergeNode(entityId('react_v19'), { type: 'entity', label: 'React v19', entityType: 'framework' });

                const result = applyFallbackRules(graph);

                expect(result.fallbackResults![0].rule).toBe('remove_version');
                expect(result.fallbackResults![0].obfuscated).toBe('React latest');
            });

            it('removes multi-part version: "Python 3.12.1" → "Python latest"', () => {
                const graph = createGraph();
                graph.mergeNode(entityId('python_3_12_1'), { type: 'entity', label: 'Python 3.12.1', entityType: 'language' });

                const result = applyFallbackRules(graph);

                expect(result.fallbackResults![0].obfuscated).toBe('Python latest');
            });
        });

        describe('date generalization', () => {
            it('generalizes "February 2026" → "early 2026"', () => {
                const graph = createGraph();
                graph.mergeNode(entityId('february_2026'), { type: 'entity', label: 'February 2026', entityType: 'concept' });

                const result = applyFallbackRules(graph);

                expect(result.fallbackResults!.length).toBe(1);
                expect(result.fallbackResults![0].rule).toBe('date_generalization');
                expect(result.fallbackResults![0].obfuscated).toBe('early 2026');
            });

            it('generalizes "Q3 2025" → "late 2025"', () => {
                const graph = createGraph();
                graph.mergeNode(entityId('q3_2025'), { type: 'entity', label: 'Q3 2025', entityType: 'concept' });

                const result = applyFallbackRules(graph);

                expect(result.fallbackResults![0].obfuscated).toBe('late 2025');
            });

            it('generalizes abbreviated month "Sep 2026" → "late 2026"', () => {
                const graph = createGraph();
                graph.mergeNode(entityId('sep_2026'), { type: 'entity', label: 'Sep 2026', entityType: 'concept' });

                const result = applyFallbackRules(graph);

                expect(result.fallbackResults![0].rule).toBe('date_generalization');
                expect(result.fallbackResults![0].obfuscated).toBe('late 2026');
            });
        });

        describe('category replacement', () => {
            it('replaces with category using entityType', () => {
                const graph = createGraph();
                graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio', entityType: 'runtime' });

                const result = applyFallbackRules(graph);

                expect(result.fallbackResults!.length).toBe(1);
                expect(result.fallbackResults![0].rule).toBe('category_replacement');
                expect(result.fallbackResults![0].obfuscated).toBe('a runtime');
            });

            it('uses "a framework" for framework entityType', () => {
                const graph = createGraph();
                graph.mergeNode(entityId('react'), { type: 'entity', label: 'React', entityType: 'framework' });

                const result = applyFallbackRules(graph);

                expect(result.fallbackResults![0].obfuscated).toBe('a framework');
            });

            it('uses "a programming language" for language entityType', () => {
                const graph = createGraph();
                graph.mergeNode(entityId('rust'), { type: 'entity', label: 'Rust', entityType: 'language' });

                const result = applyFallbackRules(graph);

                expect(result.fallbackResults![0].obfuscated).toBe('a programming language');
            });
        });

        describe('rule priority', () => {
            it('version removal takes priority over category replacement', () => {
                const graph = createGraph();
                graph.mergeNode(entityId('typescript_5_8'), { type: 'entity', label: 'TypeScript 5.8', entityType: 'language' });

                const result = applyFallbackRules(graph);

                // "TypeScript 5.8" matches version removal first
                expect(result.fallbackResults![0].rule).toBe('remove_version');
                expect(result.fallbackResults![0].obfuscated).toBe('TypeScript latest');
            });

            it('date generalization takes priority over category replacement', () => {
                const graph = createGraph();
                graph.mergeNode(entityId('february_2026'), { type: 'entity', label: 'February 2026', entityType: 'concept' });

                const result = applyFallbackRules(graph);

                expect(result.fallbackResults![0].rule).toBe('date_generalization');
            });
        });

        it('skips entities that already have obfuscatedLabel', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), {
                type: 'entity', label: 'tokio', entityType: 'runtime',
                obfuscatedLabel: 'already obfuscated',
            });
            graph.mergeNode(entityId('rust'), { type: 'entity', label: 'Rust', entityType: 'language' });

            const result = applyFallbackRules(graph);

            expect(result.stats.alreadyObfuscated).toBe(1);
            // Only rust should have fallback applied
            expect(result.fallbackResults!.length).toBe(1);
        });

        it('writes obfuscatedLabel back to graph nodes', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio', entityType: 'runtime' });

            applyFallbackRules(graph);

            const attrs = graph.getNodeAttributes(entityId('tokio'));
            expect(attrs.obfuscatedLabel).toBe('a runtime');
        });

        it('leaves entities without matching rule unchanged', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('foo'), { type: 'entity', label: 'foo' });

            const result = applyFallbackRules(graph);

            expect(result.fallbackResults!.length).toBe(0);
            const attrs = graph.getNodeAttributes(entityId('foo'));
            expect(attrs.obfuscatedLabel).toBeUndefined();
        });
    });

    describe('runGraphObfuscate dispatch', () => {
        it('dispatches to list mode', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio' });

            const result = runGraphObfuscate(graph, { mode: 'list' });

            expect(result.mode).toBe('list');
            expect(result.candidates.length).toBe(1);
            expect(result.fallbackResults).toBeUndefined();
        });

        it('dispatches to fallback_rules mode', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio', entityType: 'runtime' });

            const result = runGraphObfuscate(graph, { mode: 'fallback_rules' });

            expect(result.mode).toBe('fallback_rules');
            expect(result.fallbackResults).toBeDefined();
        });

        it('returns empty for unknown mode', () => {
            const graph = createGraph();
            const result = runGraphObfuscate(graph, { mode: 'unknown' as any });

            expect(result.candidates).toEqual([]);
        });
    });

    describe('integration with graph-add obfuscatedLabel', () => {
        it('obfuscatedLabel survives graph serialization round-trip', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), {
                type: 'entity', label: 'tokio', entityType: 'runtime',
                obfuscatedLabel: 'a popular async runtime',
            });

            // Serialize and deserialize
            const serialized = serializeGraph(graph);
            const restored = deserializeGraph(serialized);

            const attrs = restored.getNodeAttributes(entityId('tokio'));
            expect(attrs.obfuscatedLabel).toBe('a popular async runtime');
        });

        it('fallback rules then list shows updated candidates', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio', entityType: 'runtime' });

            // Apply fallback rules
            applyFallbackRules(graph);

            // Now list should show tokio as already obfuscated
            const listResult = listObfuscationCandidates(graph);
            const tokio = listResult.candidates.find(c => c.label === 'tokio');
            expect(tokio?.hasObfuscatedLabel).toBe(true);
            expect(tokio?.obfuscatedLabel).toBe('a runtime');
        });
    });
});
