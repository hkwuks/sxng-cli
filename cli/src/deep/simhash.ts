/**
 * SimHash - Locality-sensitive hashing for text deduplication
 */

export class SimHash {
    private hashCache = new Map<string, bigint>();

    hash(text: string): bigint {
        const normalized = text.toLowerCase().trim();

        // Check cache first
        const cached = this.hashCache.get(normalized);
        if (cached !== undefined) {
            return cached;
        }

        const tokens = this.tokenize(normalized);

        if (tokens.length === 0) return BigInt(0);

        const vector = new Array(64).fill(0);

        for (const token of tokens) {
            const h = this.stringHash(token);
            for (let i = 0; i < 64; i++) {
                const bit = (h >> BigInt(i)) & BigInt(1);
                vector[i] += bit === BigInt(1) ? 1 : -1;
            }
        }

        let simhash = BigInt(0);
        for (let i = 0; i < 64; i++) {
            if (vector[i] > 0) {
                simhash |= BigInt(1) << BigInt(i);
            }
        }

        // Cache the result
        this.hashCache.set(normalized, simhash);
        return simhash;
    }

    similarity(a: bigint, b: bigint): number {
        const xor = a ^ b;
        const distance = this.popCount(xor);
        return 1 - distance / 64;
    }

    isDuplicate(a: string, b: string, threshold: number = 0.85): boolean {
        return this.similarity(this.hash(a), this.hash(b)) >= threshold;
    }

    /** Clear the internal hash cache. Call this if memory becomes a concern. */
    clearCache(): void {
        this.hashCache.clear();
    }

    /** Get the current cache size for debugging. */
    getCacheSize(): number {
        return this.hashCache.size;
    }

    private tokenize(text: string): string[] {
        return text
            .split(/\s+/)
            .filter(t => t.length > 1);
    }

    private stringHash(s: string): bigint {
        let hash = BigInt(0);
        for (let i = 0; i < s.length; i++) {
            hash = (hash << BigInt(5)) - hash + BigInt(s.charCodeAt(i));
            hash &= BigInt('0xFFFFFFFFFFFFFFFF');
        }
        return hash;
    }

    private popCount(n: bigint): number {
        let count = 0;
        while (n !== BigInt(0)) {
            count++;
            n &= n - BigInt(1);
        }
        return count;
    }
}