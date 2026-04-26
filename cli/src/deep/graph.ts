/**
 * Entity-centric knowledge graph using graphology
 *
 * The graph stores entities and their relationships.
 * Search results are stored as lightweight metadata nodes (title, url, rank)
 * connected to entities via "mentions" edges.
 *
 * Entity extraction is done by the Agent (LLM), not by the CLI.
 * The CLI only stores what the Agent sends via graph-add.
 */

import { DirectedGraph } from 'graphology';

export interface GraphNodeAttrs {
    type: 'entity' | 'result' | 'query' | 'domain';
    label: string;
    // Entity-specific
    entityType?: string; // e.g. "person", "technology", "concept"
    score?: number;
    // Result-specific
    url?: string;
    rank?: number;
    title?: string;
    // Query-specific
    query?: string;
    round?: number;
    // Domain-specific
    domain?: string;
}

export interface GraphEdgeAttrs {
    relation: string;
    weight: number;
}

function generateId(prefix: string, value: string): string {
    return `${prefix}:${value.toLowerCase().replace(/[^\w]+/g, '_').slice(0, 60)}`;
}

/** Create an empty entity-centric knowledge graph */
export function createGraph(): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    return new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
}

/** Generate a node ID for an entity */
export function entityId(label: string): string {
    return generateId('e', label);
}

/** Generate a node ID for a result */
export function resultId(url: string): string {
    return generateId('r', url);
}

/** Generate a node ID for a query */
export function queryId(query: string): string {
    return generateId('q', query);
}

/** Generate a node ID for a domain */
export function domainId(domain: string): string {
    return generateId('d', domain);
}

/** Extract domain from URL */
function extractDomain(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

/** Auto-build structural edges: query→result→domain */
export function buildStructuralEdges(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    query: string,
    results: Array<{ url: string; title: string; rank?: number }>,
    round?: number
): void {
    const qId = queryId(query);

    // Ensure query node exists
    if (!graph.hasNode(qId)) {
        graph.mergeNode(qId, {
            type: 'query',
            label: query,
            query,
            round,
        });
    }

    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const rId = resultId(r.url);

        // Ensure result node exists
        if (!graph.hasNode(rId)) {
            graph.mergeNode(rId, {
                type: 'result',
                label: r.title,
                url: r.url,
                title: r.title,
                rank: r.rank ?? i + 1,
            });
        }

        // query→result edge
        if (!graph.hasEdge(qId, rId)) {
            graph.addEdge(qId, rId, {
                relation: 'yields',
                weight: 1 / (i + 1),
            });
        }

        // domain node and result→domain edge
        const domain = extractDomain(r.url);
        if (domain) {
            const dId = domainId(domain);
            if (!graph.hasNode(dId)) {
                graph.mergeNode(dId, {
                    type: 'domain',
                    label: domain,
                    domain,
                });
            }
            if (!graph.hasEdge(rId, dId)) {
                graph.addEdge(rId, dId, {
                    relation: 'belongs_to',
                    weight: 1,
                });
            }
        }
    }
}

export function bfsSubgraph(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    seeds: string[],
    depth: number = 2
): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = seeds
        .filter(id => graph.hasNode(id))
        .map(id => ({ id, depth: 0 }));

    while (queue.length > 0) {
        const { id, depth: d } = queue.shift()!;
        if (d > depth || visited.has(id)) continue;

        visited.add(id);
        graph.forEachNeighbor(id, (neighbor: string) => {
            if (!visited.has(neighbor)) {
                queue.push({ id: neighbor, depth: d + 1 });
            }
        });
    }

    const subgraph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
    for (const nodeId of visited) {
        const attrs = graph.getNodeAttributes(nodeId);
        subgraph.mergeNode(nodeId, attrs);
    }

    graph.forEachEdge((edge: string, attrs: GraphEdgeAttrs, source: string, target: string) => {
        if (visited.has(source) && visited.has(target)) {
            subgraph.mergeEdge(source, target, attrs);
        }
    });

    return subgraph;
}

export function serializeGraph(graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>): object {
    return graph.export();
}

export function deserializeGraph(data: any): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
    graph.import(data);
    return graph;
}

export function graphStats(graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>): {
    nodes: number;
    edges: number;
    entities: number;
    results: number;
    queries: number;
    domains: number;
} {
    let entities = 0, results = 0, queries = 0, domains = 0;
    graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type === 'entity') entities++;
        else if (attrs.type === 'result') results++;
        else if (attrs.type === 'query') queries++;
        else if (attrs.type === 'domain') domains++;
    });

    return {
        nodes: graph.order,
        edges: graph.size,
        entities,
        results,
        queries,
        domains,
    };
}