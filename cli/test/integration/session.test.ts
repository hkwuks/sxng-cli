import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
    initSessionDir,
    resolveSessionPath,
    loadSessionResults,
    appendSessionResults,
    updateSessionGraph,
    loadSessionGraph,
    mergeExtractedContent,
} from '../../src/deep/session.js';
import { getDefaultSessionRoot } from '../../src/commands/session.js';

describe('session (integration)', () => {
    let sessionDir: string;

    beforeEach(() => {
        sessionDir = mkdtempSync(join(tmpdir(), 'sxng-test-'));
    });

    afterEach(() => {
        rmSync(sessionDir, { recursive: true, force: true });
    });

    describe('initSessionDir', () => {
        it('creates session directory with meta.json', () => {
            initSessionDir(sessionDir, 'test-user', 'test description', 'test query');
            // Should not throw on re-init
            initSessionDir(sessionDir, 'test-user', 'updated description', 'test query');
        });
    });

    describe('loadSessionResults', () => {
        it('returns empty array for new session', () => {
            const results = loadSessionResults(sessionDir);
            expect(results).toEqual([]);
        });
    });

    describe('appendSessionResults', () => {
        it('appends results and returns count', () => {
            const results = [
                { url: 'https://a.com', title: 'A', content: 'content a' },
                { url: 'https://b.com', title: 'B', content: 'content b' },
            ];
            const info = appendSessionResults(sessionDir, results);
            expect(info.added).toBe(2);
            expect(info.total).toBe(2);
        });

        it('deduplicates by URL on second append', () => {
            appendSessionResults(sessionDir, [
                { url: 'https://a.com', title: 'A', content: 'content a' },
            ]);
            const info = appendSessionResults(sessionDir, [
                { url: 'https://a.com', title: 'A updated', content: 'content a updated' },
                { url: 'https://b.com', title: 'B', content: 'content b' },
            ]);
            expect(info.added).toBe(1);
            expect(info.total).toBe(2);
        });
    });

    describe('updateSessionGraph', () => {
        it('creates graph with structural edges', () => {
            initSessionDir(sessionDir);
            const info = updateSessionGraph(sessionDir, 'test query', [
                { url: 'https://a.com', title: 'A' },
                { url: 'https://b.com', title: 'B' },
            ], 1);
            expect(info.nodesAdded).toBeGreaterThan(0);
            expect(info.edgesAdded).toBeGreaterThan(0);
        });

        it('loads saved graph back correctly', () => {
            initSessionDir(sessionDir);
            updateSessionGraph(sessionDir, 'test query', [
                { url: 'https://a.com', title: 'A' },
            ], 1);

            const graph = loadSessionGraph(sessionDir);
            expect(graph.order).toBeGreaterThan(0);
        });
    });

    describe('mergeExtractedContent', () => {
        it('merges content by URL match', () => {
            initSessionDir(sessionDir);
            appendSessionResults(sessionDir, [
                { url: 'https://a.com', title: 'A' },
                { url: 'https://b.com', title: 'B' },
            ]);

            const info = mergeExtractedContent(sessionDir, [
                { url: 'https://a.com', content: 'extracted content for A', length: 100 },
            ]);
            expect(info.updated).toBe(1);

            const results = loadSessionResults(sessionDir);
            const a = results.find(r => r.url === 'https://a.com');
            expect(a?.content).toBe('extracted content for A');
        });
    });

    describe('session root', () => {
        it('uses .sxng/sessions under the current working directory', () => {
            expect(getDefaultSessionRoot()).toBe(join(process.cwd(), '.sxng', 'sessions'));
            expect(resolveSessionPath('named')).toBe(join(process.cwd(), '.sxng', 'sessions', 'named'));
            expect(resolveSessionPath('new').startsWith(join(process.cwd(), '.sxng', 'sessions', 'ds_'))).toBe(true);
        });
    });
});
