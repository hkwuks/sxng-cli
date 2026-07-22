import { describe, it, expect } from 'vitest';
import { buildCoOccurrence, computeCrossResultFrequency, getExistingEntityContext } from '../../src/deep/co-occurrence.js';
import { createGraph, entityId, GraphNodeAttrs, GraphEdgeAttrs } from '../../src/deep/graph.js';

describe('co-occurrence', () => {
    const sampleResults = [
        { title: 'Tokio Runtime', content: 'tokio is an asynchronous runtime for the rust programming language' },
        { title: 'Async Std', content: 'async provides async standard library for rust programming' },
        { title: 'Rust Async Ecosystem', content: 'the rust async ecosystem includes tokio and async runtimes' },
    ];

    describe('buildCoOccurrence', () => {
        it('finds co-occurring term pairs', () => {
            const result = buildCoOccurrence(sampleResults);
            expect(result.pairs.length).toBeGreaterThan(0);
            // "rust" and "async" should co-occur in multiple results
            const rustAsync = result.pairs.find(
                p => (p.term1 === 'rust' && p.term2 === 'async') || (p.term1 === 'async' && p.term2 === 'rust')
            );
            expect(rustAsync).toBeDefined();
            expect(rustAsync!.count).toBeGreaterThanOrEqual(2);
        });

        it('respects threshold', () => {
            const result = buildCoOccurrence(sampleResults, { threshold: 3 });
            // With threshold=3, only pairs appearing in 3+ results pass
            for (const p of result.pairs) {
                expect(p.count).toBeGreaterThanOrEqual(3);
            }
        });

        it('reports truncation when terms exceed maxTerms', () => {
            // Create results with many unique terms
            const manyTerms = Array.from({ length: 100 }, (_, i) => ({
                title: `Doc ${i}`,
                content: `unique_term_${i} common_word another_word_${i}`,
            }));
            const result = buildCoOccurrence(manyTerms, { maxTerms: 10 });
            expect(result.truncated).toBe(true);
            expect(result.maxTerms).toBe(10);
        });

        it('reports no truncation when terms fit', () => {
            const result = buildCoOccurrence(sampleResults, { maxTerms: 50 });
            expect(result.truncated).toBe(false);
        });

        it('sorts pairs by count descending', () => {
            const result = buildCoOccurrence(sampleResults);
            for (let i = 1; i < result.pairs.length; i++) {
                expect(result.pairs[i - 1].count).toBeGreaterThanOrEqual(result.pairs[i].count);
            }
        });

        it('handles empty results', () => {
            const result = buildCoOccurrence([]);
            expect(result.pairs).toEqual([]);
            expect(result.truncated).toBe(false);
        });

        it('handles results without content', () => {
            const noContent = [{ title: 'No Content' }];
            const result = buildCoOccurrence(noContent);
            expect(result.pairs).toEqual([]);
        });
    });

    describe('computeCrossResultFrequency', () => {
        it('counts term frequency across results', () => {
            const freqs = computeCrossResultFrequency(sampleResults);
            expect(freqs.length).toBeGreaterThan(0);
            // "rust" should appear in multiple results
            const rust = freqs.find(f => f.term === 'rust');
            expect(rust).toBeDefined();
            expect(rust!.count).toBeGreaterThanOrEqual(2);
        });

        it('sorts by count descending', () => {
            const freqs = computeCrossResultFrequency(sampleResults);
            for (let i = 1; i < freqs.length; i++) {
                expect(freqs[i - 1].count).toBeGreaterThanOrEqual(freqs[i].count);
            }
        });

        it('respects top limit', () => {
            const freqs = computeCrossResultFrequency(sampleResults, { top: 3 });
            expect(freqs.length).toBeLessThanOrEqual(3);
        });

        it('only counts results with content', () => {
            const mixed = [
                { title: 'No Content' },
                { title: 'Has Content', content: 'tokio runtime' },
            ];
            const freqs = computeCrossResultFrequency(mixed);
            // Only 1 result with content, so "tokio" has count 1
            const tokio = freqs.find(f => f.term === 'tokio');
            expect(tokio?.count).toBe(1);
        });
    });

    describe('getExistingEntityContext', () => {
        it('returns entities with on-demand degrees', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio', entityType: 'runtime' });
            graph.mergeNode(entityId('hyper'), { type: 'entity', label: 'hyper', entityType: 'library' });
            graph.addEdge(entityId('tokio'), entityId('hyper'), { relation: 'depends_on', weight: 1 });

            const entities = getExistingEntityContext(graph);
            expect(entities).toHaveLength(2);
            expect(entities[0].label).toBe('tokio'); // higher degree
            expect(entities[0].degree).toBe(1);
        });

        it('returns empty for graph without entities', () => {
            const graph = createGraph();
            const entities = getExistingEntityContext(graph);
            expect(entities).toEqual([]);
        });
    });
});
