/**
 * graph-add subcommand - Add entities and edges to knowledge graph.
 *
 * This command receives entities and edges AFTER results have been approved
 * via --quality --approve. Results must already exist as graph nodes before
 * referencing them in edges.
 *
 * - Entities are added immediately (semantic layer)
 * - Edges can reference existing result, entity, domain, or query nodes
 * - Does NOT accept results — use `sxng results-add` for external results
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { deserializeGraph, serializeGraph, graphStats, GraphNodeAttrs, GraphEdgeAttrs, entityId } from '../deep/graph.js';
import { DirectedGraph } from 'graphology';
import { createSuccessEnvelope, createErrorEnvelope } from '../protocol.js';
import { getDefaultSessionRoot } from './session.js';

/** Resolve graph file path — if directory (session), use graph.json inside it.
 *  Pure name (no separators) is resolved to the default session root.
 */
function resolveGraphFile(path: string): string {
    // Pure name without path separators: resolve to default sessions dir
    if (!path.includes('/') && !path.includes('\\')) {
        path = join(getDefaultSessionRoot(), path);
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

export interface GraphAddOptions {
    graphFile: string;
    data: string; // JSON string with entities and edges
}

interface EntityInput {
    label: string;
    entityType?: string; // "person", "technology", "concept", "organization", etc.
    score?: number;
    id?: string; // explicit ID, otherwise auto-generated from label
    obfuscatedLabel?: string;
    sourceRounds?: number[];
    frequency?: number;
    reasoningPaths?: string[];
}

interface EdgeInput {
    source: string; // node ID
    target: string; // node ID
    relation: string;
    weight?: number;
}

export async function runGraphAdd(options: GraphAddOptions): Promise<number> {
    const graphFile = resolveGraphFile(options.graphFile);

    if (!graphFile) {
        const envelope = createErrorEnvelope(
            'MISSING_GRAPH_FILE',
            'No graph file specified',
            { hint: 'Use: sxng graph-add graph.json --data \'...\'' }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    // Parse input data
    let parsed: { entities?: EntityInput[]; edges?: EdgeInput[] };
    try {
        parsed = JSON.parse(options.data);
    } catch {
        const envelope = createErrorEnvelope(
            'INVALID_JSON',
            'Failed to parse --data JSON',
            { hint: 'Ensure --data contains valid JSON with "entities" and/or "edges" arrays' }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    // Load or create graph
    let graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>;
    if (existsSync(graphFile)) {
        try {
            const raw = readFileSync(graphFile, 'utf-8');
            const fileParsed = JSON.parse(raw);
            const graphData = fileParsed.status === 'ok' && fileParsed.data?.graph
                ? fileParsed.data.graph
                : (fileParsed.nodes && fileParsed.edges ? fileParsed : null);

            graph = graphData
                ? deserializeGraph(graphData)
                : new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
        } catch {
            const envelope = createErrorEnvelope(
                'GRAPH_LOAD_FAILED',
                `Failed to load graph from: ${graphFile}`,
                { hint: 'Ensure the file contains a valid graphology graph' }
            );
            console.log(JSON.stringify(envelope, null, 2));
            return 1;
        }
    } else {
        graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
    }

    const invalidProvenance = (parsed.entities || []).find(entity => {
        if (graph.hasNode(entity.id || entityId(entity.label))) return false;
        return !Array.isArray(entity.sourceRounds)
            || entity.sourceRounds.length === 0
            || entity.sourceRounds.some(round => !Number.isSafeInteger(round) || round < 1);
    });
    if (invalidProvenance) {
        const envelope = createErrorEnvelope(
            'MISSING_ENTITY_PROVENANCE',
            'Each new entity requires one or more sourceRounds from graph-preprocess resultProvenance',
            { hint: 'Set sourceRounds from the rounds of the results that support the entity.' }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    let entitiesAdded = 0;

    // Add entity nodes (semantic layer — goes directly to graph)
    for (const entity of parsed.entities || []) {
        const id = entity.id || entityId(entity.label);

        if (!graph.hasNode(id)) {
            graph.mergeNode(id, {
                type: 'entity',
                label: entity.label,
                entityType: entity.entityType,
                score: entity.score,
                obfuscatedLabel: entity.obfuscatedLabel,
                sourceRounds: entity.sourceRounds,
                frequency: entity.frequency,
                reasoningPaths: entity.reasoningPaths,
            });
            entitiesAdded++;
        } else {
            // Update existing entity — merge new fields
            const existing = graph.getNodeAttributes(id);
            graph.mergeNode(id, {
                ...existing,
                label: entity.label,
                entityType: entity.entityType ?? existing.entityType,
                score: entity.score ?? existing.score,
                obfuscatedLabel: entity.obfuscatedLabel ?? existing.obfuscatedLabel,
                sourceRounds: Array.from(new Set([...(existing.sourceRounds || []), ...(entity.sourceRounds || [])])).sort((a, b) => a - b),
                frequency: entity.frequency ?? existing.frequency,
                reasoningPaths: entity.reasoningPaths ?? existing.reasoningPaths,
            });
        }
    }

    const skippedEdges: Array<{ source: string; target: string; relation: string }> = [];
    let edgesAdded = 0;
    for (const edge of parsed.edges || []) {
        if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) {
            skippedEdges.push({ source: edge.source, target: edge.target, relation: edge.relation });
            continue;
        }
        graph.mergeEdge(edge.source, edge.target, {
            relation: edge.relation,
            weight: edge.weight ?? 1,
        });
        edgesAdded++;
    }

    // Save graph
    const serialized = serializeGraph(graph);
    const stats = graphStats(graph);
    try {
        writeFileSync(
            graphFile,
            JSON.stringify({ status: 'ok', data: { graph: serialized, stats } }, null, 2),
            'utf-8'
        );
    } catch (e) {
        const envelope = createErrorEnvelope(
            'GRAPH_WRITE_FAILED',
            `Failed to write graph to: ${graphFile}`,
            { hint: 'Check directory permissions and disk space', details: { error: e instanceof Error ? e.message : String(e) } }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    const envelope = createSuccessEnvelope({
        entitiesAdded,
        edgesAdded,
        skippedEdges: skippedEdges.length > 0 ? skippedEdges : undefined,
        ...(skippedEdges.length > 0 ? { hint: `${skippedEdges.length} edge(s) skipped — target nodes not found in graph.` } : {}),
        stats,
    });
    console.log(JSON.stringify(envelope, null, 2));
    return 0;
}
