/**
 * graph-add subcommand - Add entities and edges to an entity-centric knowledge graph
 *
 * Agent (LLM) extracts entities from search results and sends them here.
 * Each entity is connected to its source result via "mentions" edges.
 * Result nodes store lightweight metadata (title, url, rank).
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { deserializeGraph, serializeGraph, graphStats, GraphNodeAttrs, GraphEdgeAttrs, entityId, resultId } from '../deep/graph.js';
import { DirectedGraph } from 'graphology';
import { createSuccessEnvelope, createErrorEnvelope } from '../protocol.js';

/** Resolve graph file path — if directory (session), use graph.json inside it */
function resolveGraphFile(path: string): string {
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
    data: string; // JSON string with entities, results, and edges
}

interface EntityInput {
    label: string;
    entityType?: string; // "person", "technology", "concept", "organization", etc.
    score?: number;
    id?: string; // explicit ID, otherwise auto-generated from label
}

interface ResultInput {
    url: string;
    title: string;
    rank?: number;
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
    let parsed: { entities?: EntityInput[]; results?: ResultInput[]; edges?: EdgeInput[] };
    try {
        parsed = JSON.parse(options.data);
    } catch {
        const envelope = createErrorEnvelope(
            'INVALID_JSON',
            'Failed to parse --data JSON',
            { hint: 'Ensure --data contains valid JSON with "entities", "results", and/or "edges" arrays' }
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

    let entitiesAdded = 0;
    let resultsAdded = 0;
    let edgesAdded = 0;

    // Add entity nodes
    for (const entity of parsed.entities || []) {
        const id = entity.id || entityId(entity.label);

        if (!graph.hasNode(id)) {
            graph.mergeNode(id, {
                type: 'entity',
                label: entity.label,
                entityType: entity.entityType,
                score: entity.score,
            });
            entitiesAdded++;
        } else {
            // Update existing entity
            const existing = graph.getNodeAttributes(id);
            graph.mergeNode(id, {
                ...existing,
                label: entity.label,
                entityType: entity.entityType ?? existing.entityType,
                score: entity.score ?? existing.score,
            });
        }
    }

    // Add result metadata nodes
    for (const result of parsed.results || []) {
        const id = resultId(result.url);

        if (!graph.hasNode(id)) {
            graph.mergeNode(id, {
                type: 'result',
                label: result.title,
                url: result.url,
                title: result.title,
                rank: result.rank,
            });
            resultsAdded++;
        } else {
            // Update rank if better
            const existing = graph.getNodeAttributes(id);
            if (result.rank !== undefined) {
                graph.mergeNode(id, {
                    ...existing,
                    rank: result.rank < (existing.rank ?? Infinity) ? result.rank : existing.rank,
                });
            }
        }
    }

    // Add edges (entity-entity and entity-result relationships)
    const skippedEdges: Array<{ source: string; target: string; relation: string }> = [];
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
        resultsAdded,
        edgesAdded,
        skippedEdges,
        stats,
    });
    console.log(JSON.stringify(envelope, null, 2));
    return 0;
}