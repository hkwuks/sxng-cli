import { describe, it, expect } from 'vitest';
import { dedupe } from '../../src/deep/dedupe.js';

interface SearchResult {
    title: string;
    url: string;
    content: string;
    engine: string;
    category: string;
    score?: number;
}

function dedupeResults(results: SearchResult[], jaccardThreshold = 0.92): SearchResult[] {
    return dedupe(results, jaccardThreshold);
}

describe('dedupeResults', () => {
    it('removes URL duplicates with trailing slash', () => {
        const results: SearchResult[] = [
            { title: 'Test', url: 'https://example.com/page', content: 'content A', engine: 'google', category: 'general', score: 10 },
            { title: 'Test2', url: 'https://example.com/page/', content: 'content B', engine: 'bing', category: 'general', score: 5 },
        ];
        const deduped = dedupeResults(results);
        expect(deduped).toHaveLength(1);
        expect(deduped[0].url).toBe('https://example.com/page');
        expect(deduped[0].score).toBe(10);
    });

    it('removes URL duplicates with fragments', () => {
        const results: SearchResult[] = [
            { title: 'A', url: 'https://example.com/doc', content: 'alpha', engine: 'google', category: 'general', score: 8 },
            { title: 'B', url: 'https://example.com/doc#section', content: 'beta', engine: 'bing', category: 'general', score: 6 },
        ];
        const deduped = dedupeResults(results);
        expect(deduped).toHaveLength(1);
        expect(deduped[0].score).toBe(8);
    });

    it('removes URL duplicates with different query param order', () => {
        const results: SearchResult[] = [
            { title: 'A', url: 'https://example.com/search?q=test&lang=en', content: 'alpha', engine: 'google', category: 'general', score: 9 },
            { title: 'B', url: 'https://example.com/search?lang=en&q=test', content: 'beta', engine: 'bing', category: 'general', score: 3 },
        ];
        const deduped = dedupeResults(results);
        expect(deduped).toHaveLength(1);
        expect(deduped[0].score).toBe(9);
    });

    it('removes near-duplicate content via Jaccard', () => {
        const results: SearchResult[] = [
            { title: 'Python Tutorial', url: 'https://site-a.com/python', content: 'Learn Python programming with examples and exercises for beginners', engine: 'google', category: 'general', score: 10 },
            { title: 'Python Tutorial', url: 'https://site-b.com/python-guide', content: 'Learn Python programming with examples and exercises for beginners', engine: 'bing', category: 'general', score: 8 },
        ];
        const deduped = dedupeResults(results);
        expect(deduped).toHaveLength(1);
        expect(deduped[0].score).toBe(10);
    });

    it('keeps results with different content', () => {
        const results: SearchResult[] = [
            { title: 'Python Basics', url: 'https://site-a.com/python', content: 'Introduction to Python variables and data types', engine: 'google', category: 'general', score: 10 },
            { title: 'Python Advanced', url: 'https://site-b.com/python-advanced', content: 'Decorators, generators, and async programming in Python', engine: 'bing', category: 'general', score: 8 },
        ];
        const deduped = dedupeResults(results);
        expect(deduped).toHaveLength(2);
    });

    it('handles empty results', () => {
        const deduped = dedupeResults([]);
        expect(deduped).toHaveLength(0);
    });

    it('handles single result', () => {
        const results: SearchResult[] = [
            { title: 'Solo', url: 'https://example.com/solo', content: 'only one', engine: 'google', category: 'general', score: 5 },
        ];
        const deduped = dedupeResults(results);
        expect(deduped).toHaveLength(1);
    });

    it('URL dedup runs before Jaccard dedup', () => {
        const results: SearchResult[] = [
            { title: 'Guide', url: 'https://example.com/guide', content: 'Complete guide to TypeScript', engine: 'google', category: 'general', score: 10 },
            { title: 'Guide', url: 'https://example.com/guide/', content: 'Complete guide to TypeScript', engine: 'bing', category: 'general', score: 7 },
            { title: 'Guide Mirror', url: 'https://mirror.com/guide', content: 'Complete guide to TypeScript', engine: 'ddg', category: 'general', score: 5 },
        ];
        const deduped = dedupeResults(results);
        expect(deduped).toHaveLength(1);
        expect(deduped[0].score).toBe(10);
    });

    it('respects custom Jaccard threshold', () => {
        const results: SearchResult[] = [
            { title: 'A', url: 'https://a.com/x', content: 'The quick brown fox jumps over the lazy dog', engine: 'google', category: 'general', score: 10 },
            { title: 'B', url: 'https://b.com/y', content: 'The quick brown fox jumps over the lazy cat', engine: 'bing', category: 'general', score: 8 },
        ];
        const dedupedLow = dedupeResults(results, 0.5);
        const dedupedHigh = dedupeResults(results, 0.99);
        expect(dedupedHigh.length).toBeGreaterThanOrEqual(dedupedLow.length);
    });

    it('keeps higher-scored result when URL dedup merges (after score sort)', () => {
        // In service.ts, results are sorted by score DESC before dedup.
        // Replicate that: sort first, then dedup.
        const results: SearchResult[] = [
            { title: 'Low Score', url: 'https://example.com/page/', content: 'low', engine: 'bing', category: 'general', score: 2 },
            { title: 'High Score', url: 'https://example.com/page', content: 'high', engine: 'google', category: 'general', score: 20 },
        ];
        results.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
        const deduped = dedupeResults(results);
        expect(deduped).toHaveLength(1);
        expect(deduped[0].score).toBe(20);
    });
});
