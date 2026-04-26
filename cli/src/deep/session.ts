/**
 * Session management for multi-round search accumulation
 *
 * A session directory contains:
 * - results.json: Accumulated search result pool (deduped by URL)
 * - graph.json: graphology knowledge graph (structural + semantic layers)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { DirectedGraph } from 'graphology';
import { deserializeGraph, serializeGraph, graphStats, buildStructuralEdges, GraphNodeAttrs, GraphEdgeAttrs } from './graph.js';
import { normalizeUrl } from './dedupe.js';
import { loadSessionMeta, SessionMeta } from '../commands/session.js';

export interface SessionResult {
    url: string;
    title: string;
    content?: string;
    engine?: string;
    category?: string;
    score?: number;
    publishedDate?: string;
    [key: string]: unknown;
}

export interface SessionResultsFile {
    status: 'ok';
    data: {
        results: SessionResult[];
        rounds: number;
    };
}

/** Resolve session path. Supports:
 *  - "new": auto-create under default root with unique name
 *  - pure name (no separators): resolve to ~/.sxng/sessions/<name>
 *  - full path: return as-is
 */
export function resolveSessionPath(sessionValue: string): string {
    if (sessionValue === 'new') {
        const root = join(homedir(), '.sxng', 'sessions');
        if (!existsSync(root)) {
            mkdirSync(root, { recursive: true });
        }
        const name = `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        return join(root, name);
    }
    // Pure name without path separators: resolve to default sessions dir
    if (!sessionValue.includes('/') && !sessionValue.includes('\\')) {
        const root = join(homedir(), '.sxng', 'sessions');
        return join(root, sessionValue);
    }
    return sessionValue;
}

/** Ensure session directory exists and write initial meta */
export function initSessionDir(sessionDir: string, owner?: string, description?: string, query?: string): void {
    if (!existsSync(sessionDir)) {
        mkdirSync(sessionDir, { recursive: true });
    }

    // Write or update meta.json
    const metaFile = join(sessionDir, 'meta.json');
    const existing = loadSessionMeta(sessionDir);
    const now = Date.now();

    const meta: SessionMeta = {
        owner: owner || existing?.owner || '',
        description: description || existing?.description || '',
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        query: query || existing?.query || '',
    };

    try {
        writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf-8');
    } catch { /* meta write failure is non-critical */ }
}

/** Load accumulated results from session, or return empty */
export function loadSessionResults(sessionDir: string): SessionResult[] {
    const file = join(sessionDir, 'results.json');
    if (!existsSync(file)) return [];

    try {
        const raw = readFileSync(file, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.status === 'ok' && parsed.data?.results) {
            return parsed.data.results;
        }
        return [];
    } catch {
        return [];
    }
}

/** Append new results to session results (dedup by URL) */
export function appendSessionResults(sessionDir: string, newResults: SessionResult[]): { added: number; total: number } {
    const existing = loadSessionResults(sessionDir);
    const urlMap = new Map<string, SessionResult>();

    // Index existing results by normalized URL
    for (const r of existing) {
        urlMap.set(normalizeUrl(r.url), r);
    }

    // Add new results (dedup: keep first occurrence)
    let added = 0;
    for (const r of newResults) {
        const norm = normalizeUrl(r.url);
        if (!urlMap.has(norm)) {
            urlMap.set(norm, r);
            added++;
        }
    }

    const all = Array.from(urlMap.values());
    const rounds = Math.max(1, (loadSessionRounds(sessionDir) || 0) + 1);

    const file = join(sessionDir, 'results.json');
    try {
        writeFileSync(file, JSON.stringify({
            status: 'ok',
            data: { results: all, rounds },
        }, null, 2), 'utf-8');
    } catch (e) {
        throw new Error(`Failed to write session results to ${file}: ${e instanceof Error ? e.message : String(e)}`);
    }

    return { added, total: all.length };
}

/** Load graph from session, or create empty */
export function loadSessionGraph(sessionDir: string): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    const file = join(sessionDir, 'graph.json');
    if (!existsSync(file)) return new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();

    try {
        const raw = readFileSync(file, 'utf-8');
        const parsed = JSON.parse(raw);
        const graphData = parsed.status === 'ok' && parsed.data?.graph
            ? parsed.data.graph
            : (parsed.nodes && parsed.edges ? parsed : null);
        if (graphData) {
            return deserializeGraph(graphData);
        }
        return new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
    } catch {
        return new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
    }
}

/** Save graph to session */
export function saveSessionGraph(sessionDir: string, graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>): void {
    const serialized = serializeGraph(graph);
    const stats = graphStats(graph);
    const file = join(sessionDir, 'graph.json');
    try {
        writeFileSync(file, JSON.stringify({
            status: 'ok',
            data: { graph: serialized, stats },
        }, null, 2), 'utf-8');
    } catch (e) {
        throw new Error(`Failed to write session graph to ${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
}

/** Update session graph with new search results (structural layer) */
export function updateSessionGraph(
    sessionDir: string,
    query: string,
    results: Array<{ url: string; title: string; rank?: number }>,
    round?: number
): { nodesAdded: number; edgesAdded: number } {
    const graph = loadSessionGraph(sessionDir);
    const beforeNodes = graph.order;
    const beforeEdges = graph.size;

    buildStructuralEdges(graph, query, results, round);
    saveSessionGraph(sessionDir, graph);

    return {
        nodesAdded: graph.order - beforeNodes,
        edgesAdded: graph.size - beforeEdges,
    };
}

/** Merge extracted content into session results (update content field by URL match) */
export function mergeExtractedContent(sessionDir: string, extracted: Array<{ url: string; content: string; title?: string; excerpt?: string; byline?: string; siteName?: string; length?: number; error?: string }>): { updated: number; total: number } {
    const results = loadSessionResults(sessionDir);
    const urlMap = new Map<string, SessionResult>();
    for (const r of results) {
        urlMap.set(normalizeUrl(r.url), r);
    }

    let updated = 0;
    for (const ex of extracted) {
        if (ex.error) continue;
        const norm = normalizeUrl(ex.url);
        const existing = urlMap.get(norm);
        if (existing) {
            existing.content = ex.content;
            if (ex.excerpt) existing.excerpt = ex.excerpt;
            if (ex.byline) existing.byline = ex.byline;
            if (ex.siteName) existing.siteName = ex.siteName;
            if (ex.length) existing.contentLength = ex.length;
            updated++;
        }
    }

    const all = Array.from(urlMap.values());
    const file = join(sessionDir, 'results.json');
    const rounds = loadSessionRounds(sessionDir) || results.length;
    try {
        writeFileSync(file, JSON.stringify({
            status: 'ok',
            data: { results: all, rounds },
        }, null, 2), 'utf-8');
    } catch (e) {
        throw new Error(`Failed to write session results to ${file}: ${e instanceof Error ? e.message : String(e)}`);
    }

    return { updated, total: all.length };
}

/** Get current round number from results file */
function loadSessionRounds(sessionDir: string): number {
    const file = join(sessionDir, 'results.json');
    if (!existsSync(file)) return 0;

    try {
        const raw = readFileSync(file, 'utf-8');
        const parsed = JSON.parse(raw);
        return parsed.data?.rounds || 0;
    } catch {
        return 0;
    }
}
