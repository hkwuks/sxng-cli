import { describe, expect, it, vi } from 'vitest';
import { ContentExtractor, obscuraDownloadUrl } from '../../../src/deep/extractor.js';

describe('obscuraDownloadUrl', () => {
    it.each([
        'obscura-x86_64-linux.tar.gz',
        'obscura-aarch64-linux.tar.gz',
        'obscura-x86_64-macos.tar.gz',
        'obscura-aarch64-macos.tar.gz',
    ])('keeps the %s release asset on the GitHub HTTPS endpoint', (tarball) => {
        const url = new URL(obscuraDownloadUrl(tarball));

        expect(url.protocol).toBe('https:');
        expect(url.hostname).toBe('github.com');
        expect(url.pathname).toBe(`/h4ckf0r0day/obscura/releases/latest/download/${tarball}`);
    });
});

describe('ContentExtractor', () => {
    it('uses Jina directly when an Agent explicitly requests it', async () => {
        const url = 'https://example.com/article';
        const jinaContent = 'J'.repeat(120);

        const fetchMock = vi.fn(async () => ({
            ok: true,
            text: async () => jinaContent,
        }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            const result = await new ContentExtractor({ jina: true }).extract(url);

            expect(result.method).toBe('jina');
            expect(result.content).toBe(jinaContent);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(fetchMock).toHaveBeenCalledWith(
                `https://r.jina.ai/${url}`,
                expect.any(Object),
            );
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
