import { describe, it, expect } from 'vitest';
import {
    computeJaccard,
    computeJaccardWithMeta,
    adjustQuery,
    checkQueryRedundancy,
    RedundancyConfig,
    RedundancyResult,
} from '../../src/deep/query-redundancy.js';

describe('query-redundancy', () => {
    describe('computeJaccard', () => {
        it('returns 1 for identical queries', () => {
            expect(computeJaccard('rust async runtime', 'rust async runtime')).toBe(1);
        });

        it('returns 0 for completely different queries', () => {
            expect(computeJaccard('rust async runtime', 'python machine learning')).toBe(0);
        });

        it('computes word-level Jaccard for long queries', () => {
            // A={rust,async,runtime,framework}, B={rust,async,programming,language}
            // intersection={rust,async}=2, union=6, 2/6≈0.333
            const sim = computeJaccard('rust async runtime framework', 'rust async programming language');
            expect(sim).toBeCloseTo(1 / 3);
        });

        it('is case-insensitive', () => {
            const sim = computeJaccard('Rust Async Runtime', 'rust async runtime');
            expect(sim).toBe(1);
        });

        it('computes char bigram Jaccard for short queries (≤2 words)', () => {
            // "rust" vs "rusty" — bigram overlap
            const sim = computeJaccard('rust', 'rusty');
            // rust bigrams: ru, us, st (3)
            // rusty bigrams: ru, us, st, ty (4)
            // intersection: ru, us, st (3), union: 3+4-3=4
            // 3/4 = 0.75
            expect(sim).toBeCloseTo(0.75);
        });

        it('short vs long query uses char bigram', () => {
            // Short query (≤2 words) triggers bigram path
            const sim = computeJaccard('rust', 'rust programming language');
            // "rust" bigrams: ru, us, st
            // "rust programming language" bigrams from full lowercase
            // Significant overlap expected from "rust" portion
            expect(sim).toBeGreaterThan(0);
        });

        it('handles empty strings', () => {
            expect(computeJaccard('', '')).toBe(0);
            expect(computeJaccard('rust', '')).toBe(0);
        });

        it('partial overlap in long queries', () => {
            // Both 4+ words → word-level Jaccard
            // A={rust,async,runtime,performance}, B={async,runtime,framework,performance}
            // intersection={async,runtime,performance}=3, union=5, 3/5=0.6
            const sim = computeJaccard('rust async runtime performance', 'async runtime framework performance');
            expect(sim).toBeCloseTo(0.6);
        });
    });

    describe('computeJaccardWithMeta', () => {
        it('returns word algorithm for long queries', () => {
            const result = computeJaccardWithMeta(
                'rust async runtime framework',
                'rust async programming language'
            );
            expect(result.algorithm).toBe('word');
            expect(result.score).toBeCloseTo(1 / 3);
        });

        it('returns bigram algorithm when both queries are short', () => {
            const result = computeJaccardWithMeta('rust', 'rusty');
            expect(result.algorithm).toBe('bigram');
            expect(result.score).toBeCloseTo(0.75);
        });

        it('returns bigram algorithm when one query is short', () => {
            const result = computeJaccardWithMeta('rust', 'rust programming language');
            expect(result.algorithm).toBe('bigram');
            expect(result.score).toBeGreaterThan(0);
        });

        it('returns score=1 and word algorithm for identical queries', () => {
            const result = computeJaccardWithMeta('rust async', 'rust async');
            expect(result.score).toBe(1);
            expect(result.algorithm).toBe('word');
        });
    });

    describe('checkQueryRedundancy', () => {
        const defaultConfig: RedundancyConfig = {
            jaccardThreshold: 0.7,
            action: 'warn',
        };

        it('detects redundant query above threshold', () => {
            // 4+ words each → word-level Jaccard
            // A={rust,async,runtime,benchmark,performance,testing}
            // B={rust,async,runtime,benchmark,framework,testing}
            // intersection=5, union=7, 5/7≈0.714 — above 0.7
            const result = checkQueryRedundancy(
                'rust async runtime benchmark performance testing',
                ['rust async runtime benchmark framework testing'],
                defaultConfig
            );

            expect(result.isRedundant).toBe(true);
            expect(result.maxSimilarity).toBeGreaterThan(0.7);
            expect(result.similarQueries.length).toBe(1);
        });

        it('passes non-redundant query below threshold', () => {
            const result = checkQueryRedundancy(
                'python machine learning',
                ['rust async runtime'],
                defaultConfig
            );

            expect(result.isRedundant).toBe(false);
            expect(result.similarQueries.length).toBe(0);
        });

        it('handles empty history', () => {
            const result = checkQueryRedundancy('rust async', [], defaultConfig);

            expect(result.isRedundant).toBe(false);
            expect(result.maxSimilarity).toBe(0);
        });

        it('finds multiple similar queries', () => {
            const result = checkQueryRedundancy(
                'rust async runtime benchmark performance testing',
                [
                    'rust async runtime benchmark framework testing',
                    'rust async runtime benchmark debugging testing',
                ],
                defaultConfig
            );

            expect(result.isRedundant).toBe(true);
            expect(result.similarQueries.length).toBe(2);
        });

        it('respects custom threshold', () => {
            const strictConfig: RedundancyConfig = {
                jaccardThreshold: 0.9,
                action: 'warn',
            };

            // 4/6 ≈ 0.667 — well below 0.9
            const result = checkQueryRedundancy(
                'rust async runtime benchmark',
                ['rust async runtime framework'],
                strictConfig
            );

            expect(result.isRedundant).toBe(false);
        });

        it('returns adjust result with adjustedQuery when action=adjust', () => {
            const adjustConfig: RedundancyConfig = {
                jaccardThreshold: 0.7,
                action: 'adjust',
            };

            const result = checkQueryRedundancy(
                'rust async runtime benchmark performance testing',
                ['rust async runtime benchmark framework testing'],
                adjustConfig
            );

            expect(result.isRedundant).toBe(true);
            expect(result.adjustedQuery).toBeDefined();
            // Should remove overlapping words, keep non-overlapping
            expect(result.adjustedQuery).toBe('performance');
        });

        it('returns skip result without adjustedQuery', () => {
            const skipConfig: RedundancyConfig = {
                jaccardThreshold: 0.7,
                action: 'skip',
            };

            const result = checkQueryRedundancy(
                'rust async runtime benchmark performance testing',
                ['rust async runtime benchmark framework testing'],
                skipConfig
            );

            expect(result.isRedundant).toBe(true);
            expect(result.adjustedQuery).toBeUndefined();
            expect(result.action).toBe('skip');
        });

        // ── Algorithm-aware threshold tests ─────────────────────

        it('uses bigramThreshold for short query comparisons', () => {
            // "rust" vs "rusty": bigram Jaccard ~0.75
            // falls below jaccardThreshold 0.7 (if word-level were used)
            // but above bigramThreshold 0.5 → detected as redundant
            const config: RedundancyConfig = {
                jaccardThreshold: 0.7,
                bigramThreshold: 0.5,
                action: 'warn',
            };

            const result = checkQueryRedundancy(
                'rust',
                ['rusty'],
                config
            );

            // bigram Jaccard ~0.75 >= 0.5 → redundant
            expect(result.isRedundant).toBe(true);
            expect(result.similarQueries.length).toBe(1);
        });

        it('falls back bigramThreshold to jaccardThreshold when unset', () => {
            // No bigramThreshold set → fallback to jaccardThreshold (0.7)
            // "rust" vs "rusty" bigram ~0.75 >= 0.7 → redundant
            const config: RedundancyConfig = {
                jaccardThreshold: 0.7,
                // bigramThreshold intentionally unset
                action: 'warn',
            };

            const result = checkQueryRedundancy(
                'rust',
                ['rusty'],
                config
            );

            expect(result.isRedundant).toBe(true);
        });

        it('passes short queries with low bigram overlap when fallback threshold is high', () => {
            // No bigramThreshold → fallback to jaccardThreshold (0.9)
            // "tokio" vs "tensor" has 0 bigram overlap — well below 0.9
            const config: RedundancyConfig = {
                jaccardThreshold: 0.9,
                action: 'warn',
            };

            const result = checkQueryRedundancy(
                'tokio',
                ['tensor'],
                config
            );

            expect(result.isRedundant).toBe(false);
        });
    });

    describe('adjustQuery', () => {
        it('removes overlapping words', () => {
            const adjusted = adjustQuery('rust async performance', [
                { query: 'rust async runtime', similarity: 0.8 },
            ]);
            expect(adjusted).toBe('performance');
        });

        it('returns original if all words overlap', () => {
            const adjusted = adjustQuery('rust async', [
                { query: 'rust async runtime', similarity: 0.9 },
            ]);
            expect(adjusted).toBe('rust async');
        });

        it('handles multiple similar queries', () => {
            const adjusted = adjustQuery('rust async performance benchmark', [
                { query: 'rust async runtime', similarity: 0.8 },
                { query: 'async benchmark tools', similarity: 0.7 },
            ]);
            // "rust", "async", "benchmark" all overlap — only "performance" remains
            expect(adjusted).toBe('performance');
        });

        it('is case-insensitive for overlap detection', () => {
            const adjusted = adjustQuery('Rust Async Performance', [
                { query: 'rust async runtime', similarity: 0.8 },
            ]);
            expect(adjusted).toBe('Performance');
        });
    });
});
