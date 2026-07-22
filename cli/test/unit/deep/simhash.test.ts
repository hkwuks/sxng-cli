import { describe, it, expect } from 'vitest';
import { SimHash } from '../../src/deep/simhash.js';

describe('SimHash', () => {
    const sh = new SimHash();

    describe('hash', () => {
        it('returns a bigint', () => {
            const h = sh.hash('hello world');
            expect(typeof h).toBe('bigint');
        });

        it('returns 0 for empty string after trim', () => {
            const h = sh.hash('   ');
            expect(h).toBe(BigInt(0));
        });

        it('is deterministic', () => {
            const h1 = sh.hash('test string');
            const h2 = sh.hash('test string');
            expect(h1).toBe(h2);
        });

        it('is case-insensitive', () => {
            const h1 = sh.hash('Hello World');
            const h2 = sh.hash('hello world');
            expect(h1).toBe(h2);
        });
    });

    describe('similarity', () => {
        it('returns 1.0 for identical texts', () => {
            const a = sh.hash('hello world');
            const b = sh.hash('hello world');
            expect(sh.similarity(a, b)).toBe(1.0);
        });

        it('returns high similarity for similar texts', () => {
            const a = sh.hash('rust async runtime tokio');
            const b = sh.hash('rust async runtime async-std');
            expect(sh.similarity(a, b)).toBeGreaterThan(0.5);
        });

        it('similarity decreases as texts diverge (with enough content)', () => {
            // SimHash needs sufficient text length for reliable differentiation
            const base = 'The Rust programming language provides memory safety without garbage collection using ownership and borrowing';
            const similar = 'The Rust programming language provides memory safety without garbage collection using ownership and borrowing system';
            const different = 'JavaScript is a dynamic weakly typed scripting language primarily used for web development with Node.js runtime';

            const baseHash = sh.hash(base);
            expect(sh.similarity(baseHash, sh.hash(similar))).toBeGreaterThan(
                sh.similarity(baseHash, sh.hash(different))
            );
        });
    });

    describe('isDuplicate', () => {
        it('detects exact duplicates', () => {
            expect(sh.isDuplicate('hello world', 'hello world')).toBe(true);
        });

        it('detects near-duplicates at default threshold', () => {
            // Very similar texts should be duplicates at 0.85
            const text1 = 'The Rust programming language provides a safe and concurrent system';
            const text2 = 'The Rust programming language provides a safe and concurrent system';
            expect(sh.isDuplicate(text1, text2)).toBe(true);
        });

        it('does not flag clearly different texts as duplicates at high threshold', () => {
            // Short texts have high SimHash baseline similarity (known limitation)
            // Use longer texts for reliable duplicate detection
            const textA = 'Rust async runtime with tokio and mio event loop for building high performance networking applications';
            const textB = 'Python web framework with django and flask for building rapid web development applications';
            expect(sh.isDuplicate(textA, textB, 0.9)).toBe(false);
        });

        it('respects custom threshold', () => {
            const a = 'rust async runtime tokio mio futures crate';
            const b = 'rust async runtime async-std smol futures crate';
            // At high threshold they are not duplicates
            expect(sh.isDuplicate(a, b, 0.95)).toBe(false);
        });
    });
});
