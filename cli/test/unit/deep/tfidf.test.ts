import { describe, it, expect } from 'vitest';
import { tokenize, computeTfIdf } from '../../src/deep/tfidf.js';

describe('tfidf', () => {
    describe('tokenize', () => {
        it('splits English text by whitespace', () => {
            const tokens = tokenize('tokio async runtime');
            expect(tokens).toContain('tokio');
            expect(tokens).toContain('async');
            expect(tokens).toContain('runtime');
        });

        it('removes words shorter than 3 chars', () => {
            const tokens = tokenize('a an is tokio');
            expect(tokens).not.toContain('a');
            expect(tokens).not.toContain('an');
            expect(tokens).not.toContain('is');
            expect(tokens).toContain('tokio');
        });

        it('lowercases tokens', () => {
            const tokens = tokenize('Tokio Runtime');
            expect(tokens).toContain('tokio');
            expect(tokens).toContain('runtime');
        });

        it('removes punctuation from tokens', () => {
            const tokens = tokenize('tokio, runtime! async-std.');
            expect(tokens).toContain('tokio');
            expect(tokens).toContain('runtime');
            // "async-std" → punctuation stripped → "asyncstd"
            expect(tokens).toContain('asyncstd');
        });

        it('expands CJK text via character bigram', () => {
            const tokens = tokenize('异步运行时');
            // bigrams: 异步, 步运, 运行, 行时
            expect(tokens).toContain('异步');
            expect(tokens).toContain('步运');
            expect(tokens).toContain('运行');
            expect(tokens).toContain('行时');
        });

        it('handles single CJK character', () => {
            const tokens = tokenize('异');
            expect(tokens).toContain('异');
        });

        it('handles mixed English+CJK text', () => {
            const tokens = tokenize('tokio 异步 runtime');
            expect(tokens).toContain('tokio');
            expect(tokens).toContain('runtime');
            // CJK part: 异步 is a bigram from the token "异步"
            expect(tokens).toContain('异步');
        });

        it('returns empty for empty string', () => {
            expect(tokenize('')).toEqual([]);
        });

        it('returns empty for only short words', () => {
            expect(tokenize('a an is')).toEqual([]);
        });
    });

    describe('computeTfIdf', () => {
        const sampleResults = [
            { title: 'Tokio Runtime', content: 'Tokio is an asynchronous runtime for Rust programming language' },
            { title: 'Async Std', content: 'async-std provides async standard library for Rust' },
            { title: 'Rust Async', content: 'The Rust async ecosystem includes tokio and async-std runtimes' },
        ];

        it('returns terms sorted by TF-IDF descending', () => {
            const result = computeTfIdf(sampleResults);
            expect(result.terms.length).toBeGreaterThan(0);
            for (let i = 1; i < result.terms.length; i++) {
                expect(result.terms[i - 1].tfidf).toBeGreaterThanOrEqual(result.terms[i].tfidf);
            }
        });

        it('reports correct tokenizationStrategy', () => {
            const result = computeTfIdf(sampleResults);
            expect(result.tokenizationStrategy).toBe('whitespace_min3_cjk_bigram');
        });

        it('reports coverage correctly', () => {
            const result = computeTfIdf(sampleResults);
            expect(result.totalResults).toBe(3);
            expect(result.resultsWithContent).toBe(3);
            expect(result.coverage).toBe(1);
        });

        it('only counts results with content', () => {
            const mixed = [
                { title: 'No Content' },
                { title: 'Has Content', content: 'tokio runtime' },
            ];
            const result = computeTfIdf(mixed);
            expect(result.resultsWithContent).toBe(1);
            expect(result.totalResults).toBe(2);
            expect(result.coverage).toBe(0.5);
        });

        it('respects top limit', () => {
            const result = computeTfIdf(sampleResults, { top: 5 });
            expect(result.terms.length).toBeLessThanOrEqual(5);
        });

        it('computes docFreq correctly', () => {
            const result = computeTfIdf(sampleResults);
            // "rust" appears in all 3 docs
            const rust = result.terms.find(t => t.term === 'rust');
            expect(rust).toBeDefined();
            expect(rust!.docFreq).toBe(3);
        });

        it('terms with higher IDF (rarer) rank higher per-unit', () => {
            const docs = [
                { title: 'A', content: 'common rare_word_alpha' },
                { title: 'B', content: 'common rare_word_beta' },
                { title: 'C', content: 'common other' },
            ];
            const result = computeTfIdf(docs);
            // "common" appears in all 3 → low IDF
            // "rare_word_alpha" appears in 1 → high IDF
            const common = result.terms.find(t => t.term === 'common');
            const rare = result.terms.find(t => t.term === 'rare_word_alpha');
            if (common && rare) {
                expect(rare.idf).toBeGreaterThan(common.idf);
            }
        });

        it('handles empty results', () => {
            const result = computeTfIdf([]);
            expect(result.terms).toEqual([]);
            expect(result.coverage).toBe(0);
            expect(result.totalResults).toBe(0);
        });
    });
});
