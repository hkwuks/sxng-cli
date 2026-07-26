import { describe, expect, it } from 'vitest';
import { obscuraDownloadUrl } from '../../../src/deep/extractor.js';

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
