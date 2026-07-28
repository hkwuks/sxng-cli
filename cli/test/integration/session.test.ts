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
    injectApprovedResults,
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

        it('keeps web results with matching titles when their URLs differ', () => {
            const info = appendSessionResults(sessionDir, [
                { url: 'https://a.com', title: 'Same title', source: 'sxng' },
                { url: 'https://b.com', title: 'Same title', source: 'sxng' },
            ]);

            expect(info.added).toBe(2);
            expect(info.total).toBe(2);
        });
    });

    describe('updateSessionGraph', () => {
        it('does not create structural graph nodes for unverified results', () => {
            initSessionDir(sessionDir);

            expect(updateSessionGraph(sessionDir, 'test query', [
                { url: 'https://a.com', title: 'A', content: 'Search summary only.' },
            ], 1)).toEqual({ nodesAdded: 0, edgesAdded: 0 });
            expect(loadSessionGraph(sessionDir).order).toBe(0);
        });

        it('creates graph with structural edges', () => {
            initSessionDir(sessionDir);
            const info = updateSessionGraph(sessionDir, 'test query', [
                { url: 'https://a.com', title: 'A', content: 'Verified A.', extractedAt: 1 },
                { url: 'https://b.com', title: 'B', content: 'Verified B.', extractedAt: 1 },
            ], 1);
            expect(info.nodesAdded).toBeGreaterThan(0);
            expect(info.edgesAdded).toBeGreaterThan(0);
        });

        it('loads saved graph back correctly', () => {
            initSessionDir(sessionDir);
            updateSessionGraph(sessionDir, 'test query', [
                { url: 'https://a.com', title: 'A', content: 'Verified A.', extractedAt: 1 },
            ], 1);

            const graph = loadSessionGraph(sessionDir);
            expect(graph.order).toBeGreaterThan(0);
        });
    });

    describe('approveResults', () => {
        it('rejects unverified web results without changing session state', () => {
            appendSessionResults(sessionDir, [
                { url: 'https://example.com/summary', title: 'Summary', content: 'Search-provided text only.' },
            ]);

            expect(approveResults(sessionDir, [0]).error).toMatchObject({ code: 'RESULT_NOT_VERIFIED', index: 0 });
            expect(loadSessionResults(sessionDir)[0].status).toBe('pending');
            expect(loadSessionGraph(sessionDir).order).toBe(0);
        });

        it('rejects an entire mixed approval when one selected result is unverified', () => {
            appendSessionResults(sessionDir, [
                { url: 'https://example.com/verified', title: 'Verified', content: 'Verified source content.', extractedAt: 1 },
                { url: 'https://example.com/unverified', title: 'Unverified', content: 'Search-provided text only.' },
            ]);

            expect(approveResults(sessionDir, [0, 1]).error).toMatchObject({ code: 'RESULT_NOT_VERIFIED', index: 1 });
            expect(loadSessionResults(sessionDir).map(result => result.status)).toEqual(['pending', 'pending']);
        });

        it('approves a local document chunk with captured content', () => {
            appendSessionResults(sessionDir, [
                {
                    url: 'file:///notes.txt#chunk-0', title: 'Notes', source: 'local',
                    content: 'Indexed local document content.', extractedAt: 1,
                },
            ]);

            const info = approveResults(sessionDir, [0]);

            expect(info.approved).toBe(1);
            expect(loadSessionResults(sessionDir)[0].status).toBe('approved');
        });

        it('does not inject an unverified legacy approved result into the graph', () => {
            const info = injectApprovedResults(sessionDir, [{
                url: 'https://example.com/legacy', title: 'Legacy', status: 'approved',
                origins: [{ query: 'legacy query', round: 1 }],
            }]);

            expect(info).toEqual({ nodesAdded: 0, edgesAdded: 0 });
            expect(loadSessionGraph(sessionDir).order).toBe(0);
        });

        it('approves only the selected local document chunk', () => {
            appendSessionResults(sessionDir, [
                { url: 'file:///notes.txt#chunk-0', title: 'Notes', source: 'local', content: 'First local chunk.', extractedAt: 1 },
                { url: 'file:///notes.txt#chunk-1', title: 'Notes', source: 'local', content: 'Second local chunk.', extractedAt: 1 },
            ]);

            const info = approveResults(sessionDir, [0]);

            expect(info.approved).toBe(1);
            expect(loadSessionResults(sessionDir).map(result => result.status))
                .toEqual(['approved', 'pending']);
        });

        it('injects only selected results into the query and round that found them', () => {
            appendSessionResults(sessionDir, [
                { url: 'https://a.com', title: 'A', content: 'Verified A.', extractedAt: 1, origins: [{ query: 'first query' }] },
            ]);
            appendSessionResults(sessionDir, [
                { url: 'https://b.com', title: 'B', content: 'Verified B.', extractedAt: 1, origins: [{ query: 'second query' }] },
            ]);

            const { approvedResults } = approveResults(sessionDir, [1]);
            injectApprovedResults(sessionDir, approvedResults);

            const graph = loadSessionGraph(sessionDir);
            const queries = graph.filterNodes((_id, attrs) => attrs.type === 'query');
            const results = graph.filterNodes((_id, attrs) => attrs.type === 'result');

            expect(queries).toHaveLength(1);
            expect(graph.getNodeAttributes(queries[0])).toMatchObject({ query: 'second query', round: 2 });
            expect(results).toHaveLength(1);
            expect(graph.getNodeAttributes(results[0]).url).toBe('https://b.com');
        });

        it('adds a new query edge when an already approved URL appears in a later round', () => {
            appendSessionResults(sessionDir, [
                { url: 'https://a.com', title: 'A', content: 'Verified A.', extractedAt: 1, origins: [{ query: 'first query' }] },
            ]);
            const { approvedResults } = approveResults(sessionDir, [0]);
            injectApprovedResults(sessionDir, approvedResults);

            const appendInfo = appendSessionResults(sessionDir, [
                { url: 'https://a.com', title: 'A', content: 'Verified A.', extractedAt: 1, origins: [{ query: 'second query' }] },
            ]);
            injectApprovedResults(sessionDir, appendInfo.approvedResults);

            const graph = loadSessionGraph(sessionDir);
            const queries = graph.filterNodes((_id, attrs) => attrs.type === 'query');

            expect(queries).toHaveLength(2);
            expect(loadSessionResults(sessionDir)[0].origins).toEqual([
                { query: 'first query', round: 1 },
                { query: 'second query', round: 2 },
            ]);
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
                { url: 'https://a.com', content: 'extracted content for A', length: 100, extractedAt: 1_700_000_000_000 },
            ]);
            expect(info.updated).toBe(1);

            const results = loadSessionResults(sessionDir);
            const a = results.find(r => r.url === 'https://a.com');
            expect(a?.content).toBe('extracted content for A');
            expect(a?.extractedAt).toBe(1_700_000_000_000);
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
