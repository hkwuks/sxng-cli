/**
 * Session management for multi-round search accumulation
 *
 * A session directory contains:
 * - results.json: Accumulated search result pool (deduped by URL)
 * - graph.json: graphology knowledge graph (structural + semantic layers)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DirectedGraph } from 'graphology';
import { deserializeGraph, serializeGraph, graphStats, buildStructuralEdges, GraphNodeAttrs, GraphEdgeAttrs } from './graph.js';
import { resultUrlKey } from './dedupe.js';
import { getDefaultSessionRoot, loadSessionMeta, SessionMeta } from '../commands/session.js';

export interface SessionResult {
    url: string;
    title: string;
    content?: string;
    engine?: string;
    category?: string;
    score?: number;
    publishedDate?: string;
    extractedAt?: number;
    byline?: string;
    siteName?: string;
    source?: string; // "sxng" | "tavily" | "exa" | "open-web-search" | ... — which tool produced this result
    origins?: Array<{ query: string; round?: number }>;
    status?: 'pending' | 'approved' | 'rejected'; // Quality assessment status
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
 *  - pure name (no separators): resolve to default session root
 *  - full path: return as-is
 */
export function resolveSessionPath(sessionValue: string): string {
    if (sessionValue === 'new') {
        const root = getDefaultSessionRoot();
        if (!existsSync(root)) {
            mkdirSync(root, { recursive: true });
        }
        const name = `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        return join(root, name);
    }
    // Pure name without path separators: resolve to default sessions dir
    if (!sessionValue.includes('/') && !sessionValue.includes('\\')) {
        const root = getDefaultSessionRoot();
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

/** Append new results to session results (dedup by normalized URL).
 *  New results are marked as 'pending' and will not be injected into graph
 *  until approved by Agent quality assessment.
 */
export function appendSessionResults(
    sessionDir: string,
    newResults: SessionResult[],
    options?: { skipRoundIncrement?: boolean }
): { added: number; total: number; approvedResults: SessionResult[] } {
    // Ensure session directory exists
    if (!existsSync(sessionDir)) {
        mkdirSync(sessionDir, { recursive: true });
    }
    const existing = loadSessionResults(sessionDir);
    const currentRounds = loadSessionRounds(sessionDir) || 0;
    const round = options?.skipRoundIncrement
        ? Math.max(1, currentRounds)
        : Math.max(1, currentRounds + 1);
    const urlMap = new Map<string, SessionResult>();

    for (const r of existing) {
        urlMap.set(resultUrlKey(r), r);
    }

    const mergeOrigins = (target: SessionResult, origins?: SessionResult['origins']): void => {
        if (!origins?.length) return;
        const combined = [...(target.origins || []), ...origins];
        target.origins = Array.from(new Map(
            combined.map(origin => [`${origin.round ?? round}\0${origin.query}`, { ...origin, round: origin.round ?? round }])
        ).values());
    };

    // Add new results (dedup: keep first occurrence)
    let added = 0;
    const approvedResults: SessionResult[] = [];
    for (const r of newResults) {
        const norm = resultUrlKey(r);
        const existingResult = urlMap.get(norm);
        if (existingResult) {
            const originCount = existingResult.origins?.length ?? 0;
            mergeOrigins(existingResult, r.origins);
            if (existingResult.status === 'approved' && (existingResult.origins?.length ?? 0) > originCount) {
                approvedResults.push(existingResult);
            }
            continue;
        }
        // Mark new results as pending
        r.status = 'pending';
        mergeOrigins(r, r.origins);
        urlMap.set(norm, r);
        added++;
    }

    const all = Array.from(urlMap.values());
    const rounds = round;

    const file = join(sessionDir, 'results.json');
    try {
        writeFileSync(file, JSON.stringify({
            status: 'ok',
            data: { results: all, rounds },
        }, null, 2), 'utf-8');
    } catch (e) {
        throw new Error(`Failed to write session results to ${file}: ${e instanceof Error ? e.message : String(e)}`);
    }

    return { added, total: all.length, approvedResults };
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

/** Get pending results (not yet approved by Agent) */
export function getPendingResults(sessionDir: string): SessionResult[] {
    const results = loadSessionResults(sessionDir);
    return results.filter(r => !r.status || r.status === 'pending');
}

/** Get approved results (ready for graph injection) */
export function getApprovedResults(sessionDir: string): SessionResult[] {
    const results = loadSessionResults(sessionDir);
    return results.filter(r => r.status === 'approved');
}

/** Approve results by their indices (0-based) in the pending list.
 *  Returns the number of approved results.
 */
export function approveResults(sessionDir: string, indices: number[]): { approved: number; total: number; approvedResults: SessionResult[] } {
    const results = loadSessionResults(sessionDir);
    const pending = results.filter(r => !r.status || r.status === 'pending');

    // Keep local chunk fragments so selecting one chunk does not approve its siblings.
    const approvedResultKeys = new Set<string>();
    for (const idx of indices) {
        if (idx >= 0 && idx < pending.length) {
            approvedResultKeys.add(resultUrlKey(pending[idx]));
        }
    }

    // Update status
    let approved = 0;
    const approvedResults: SessionResult[] = [];
    for (const r of results) {
        if (approvedResultKeys.has(resultUrlKey(r))) {
            r.status = 'approved';
            approved++;
            approvedResults.push(r);
        }
    }

    // Save back
    const file = join(sessionDir, 'results.json');
    const rounds = loadSessionRounds(sessionDir);
    try {
        writeFileSync(file, JSON.stringify({
            status: 'ok',
            data: { results, rounds },
        }, null, 2), 'utf-8');
    } catch (e) {
        throw new Error(`Failed to write session results to ${file}: ${e instanceof Error ? e.message : String(e)}`);
    }

    return { approved, total: results.length, approvedResults };
}

/** Inject approved results into graph (structural layer).
 *  Uses query from session meta.json if not provided.
 */
export function injectApprovedResults(sessionDir: string, approved: SessionResult[]): { nodesAdded: number; edgesAdded: number } {
    if (approved.length === 0) {
        return { nodesAdded: 0, edgesAdded: 0 };
    }

    const graph = loadSessionGraph(sessionDir);
    const beforeNodes = graph.order;
    const beforeEdges = graph.size;
    const groups = new Map<string, { query: string; round?: number; results: Array<{ url: string; title: string; source?: string }> }>();

    for (const result of approved) {
        for (const origin of result.origins || []) {
            const key = `${origin.round ?? 0}\0${origin.query}`;
            const group = groups.get(key) ?? { query: origin.query, round: origin.round, results: [] };
            group.results.push({ url: result.url, title: result.title, source: result.source });
            groups.set(key, group);
        }
    }

    for (const group of groups.values()) {
        buildStructuralEdges(graph, group.query, group.results, group.round);
    }
    saveSessionGraph(sessionDir, graph);

    return { nodesAdded: graph.order - beforeNodes, edgesAdded: graph.size - beforeEdges };
}

/** Count pending results */
export function countPendingResults(sessionDir: string): number {
    return getPendingResults(sessionDir).length;
}
export function updateSessionGraph(
    sessionDir: string,
    query: string,
    results: Array<{ url: string; title: string; rank?: number; source?: string }>,
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
export function mergeExtractedContent(sessionDir: string, extracted: Array<{ url: string; content: string; title?: string; excerpt?: string; byline?: string; siteName?: string; length?: number; extractedAt?: number; error?: string }>): { updated: number; total: number } {
    const results = loadSessionResults(sessionDir);
    const urlMap = new Map<string, SessionResult>();
    for (const r of results) {
        urlMap.set(resultUrlKey(r), r);
    }

    let updated = 0;
    for (const ex of extracted) {
        if (ex.error) continue;
        const norm = resultUrlKey({ url: ex.url, source: ex.url.startsWith('file:') ? 'local' : undefined });
        const existing = urlMap.get(norm);
        if (existing) {
            existing.content = ex.content;
            if (ex.excerpt) existing.excerpt = ex.excerpt;
            if (ex.byline) existing.byline = ex.byline;
            if (ex.siteName) existing.siteName = ex.siteName;
            if (ex.length) existing.contentLength = ex.length;
            if (ex.extractedAt !== undefined) existing.extractedAt = ex.extractedAt;
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
export function loadSessionRounds(sessionDir: string): number {
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
