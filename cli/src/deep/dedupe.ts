/**
 * Deduplication utilities for search results
 */

import { SimHash } from './simhash.js';

export interface DedupItem {
    url: string;
    title: string;
    content: string;
    [key: string]: unknown;
}

export function normalizeUrl(url: string): string {
    try {
        const u = new URL(url);
        // Remove trailing slash, sort params, strip fragments
        u.pathname = u.pathname.replace(/\/$/, '') || '/';
        u.hash = '';
        u.searchParams.sort();
        return u.toString();
    } catch {
        return url;
    }
}

export function dedupeByUrl(items: DedupItem[]): DedupItem[] {
    const seen = new Map<string, DedupItem>();

    for (const item of items) {
        const norm = normalizeUrl(item.url);
        if (!seen.has(norm)) {
            seen.set(norm, item);
        }
    }

    return Array.from(seen.values());
}

export function dedupeBySimHash(items: DedupItem[], threshold: number = 0.85): DedupItem[] {
    const simhash = new SimHash();
    const kept: DedupItem[] = [];
    const hashes: bigint[] = [];

    for (const item of items) {
        const text = `${item.title} ${item.content}`;
        const h = simhash.hash(text);

        let isDuplicate = false;
        for (const existing of hashes) {
            if (simhash.similarity(h, existing) >= threshold) {
                isDuplicate = true;
                break;
            }
        }

        if (!isDuplicate) {
            kept.push(item);
            hashes.push(h);
        }
    }

    return kept;
}

export function dedupe(items: DedupItem[], simThreshold: number = 0.85): DedupItem[] {
    const urlDeduped = dedupeByUrl(items);
    return dedupeBySimHash(urlDeduped, simThreshold);
}