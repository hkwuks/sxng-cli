import { describe, it, expect } from 'vitest';
import { graphPreprocess } from '../../src/deep/graph-preprocess.js';
import { initSessionDir, appendSessionResults, updateSessionGraph, loadSessionGraph, saveSessionGraph } from '../../src/deep/session.js';
import { entityId } from '../../src/deep/graph.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('graph-preprocess (integration)', () => {
    let sessionDir: string;

    beforeEach(() => {
        sessionDir = mkdtempSync(join(tmpdir(), 'sxng-pp-test-'));
    });

    afterEach(() => {
        rmSync(sessionDir, { recursive: true, force: true });
    });

    it('runs full pipeline on session with content', () => {
        initSessionDir(sessionDir, 'test', 'test session', 'rust async');
        appendSessionResults(sessionDir, [
            { url: 'https://tokio.rs', title: 'Tokio Runtime', content: 'Tokio is an asynchronous runtime for the Rust programming language' },
            { url: 'https://async.rs', title: 'Async Std', content: 'async-std provides async standard library for Rust' },
            { url: 'https://blog.rust-lang.org/async', title: 'Rust Async Ecosystem', content: 'The Rust async ecosystem includes tokio and async runtimes' },
        ]);
        updateSessionGraph(sessionDir, 'rust async', [
            { url: 'https://tokio.rs', title: 'Tokio Runtime' },
            { url: 'https://async.rs', title: 'Async Std' },
        ]);

        const result = graphPreprocess(sessionDir);

        expect(result.tokenizationStrategy).toBe('whitespace_min3_cjk_bigram');
        expect(result.totalResults).toBe(3);
        expect(result.resultsWithContent).toBe(3);
        expect(result.tfidfTerms.length).toBeGreaterThan(0);
        expect(result.coOccurrences.length).toBeGreaterThan(0);
        expect(result.existingEntities).toEqual([]);
        expect(result.termFrequencies.length).toBeGreaterThan(0);
    });

    it('handles session with no content results', () => {
        initSessionDir(sessionDir);
        appendSessionResults(sessionDir, [
            { url: 'https://a.com', title: 'A' },
        ]);

        const result = graphPreprocess(sessionDir);

        expect(result.totalResults).toBe(1);
        expect(result.resultsWithContent).toBe(0);
        expect(result.tfidfTerms).toEqual([]);
        expect(result.coOccurrences).toEqual([]);
    });

    it('respects top option', () => {
        initSessionDir(sessionDir);
        appendSessionResults(sessionDir, [
            { url: 'https://a.com', title: 'A', content: 'tokio async runtime rust programming language ecosystem' },
            { url: 'https://b.com', title: 'B', content: 'hyper tonic tower grpc networking library' },
        ]);

        const result = graphPreprocess(sessionDir, { top: 3 });
        expect(result.tfidfTerms.length).toBeLessThanOrEqual(3);
    });

    it('includes existing entities from graph', () => {
        initSessionDir(sessionDir);
        appendSessionResults(sessionDir, [
            { url: 'https://a.com', title: 'A', content: 'tokio runtime' },
        ]);

        const graph = loadSessionGraph(sessionDir);
        graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio', entityType: 'runtime' });
        saveSessionGraph(sessionDir, graph);

        const result = graphPreprocess(sessionDir);
        expect(result.existingEntities.length).toBe(1);
        expect(result.existingEntities[0].label).toBe('tokio');
    });
});
