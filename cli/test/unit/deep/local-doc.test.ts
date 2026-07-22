import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { tmpdir } from 'os';
import { scan } from '../../src/deep/local-doc/scanner.js';
import { buildIndex, hasIndex, loadIndex, getIndexMeta } from '../../src/deep/local-doc/indexer.js';
import { docSearch } from '../../src/deep/local-doc/searcher.js';
import { appendSessionResults, loadSessionResults, loadSessionRounds, resolveSessionPath } from '../../src/deep/session.js';

// Helper: create temp directory with test files
function createTestDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'sxng-ldoc-'));
    for (const [relPath, content] of Object.entries(files)) {
        const absPath = join(dir, relPath);
        mkdirSync(dirname(absPath), { recursive: true });
        writeFileSync(absPath, content, 'utf-8');
    }
    return dir;
}

// ── Scanner Tests ────────────────────────────────────────────────

describe('local-doc scanner', () => {
    let testDir: string;

    afterEach(() => {
        if (testDir) rmSync(testDir, { recursive: true, force: true });
    });

    it('scans markdown files and chunks by heading', () => {
        testDir = createTestDir({
            'doc.md': '# Title\n\nIntro text\n\n## Section 1\n\nContent one\n\n## Section 2\n\nContent two',
        });
        const chunks = scan(testDir);
        expect(chunks.length).toBe(3);
        expect(chunks[0].filePath).toBe('doc.md');
        expect(chunks[0].content).toContain('Intro text');
        expect(chunks[1].content).toContain('Content one');
        expect(chunks[2].content).toContain('Content two');
    });

    it('parses YAML frontmatter title', () => {
        testDir = createTestDir({
            'note.md': '---\ntitle: My Note\n---\n\n# Heading\n\nContent here',
        });
        const chunks = scan(testDir);
        expect(chunks.length).toBeGreaterThanOrEqual(1);
        expect(chunks[0].title).toBe('My Note');
    });

    it('uses filename as fallback when no frontmatter title', () => {
        testDir = createTestDir({
            'no-frontmatter.md': '# Just Content\n\nPlain text here',
        });
        const chunks = scan(testDir);
        expect(chunks.length).toBeGreaterThanOrEqual(1);
        expect(chunks[0].title).toBe('no-frontmatter.md');
    });

    it('splits txt files by paragraphs', () => {
        testDir = createTestDir({
            'notes.txt': 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
        });
        const chunks = scan(testDir);
        expect(chunks.length).toBe(3);
        expect(chunks[0].content).toContain('First paragraph');
        expect(chunks[1].content).toContain('Second paragraph');
        expect(chunks[2].content).toContain('Third paragraph');
    });

    it('filters by custom extensions', () => {
        testDir = createTestDir({
            'a.md': '# A\n\nContent',
            'b.txt': 'Plain text',
            'c.json': '{"key": "value"}',
        });
        const chunks = scan(testDir, { extensions: ['json'] });
        expect(chunks.length).toBe(1);
        expect(chunks[0].filePath).toBe('c.json');
    });

    it('skips files > maxFileSize', () => {
        testDir = createTestDir({
            'small.md': '# Small\n\ncontent',
        });
        // Write a large file directly
        const largePath = join(testDir, 'large.md');
        writeFileSync(largePath, '# ' + 'x'.repeat(1024 * 1024)); // ~1MB of content
        const chunks = scan(testDir, { maxFileSize: 100 }); // 100 bytes max
        expect(chunks.length).toBe(1); // only small.md
        expect(chunks[0].filePath).toBe('small.md');
    });

    it('throws for nonexistent path', () => {
        expect(() => scan(resolve('/nonexistent-path-12345'))).toThrow('Path not found');
    });

    it('returns empty array for path with no matching files', () => {
        testDir = createTestDir({});
        const chunks = scan(testDir);
        expect(chunks).toEqual([]);
    });

    it('skips empty files', () => {
        testDir = createTestDir({
            'empty.md': '',
            'real.md': '# Real\n\nContent',
        });
        const chunks = scan(testDir);
        expect(chunks.length).toBe(1);
        expect(chunks[0].filePath).toBe('real.md');
    });
});

// ── Indexer Tests ─────────────────────────────────────────────────

