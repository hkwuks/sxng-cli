import { afterEach, describe, expect, it, vi } from 'vitest';
import { runExtract } from '../../../src/commands/extract.js';
import type { ContentExtractor, ExtractedContent } from '../../../src/deep/extractor.js';

function extractedContent(url: string, content: string): ExtractedContent {
    return {
        title: url,
        content,
        excerpt: '',
        url,
        length: content.length,
        extractedAt: 0,
    };
}

describe('runExtract', () => {
    afterEach(() => vi.restoreAllMocks());

    it('compares complete extracted content instead of only its first 500 characters', async () => {
        const prefix = 'This shared introduction appears on both pages before their independent analysis. '.repeat(20);
        const extractor = {
            extractBatch: vi.fn().mockResolvedValue([
                extractedContent('https://example.com/a', `${prefix}${'The first report examines renewable energy storage. '.repeat(60)}`),
                extractedContent('https://example.com/b', `${prefix}${'The second report examines quantum error correction. '.repeat(60)}`),
            ]),
        } as unknown as ContentExtractor;
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        expect(await runExtract(extractor, { urls: ['https://example.com/a', 'https://example.com/b'] })).toBe(0);

        const envelope = JSON.parse(log.mock.calls[0][0]);
        expect(envelope.data.extracted).toHaveLength(2);
        expect(envelope.data.stats).toMatchObject({ success: 2, failed: 0 });
    });
});
