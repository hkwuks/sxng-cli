import { describe, expect, it } from 'vitest';
import { obscuraDownloadUrl } from '../../../src/deep/extractor.js';

describe('obscuraDownloadUrl', () => {
    it('uses the fixed GitHub HTTPS release download endpoint', () => {
        const url = obscuraDownloadUrl('obscura-x86_64-linux.tar.gz');

        expect(url).toBe('https://github.com/h4ckf0r0day/obscura/releases/latest/download/obscura-x86_64-linux.tar.gz');
        expect(new URL(url).protocol).toBe('https:');
    });
});
