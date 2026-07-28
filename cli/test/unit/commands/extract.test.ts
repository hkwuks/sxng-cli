import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runExtract } from '../../../src/commands/extract.js';
import type { ContentExtractor, ExtractedContent } from '../../../src/deep/extractor.js';
import { appendSessionResults, loadSessionResults } from '../../../src/deep/session.js';

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

    it('merges successful session extraction with its capture timestamp', async () => {
        const sessionDir = mkdtempSync(join(tmpdir(), 'sxng-extract-session-test-'));
        const url = 'https://example.com/article';
        const content = 'Captured source text. '.repeat(12);
        appendSessionResults(sessionDir, [{ url, title: 'Article', content: 'Caller-provided summary.' }]);
        const extractor = {
            extractBatch: vi.fn().mockResolvedValue([extractedContent(url, content)]),
        } as unknown as ContentExtractor;
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        try {
            expect(await runExtract(extractor, { session: sessionDir })).toBe(0);

            const envelope = JSON.parse(log.mock.calls[0][0]);
            expect(envelope.data).toMatchObject({
                stats: { success: 1, failed: 0 },
                session: { updated: 1, total: 1 },
            });
            expect(loadSessionResults(sessionDir)[0]).toMatchObject({ content, extractedAt: expect.any(Number) });
        } finally {
            rmSync(sessionDir, { recursive: true, force: true });
        }
    });

    it('rejects rate-limited Jina extraction without explicit URLs', async () => {
        const extractor = {
            extractBatch: vi.fn(),
        } as unknown as ContentExtractor;
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        expect(await runExtract(extractor, { session: 'research', jina: true })).toBe(1);

        const envelope = JSON.parse(log.mock.calls[0][0]);
        expect(envelope.error.code).toBe('JINA_REQUIRES_URLS');
        expect(extractor.extractBatch).not.toHaveBeenCalled();
    });

    it('allows an explicitly selected Jina URL to merge back into a session', async () => {
        const sessionDir = mkdtempSync(join(tmpdir(), 'sxng-jina-session-test-'));
        const url = 'https://example.com/article';
        const content = 'Jina-captured source text. '.repeat(12);
        appendSessionResults(sessionDir, [{ url, title: 'Article' }]);
        const extractor = {
            extractBatch: vi.fn().mockResolvedValue([extractedContent(url, content)]),
        } as unknown as ContentExtractor;
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        try {
            expect(await runExtract(extractor, { urls: [url], session: sessionDir, jina: true })).toBe(0);

            expect(extractor.extractBatch).toHaveBeenCalledWith([url]);
            expect(loadSessionResults(sessionDir)[0]).toMatchObject({ content, extractedAt: expect.any(Number) });
        } finally {
            rmSync(sessionDir, { recursive: true, force: true });
        }
    });
});
