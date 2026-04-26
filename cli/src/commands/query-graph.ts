/**
 * Query-graph subcommand - BFS subgraph extraction from knowledge graph
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { deserializeGraph, bfsSubgraph, serializeGraph, graphStats, GraphNodeAttrs, GraphEdgeAttrs } from '../deep/graph.js';
import { createSuccessEnvelope, createErrorEnvelope } from '../protocol.js';

/** Resolve graph file path — if directory (session), use graph.json inside it.
 *  Pure name (no separators) is resolved to ~/.sxng/sessions/<name>
 */
function resolveGraphFile(path: string): string {
    // Pure name without path separators: resolve to default sessions dir
    if (!path.includes('/') && !path.includes('\\')) {
        path = join(homedir(), '.sxng', 'sessions', path);
    }
    try {
        if (statSync(path).isDirectory()) {
            return join(path, 'graph.json');
        }
    } catch {
        // Not a file/dir, return as-is
    }
    return path;
}

/** Format subgraph as human-readable text descriptions */
function formatSubgraphAsText(
    subgraph: { nodes: Map<string, GraphNodeAttrs>; edges: Array<{ source: string; target: string; attrs: GraphEdgeAttrs }> }
): string {
    const lines: string[] = [];
    for (const edge of subgraph.edges) {
        const src = subgraph.nodes.get(edge.source);
        const tgt = subgraph.nodes.get(edge.target);
        const srcLabel = src?.label || edge.source;
        const tgtLabel = tgt?.label || edge.target;
        const srcType = src?.type || '';
        const tgtType = tgt?.type || '';
        lines.push(`[${srcType}] ${srcLabel} → (${edge.attrs.relation}, w=${edge.attrs.weight.toFixed(2)}) → [${tgtType}] ${tgtLabel}`);
    }
    return lines.join('\n');
}

export interface QueryGraphOptions {
    graphFile: string;
    seeds: string[];
    depth: number;
    format?: 'json' | 'md';
}

export async function runQueryGraph(options: QueryGraphOptions): Promise<number> {
    const graphFile = resolveGraphFile(options.graphFile);

    if (!graphFile) {
        const envelope = createErrorEnvelope(
            'MISSING_GRAPH_FILE',
            'No graph file specified',
            { hint: 'Use: sxng query-graph graph.json --seeds "seed1,seed2" --depth 2' }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    let graphData: any;
    try {
        const raw = readFileSync(graphFile, 'utf-8');
        const parsed = JSON.parse(raw);

        // Handle envelope format
        if (parsed.status === 'ok' && parsed.data?.graph) {
            graphData = parsed.data.graph;
        } else if (parsed.nodes && parsed.edges) {
            graphData = parsed;
        } else {
            const envelope = createErrorEnvelope(
                'INVALID_GRAPH_FORMAT',
                'Graph file does not contain valid graphology data',
                { hint: 'Ensure the file was produced by sxng build-graph' }
            );
            console.log(JSON.stringify(envelope, null, 2));
            return 1;
        }
    } catch (error) {
        const envelope = createErrorEnvelope(
            'FILE_READ_FAILED',
            `Failed to read graph file: ${graphFile}`,
            { hint: 'Ensure the file exists and is readable' }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    const graph = deserializeGraph(graphData);

    if (options.seeds.length === 0) {
        const envelope = createErrorEnvelope(
            'MISSING_SEEDS',
            'No seed nodes specified for subgraph query',
            { hint: 'Use --seeds to specify starting nodes. Use partial IDs like "q:topic" or "d:example.com"' }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    // Resolve seed IDs — support exact, prefix, and label matching
    const resolvedSeeds: string[] = [];
    for (const seed of options.seeds) {
        if (graph.hasNode(seed)) {
            resolvedSeeds.push(seed);
        } else {
            // Try prefix match: seed matches start of node ID (e.g. "e:tokio" matches "e:tokio_runtime")
            // Or label match: seed matches node label (case-insensitive)
            const matches = graph.filterNodes((node: string, attrs: GraphNodeAttrs) => {
                const lowerSeed = seed.toLowerCase();
                if (node.toLowerCase().startsWith(lowerSeed)) return true;
                if (attrs.label && attrs.label.toLowerCase().includes(lowerSeed)) return true;
                return false;
            });
            for (const match of matches) {
                resolvedSeeds.push(match);
            }
        }
    }

    if (resolvedSeeds.length === 0) {
        const envelope = createErrorEnvelope(
            'NO_SEED_FOUND',
            'No matching nodes found for provided seeds',
            { hint: `Available nodes: ${graph.nodes().slice(0, 10).join(', ')}...` }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    const subgraph = bfsSubgraph(graph, resolvedSeeds, options.depth);
    const serialized = serializeGraph(subgraph);
    const stats = graphStats(subgraph);

    if (options.format === 'md') {
        // Build human-readable output
        const nodes = new Map<string, GraphNodeAttrs>();
        subgraph.forEachNode((node: string, attrs: GraphNodeAttrs) => nodes.set(node, attrs));
        const edges: Array<{ source: string; target: string; attrs: GraphEdgeAttrs }> = [];
        subgraph.forEachEdge((edge: string, attrs: GraphEdgeAttrs, source: string, target: string) => {
            edges.push({ source, target, attrs });
        });

        const lines: string[] = [`Subgraph from seeds: ${resolvedSeeds.join(', ')} (depth ${options.depth})`];
        lines.push(`Nodes: ${stats.nodes} (${stats.entities} entities, ${stats.results} results, ${stats.queries} queries, ${stats.domains} domains)`);
        lines.push(`Edges: ${stats.edges}`);
        lines.push('');
        lines.push('Relationships:');
        for (const edge of edges) {
            const src = nodes.get(edge.source);
            const tgt = nodes.get(edge.target);
            const srcLabel = src?.label || edge.source;
            const tgtLabel = tgt?.label || edge.target;
            const srcType = src?.type || '?';
            const tgtType = tgt?.type || '?';
            lines.push(`  [${srcType}] ${srcLabel} → (${edge.attrs.relation}, weight=${edge.attrs.weight.toFixed(2)}) → [${tgtType}] ${tgtLabel}`);
        }

        lines.push('');
        lines.push('Nodes:');
        for (const [id, attrs] of nodes) {
            const parts = [`[${attrs.type}] ${attrs.label}`];
            if (attrs.url) parts.push(`url=${attrs.url}`);
            if (attrs.entityType) parts.push(`entityType=${attrs.entityType}`);
            if (attrs.score) parts.push(`score=${attrs.score}`);
            lines.push(`  ${id}: ${parts.join(', ')}`);
        }

        console.log(lines.join('\n'));
    } else {
        const envelope = createSuccessEnvelope({
            seeds: resolvedSeeds,
            depth: options.depth,
            stats,
            graph: serialized,
        });
        console.log(JSON.stringify(envelope, null, 2));
    }

    return 0;
}