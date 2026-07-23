import { describe, it, expect } from 'vitest';
import { rrf } from '../../src/deep/rrf.js';
import { resultUrlKey } from '../../src/deep/dedupe.js';

describe('rrf', () => {
    it('returns empty for empty input', () => {
        expect(rrf([])).toEqual([]);
    });

    it('fuses single ranking preserving order', () => {
        const result = rrf([
            [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        ]);
        expect(result.map(r => r.id)).toEqual(['a', 'b', 'c']);
    });

    it('fuses two rankings with overlap', () => {
        const result = rrf([
            [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
            [{ id: 'b' }, { id: 'a' }, { id: 'd' }],
        ]);
        // 'a' and 'b' appear in both, should rank higher
        const ids = result.map(r => r.id);
        expect(ids).toContain('a');
        expect(ids).toContain('b');
        // Items in both rankings have higher scores
        const aScore = result.find(r => r.id === 'a')!.score;
        const dScore = result.find(r => r.id === 'd')!.score;
        expect(aScore).toBeGreaterThan(dScore);
    });

    it('respects custom k parameter', () => {
        const result1 = rrf([[{ id: 'a' }, { id: 'b' }]], 60);
        const result2 = rrf([[{ id: 'a' }, { id: 'b' }]], 1);
        // Lower k → bigger score differences between ranks
        const diff1 = result1[0].score - result1[1].score;
        const diff2 = result2[0].score - result2[1].score;
        expect(diff2).toBeGreaterThan(diff1);
    });

    it('throws on non-positive k', () => {
        expect(() => rrf([], 0)).toThrow();
        expect(() => rrf([], -1)).toThrow();
    });

    it('skips items without id', () => {
        const result = rrf([
            [{ id: 'a' }, { notid: 'x' } as any, { id: 'b' }],
        ]);
        expect(result).toHaveLength(2);
    });

    it('keeps local document chunks as separate fusion candidates', () => {
        const chunks = [
            { url: 'file:///notes.txt#chunk-0', source: 'local' },
            { url: 'file:///notes.txt#chunk-1', source: 'local' },
        ];

        const result = rrf([chunks.map(chunk => ({ id: resultUrlKey(chunk) }))]);

        expect(result.map(item => item.id)).toEqual([
            'file:///notes.txt#chunk-0',
            'file:///notes.txt#chunk-1',
        ]);
    });
});
