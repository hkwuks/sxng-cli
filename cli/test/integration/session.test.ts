import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
    initSessionDir,
    resolveSessionPath,
    loadSessionResults,
    appendSessionResults,
    approveResults,
    updateSessionGraph,
    loadSessionGraph,
    mergeExtractedContent,
} from '../../src/deep/session.js';
import { getDefaultSessionRoot, runSessionDelete } from '../../src/commands/session.js';

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

        it('continues to deduplicate web results with matching titles', () => {
            const info = appendSessionResults(sessionDir, [
                { url: 'https://a.com', title: 'Same title', source: 'sxng' },
                { url: 'https://b.com', title: 'Same title', source: 'sxng' },
            ]);

            expect(info.added).toBe(1);
            expect(info.total).toBe(1);
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

    describe('approveResults', () => {
        it('approves only the selected local document chunk', () => {
            appendSessionResults(sessionDir, [
                { url: 'file:///notes.txt#chunk-0', title: 'Notes', source: 'local' },
                { url: 'file:///notes.txt#chunk-1', title: 'Notes', source: 'local' },
            ]);

            const info = approveResults(sessionDir, [0]);

            expect(info.approved).toBe(1);
            expect(loadSessionResults(sessionDir).map(result => result.status))
                .toEqual(['approved', 'pending']);
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

        it('merges content into only the selected local document chunk', () => {
            appendSessionResults(sessionDir, [
                { url: 'file:///notes.txt#chunk-0', title: 'Notes', source: 'local', content: 'first' },
                { url: 'file:///notes.txt#chunk-1', title: 'Notes', source: 'local', content: 'second' },
            ]);

            const info = mergeExtractedContent(sessionDir, [
                { url: 'file:///notes.txt#chunk-1', content: 'updated second' },
            ]);

            expect(info.updated).toBe(1);
            expect(loadSessionResults(sessionDir).map(result => result.content))
                .toEqual(['first', 'updated second']);
        });
    });

    describe('session root', () => {
        it('uses .sxng/sessions under the current working directory', () => {
            expect(getDefaultSessionRoot()).toBe(join(process.cwd(), '.sxng', 'sessions'));
            expect(resolveSessionPath('named')).toBe(join(process.cwd(), '.sxng', 'sessions', 'named'));
            expect(resolveSessionPath('new').startsWith(join(process.cwd(), '.sxng', 'sessions', 'ds_'))).toBe(true);
        });
    });

    describe('runSessionDelete', () => {
        it('rejects paths that escape the session root', async () => {
            const root = join(sessionDir, 'sessions');
            const outside = join(sessionDir, 'outside');
            mkdirSync(root, { recursive: true });
            mkdirSync(outside, { recursive: true });
            writeFileSync(join(outside, 'keep.txt'), 'keep');

            const code = await runSessionDelete(['../outside'], undefined, root);

            expect(code).toBe(1);
            expect(existsSync(outside)).toBe(true);
            expect(existsSync(join(outside, 'keep.txt'))).toBe(true);
        });
    });
});
