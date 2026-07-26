import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { verifyObscuraAssetDigest } from '../../../src/deep/extractor.js';

describe('verifyObscuraAssetDigest', () => {
    const archive = Buffer.from('verified obscura archive');
    const sha256 = createHash('sha256').update(archive).digest('hex');

    it('accepts the matching GitHub sha256 asset digest', () => {
        expect(verifyObscuraAssetDigest(archive, `sha256:${sha256}`)).toBe(true);
    });

    it('rejects a missing, malformed, or mismatched digest', () => {
        expect(verifyObscuraAssetDigest(archive)).toBe(false);
        expect(verifyObscuraAssetDigest(archive, 'sha512:abc')).toBe(false);
        expect(verifyObscuraAssetDigest(archive, `sha256:${'0'.repeat(64)}`)).toBe(false);
    });
});
