import { describe, it, expect } from 'vitest';
import {
    assessResultQuality,
    assessLatestResultQuality,
    QualityScore,
    QualityThresholds,
} from '../../src/deep/quality-assess.js';
import { SessionResult } from '../../src/deep/session.js';

function makeResults(overrides: Partial<SessionResult>[] = []): SessionResult[] {
    return overrides.map((r, i) => ({
        url: r.url ?? `https://example${i}.com/page`,
        title: r.title ?? `Result ${i}`,
        content: r.content,
        engine: r.engine ?? 'google',
        ...r,
    }));
}

describe('quality-assess', () => {
    describe('assessResultQuality', () => {
        it('returns good verdict when all indicators pass', () => {
            const newResults = makeResults(
                Array.from({ length: 8 }, (_, i) => ({
                    url: `https://domain${i}.com/page`,
                    title: `Title ${i}`,
                    content: 'x'.repeat(300),
                }))
            );

            const result = assessResultQuality(newResults, []);

            expect(result.verdict).toBe('good');
            expect(result.failedIndicators).toEqual([]);
            expect(result.breakdown.contentDepth.pass).toBe(true);
            expect(result.breakdown.sourceDiversity.pass).toBe(true);
            expect(result.breakdown.novelty.pass).toBe(true);
        });

        it('returns acceptable verdict when 1 indicator fails', () => {
            // Only 2 domains → sourceDiversity fails
            // contentDepth and novelty pass
            const newResults = makeResults([
                { url: 'https://a.com/1', title: 'A1', content: 'x'.repeat(300) },
                { url: 'https://a.com/2', title: 'A2', content: 'x'.repeat(300) },
            ]);

            const result = assessResultQuality(newResults, []);

            expect(result.verdict).toBe('acceptable');
            expect(result.failedIndicators.length).toBe(1);
        });

        it('returns poor verdict when ≥2 indicators fail', () => {
            // Empty results → contentDepth and sourceDiversity fail
            const newResults: SessionResult[] = [];

            const result = assessResultQuality(newResults, []);

            expect(result.verdict).toBe('poor');
            expect(result.failedIndicators.length).toBeGreaterThanOrEqual(2);
        });

        it('handles empty session gracefully', () => {
            const newResults: SessionResult[] = [];

            const result = assessResultQuality(newResults, []);

            expect(result.verdict).toBe('poor');
            expect(result.failedIndicators.length).toBeGreaterThanOrEqual(2);
            expect(result.breakdown.contentDepth.value).toBe(0);
            expect(result.breakdown.sourceDiversity.value).toBe(0);
            expect(result.breakdown.novelty.value).toBe(0);
        });

        it('content depth only counts extracted results (with content field)', () => {
            // 3 results with content (avg length 300), 3 results without content
            const newResults = makeResults([
                { url: 'https://a.com/1', title: 'A1', content: 'x'.repeat(300) },
                { url: 'https://b.com/2', title: 'A2', content: 'x'.repeat(300) },
                { url: 'https://c.com/3', title: 'A3', content: 'x'.repeat(300) },
                { url: 'https://d.com/4', title: 'A4' },  // no content
                { url: 'https://e.com/5', title: 'A5' },  // no content
                { url: 'https://f.com/6', title: 'A6' },  // no content
            ]);

            const result = assessResultQuality(newResults, []);

            // Average content depth = 300 (only extracted results counted)
            expect(result.breakdown.contentDepth.value).toBe(300);
            expect(result.breakdown.contentDepth.pass).toBe(true);
        });

        it('content depth fails when no results have content', () => {
            const newResults = makeResults([
                { url: 'https://a.com/1', title: 'A1' },
                { url: 'https://b.com/2', title: 'A2' },
            ]);

            const result = assessResultQuality(newResults, []);

            expect(result.breakdown.contentDepth.value).toBe(0);
            expect(result.breakdown.contentDepth.pass).toBe(false);
        });

        it('computes source diversity from distinct domains', () => {
            const newResults = makeResults([
                { url: 'https://a.com/1', title: 'A1' },
                { url: 'https://b.com/2', title: 'A2' },
                { url: 'https://c.com/3', title: 'A3' },
                { url: 'https://a.com/4', title: 'A4' },  // duplicate domain
            ]);

            const result = assessResultQuality(newResults, []);

            expect(result.breakdown.sourceDiversity.value).toBe(3); // a, b, c
            expect(result.breakdown.sourceDiversity.pass).toBe(true);
        });

        it('computes novelty correctly with no prior results', () => {
            const newResults = makeResults([
                { url: 'https://a.com/1', title: 'Unique new result', content: 'new content' },
            ]);

            const result = assessResultQuality(newResults, []);

            // No prior results → everything is novel
            expect(result.breakdown.novelty.value).toBe(1);
            expect(result.breakdown.novelty.pass).toBe(true);
        });

        it('computes novelty correctly when all results are similar to existing', () => {
            const existingResults = makeResults([
                { url: 'https://a.com/1', title: 'Rust async runtime', content: 'Rust async runtime is a framework' },
            ]);
            const newResults = makeResults([
                { url: 'https://b.com/2', title: 'Rust async runtime', content: 'Rust async runtime is a framework' },
            ]);

            const result = assessResultQuality(newResults, existingResults);

            // Identical text → similarity ~1 → not novel
            expect(result.breakdown.novelty.value).toBe(0);
            expect(result.breakdown.novelty.pass).toBe(false);
        });

        it('does not compare a result against itself when assessing novelty', () => {
            const results = makeResults([
                { url: 'https://a.com/1', title: 'A1', content: 'A unique extracted result with enough content to assess.', status: 'approved' },
            ]);

            const result = assessResultQuality(results, results);

            expect(result.breakdown.novelty.value).toBe(1);
            expect(result.breakdown.novelty.pass).toBe(true);
        });

        it('treats distinct Chinese content as novel', () => {
            const existingResults = makeResults([
                { url: 'https://a.com/1', title: '政策', content: '城市轨道交通项目已经完成环境影响评估并对外公示。', status: 'approved' },
            ]);
            const newResults = makeResults([
                { url: 'https://b.com/2', title: '教育', content: '本市新增三所学校并计划在秋季学期正式招生。' },
            ]);

            const result = assessResultQuality(newResults, existingResults);

            expect(result.breakdown.novelty.value).toBe(1);
        });

        it('compares the latest round against only earlier approved results', () => {
            const results = makeResults([
                {
                    url: 'https://a.com/1', title: 'Round one', content: 'The complete approved report describes a verified infrastructure milestone.',
                    status: 'approved', origins: [{ query: 'first', round: 1 }],
                },
                {
                    url: 'https://b.com/2', title: 'Round two', content: 'The complete approved report describes a verified infrastructure milestone.',
                    status: 'approved', origins: [{ query: 'second', round: 2 }],
                },
            ]);

            const result = assessLatestResultQuality(results);

            expect(result.breakdown.novelty.value).toBe(0);
        });

        it('assesses sessions without recorded rounds without self-comparison', () => {
            const results = makeResults([
                { url: 'https://a.com/1', title: 'Legacy', content: 'A unique result retained from a session created before round tracking.' },
            ]);

            const result = assessLatestResultQuality(results);

            expect(result.breakdown.novelty.value).toBe(1);
        });

        it('supports custom thresholds via thresholdOverride', () => {
            const newResults = makeResults([
                { url: 'https://a.com/1', title: 'A1', content: 'x'.repeat(300) },
                { url: 'https://b.com/2', title: 'A2', content: 'x'.repeat(300) },
            ]);

            // Default: contentDepth threshold=150, these results pass (300 chars)
            const defaultResult = assessResultQuality(newResults, []);
            expect(defaultResult.breakdown.contentDepth.pass).toBe(true);

            // Override: contentDepth threshold=500, now fails
            const overridden = assessResultQuality(newResults, [], { contentDepth: 500 });
            expect(overridden.breakdown.contentDepth.pass).toBe(false);
        });
    });
});