describe('local-doc indexer', () => {
    let testDir: string;
    let sxngDir: string;

    beforeEach(() => {
        // Create test docs
        testDir = createTestDir({
            'rust.md': '---\ntitle: Rust Guide\n---\n\n# Async\n\nAsync in Rust uses futures.\n\n# Ownership\n\nOwnership is unique to Rust.',
        });
    });

    afterEach(() => {
        if (testDir) rmSync(testDir, { recursive: true, force: true });
        if (sxngDir) rmSync(sxngDir, { recursive: true, force: true });
    });

    it('builds index from scanned chunks', async () => {
        const chunks = scan(testDir);
        expect(chunks.length).toBeGreaterThan(0);

        const result = await buildIndex(testDir, chunks);
        expect(result.meta.files).toBe(1);
        expect(result.meta.chunks).toBe(2); // 2 sections
        expect(result.meta.rootPath).toBe(testDir);
        expect(result.meta.indexedAt).toBeGreaterThan(0);
        expect(result.indexPath).toContain(join('.sxng', 'docs'));
    });

    it('persists and restores index', async () => {
        sxngDir = mkdtempSync(join(tmpdir(), 'sxng-root-'));
        const origCwd = process.cwd;
        // Temporarily change cwd so .sxng lands in our temp dir
        // Instead, just build and check hasIndex
        const chunks = scan(testDir);
        await buildIndex(testDir, chunks);

        expect(hasIndex(testDir)).toBe(true);

        // Load and verify
        const db = await loadIndex(testDir);
        expect(db).toBeTruthy();

        // Search restored index
        const { search } = await import('@orama/orama');
        const r = await search(db, { term: 'async', mode: 'fulltext', limit: 5 });
        expect(r.hits.length).toBeGreaterThanOrEqual(1);
    });

    it('returns index metadata', async () => {
        const chunks = scan(testDir);
        await buildIndex(testDir, chunks);

        const meta = getIndexMeta(testDir);
        expect(meta).not.toBeNull();
        expect(meta!.files).toBe(1);
        expect(meta!.chunks).toBe(2);
    });

    it('reports no index when none exists', () => {
        // Use a directory that exists but has no .sxng/docs/ index
        const noIndexDir = mkdtempSync(join(tmpdir(), 'sxng-noindex-'));
        try {
            expect(hasIndex(noIndexDir)).toBe(false);
            expect(getIndexMeta(noIndexDir)).toBeNull();
        } finally {
            rmSync(noIndexDir, { recursive: true, force: true });
        }
    });

    it('handles empty chunks list gracefully', async () => {
        const result = await buildIndex(testDir, []);
        expect(result.meta.files).toBe(0);
        expect(result.meta.chunks).toBe(0);
    });
});

// ── Searcher Tests ────────────────────────────────────────────────

describe('local-doc searcher', () => {
    let testDir: string;
    let sessionDir: string;

    beforeEach(() => {
        testDir = createTestDir({
            'guide.md': '---\ntitle: Programming Guide\n---\n\n# Async\n\nRust async with tokio runtime.\n\n# Sync\n\nSynchronous code is simpler.',
            'deploy.txt': 'Deployment uses Docker.\n\nConfiguration via environment.\n\nHealth checks required.',
        });
    });

    afterEach(() => {
        if (testDir) rmSync(testDir, { recursive: true, force: true });
        if (sessionDir) rmSync(sessionDir, { recursive: true, force: true });
    });

    it('auto-indexes and searches, returns SessionResult[]', async () => {
        sessionDir = resolveSessionPath('new');

        const result = await docSearch({
            session: sessionDir,
            query: 'async tokio',
            path: testDir,
            topK: 5,
        });

        expect(result.added).toBeGreaterThanOrEqual(1);
        expect(result.results.length).toBeGreaterThanOrEqual(1);

        const r = result.results[0];
        expect(r.source).toBe('local');
        expect(r.url).toMatch(/^file:\/\//);
        expect(r.score).toBeGreaterThan(0);
        expect(r.title).toBeTruthy();
        expect(r.content).toBeTruthy();
    });

    it('returns formatted results with correct fields', async () => {
        sessionDir = resolveSessionPath('new');

        const result = await docSearch({
            session: sessionDir,
            query: 'deployment',
            path: testDir,
            topK: 3,
        });

        expect(result.results.length).toBeGreaterThanOrEqual(1);
        const r = result.results[0];
        expect(r).toHaveProperty('url');
        expect(r).toHaveProperty('title');
        expect(r).toHaveProperty('content');
        expect(r).toHaveProperty('source', 'local');
        expect(r).toHaveProperty('score');
        expect(r).toHaveProperty('filePath');
        expect(r).toHaveProperty('headings');
        expect(r).toHaveProperty('chunkIndex');
        expect(r.score).toBeGreaterThan(0);
    });

    it('limits results with topK', async () => {
        sessionDir = resolveSessionPath('new');

        const result = await docSearch({
            session: sessionDir,
            query: 'rust', // matches both Async and Sync sections
            path: testDir,
            topK: 1,
        });

        expect(result.results.length).toBeLessThanOrEqual(1);
    });

    it('does not increment session round', async () => {
        sessionDir = resolveSessionPath('new');

        // First add some web-like results
        appendSessionResults(sessionDir, [
            { url: 'https://example.com', title: 'Web Result', content: 'test', source: 'sxng' },
        ]);

        const roundsBefore = loadSessionRounds(sessionDir);
        expect(roundsBefore).toBe(1); // first add incremented to 1

        // Add local results
        await docSearch({
            session: sessionDir,
            query: 'async',
            path: testDir,
            topK: 5,
        });

        const roundsAfter = loadSessionRounds(sessionDir);
        expect(roundsAfter).toBe(1); // no increment from doc-search
    });

    it('rejects empty query', async () => {
        await expect(docSearch({
            session: 'test',
            query: '',
            path: testDir,
            topK: 5,
        })).rejects.toThrow(/Query is empty/i);
    });

    it('rejects path with no indexable files', async () => {
        const emptyDir = mkdtempSync(join(tmpdir(), 'sxng-empty-'));
        try {
            await expect(docSearch({
                session: 'test',
                query: 'anything',
                path: emptyDir,
                topK: 5,
            })).rejects.toThrow(/No indexable files/i);
        } finally {
            rmSync(emptyDir, { recursive: true, force: true });
        }
    });

    it('supports custom field boost', async () => {
        sessionDir = resolveSessionPath('new');

        const result = await docSearch({
            session: sessionDir,
            query: 'tokio',
            path: testDir,
            topK: 5,
            boost: { title: 5, content: 1 },
        });

        expect(result.results.length).toBeGreaterThanOrEqual(1);
        // Result should have a valid score
        expect(result.results[0].score).toBeGreaterThan(0);
    });
});
