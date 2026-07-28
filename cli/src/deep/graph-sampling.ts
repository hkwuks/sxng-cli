/**
 * Graph sampling strategies for knowledge graph exploration.
 *
 * Given a graph, seed entities, and a strategy, produces a sampled subgraph
 * focused on the most relevant structures for reasoning.
 *
 * Strategies:
 * - augmented_chain: sequential entity chain with attribute enrichment
 * - dual_core_bridge: two seed entities converging on a shared target
 * - community_core_path: high-degree hub → peripheral entities
 * - deep_chain: depth-limited DFS (max 5-8 hops)
 * - mixed: randomly pick one of the above
 */

import { DirectedGraph } from 'graphology';
import { GraphNodeAttrs, GraphEdgeAttrs, entityId } from './graph.js';
import { getEntityDegree, filterEntitiesByDegree, adaptiveDegreeRange } from './degree-utils.js';

// ── Types ─────────────────────────────────────────────────────────

export type SamplingStrategy =
    | 'augmented_chain'
    | 'dual_core_bridge'
    | 'community_core_path'
    | 'deep_chain'
    | 'mixed';

export interface SamplingConfig {
    strategy: SamplingStrategy;
    seedEntities: string[]; // entity node IDs (e:xxx)
    maxHops: number;
    degreeRange?: { min?: number; max?: number; maxDegreeCap?: number };
    /** Random seed for deterministic output. Used by mixed strategy. */
    rngSeed?: number;
}

export interface SampledEntity {
    id: string;
    label: string;
    entityType?: string;
    score?: number;
    degree: number;
}

export interface SampledEdge {
    source: string;
    target: string;
    relation: string;
    weight: number;
}

export interface SamplingResult {
    strategy: SamplingStrategy;
    entities: SampledEntity[];
    edges: SampledEdge[];
    hopsCovered: number;
    metadata: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────

/** Create a simple seeded PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
    let s = seed | 0;
    return () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function toSampledEntity(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    nodeId: string
): SampledEntity {
    const attrs = graph.getNodeAttributes(nodeId);
    return {
        id: nodeId,
        label: attrs.label,
        entityType: attrs.entityType,
        score: attrs.score,
        degree: getEntityDegree(graph, nodeId),
    };
}

function collectEdge(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    source: string,
    target: string
): SampledEdge | null {
    const edge = graph.edges(source, target)[0];
    if (!edge) return null;
    const attrs = graph.getEdgeAttributes(edge);
    return { source, target, relation: attrs.relation, weight: attrs.weight };
}

function collectAllEdgesBetween(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    nodeSet: Set<string>
): SampledEdge[] {
    const edges: SampledEdge[] = [];
    graph.forEachEdge((edge: string, attrs: GraphEdgeAttrs, source: string, target: string) => {
        if (nodeSet.has(source) && nodeSet.has(target)) {
            edges.push({ source, target, relation: attrs.relation, weight: attrs.weight });
        }
    });
    return edges;
}

/** Filter entity neighbors by adaptive degree range.
 *  Falls back to all entity neighbors if degree filtering removes everything
 *  (common for very small graphs where adaptive range is too tight). */
function degreeFilteredNeighbors(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    nodeId: string,
    config: SamplingConfig
): string[] {
    const range = adaptiveDegreeRange(graph, {
        minDegree: config.degreeRange?.min,
        maxDegreeCap: config.degreeRange?.max ?? config.degreeRange?.maxDegreeCap,
    });
    const filtered: string[] = [];
    const allEntityNeighbors: string[] = [];
    graph.forEachNeighbor(nodeId, (neighbor: string) => {
        if (graph.getNodeAttributes(neighbor).type !== 'entity') return;
        allEntityNeighbors.push(neighbor);
        const deg = getEntityDegree(graph, neighbor);
        if (deg >= range.min && deg <= range.max) {
            filtered.push(neighbor);
        }
    });
    // Fallback: if degree range filtered everything out, use all entity neighbors
    // This is common for very small graphs where the adaptive range is too tight
    return filtered.length > 0 ? filtered : allEntityNeighbors;
}

/** Get unvisited entity neighbors, preferring degree-filtered ones but falling
 *  back to all when the filtered set is empty or all-filtered are already visited. */
function getNextEntityNeighbors(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    nodeId: string,
    config: SamplingConfig,
    visited: Set<string>
): string[] {
    const preferred = degreeFilteredNeighbors(graph, nodeId, config);
    const unvisitedPreferred = preferred.filter(n => !visited.has(n));
    if (unvisitedPreferred.length > 0) return unvisitedPreferred;

    // All preferred neighbors are visited — try all entity neighbors
    const all: string[] = [];
    graph.forEachNeighbor(nodeId, (neighbor: string) => {
        if (graph.getNodeAttributes(neighbor).type !== 'entity' && !visited.has(neighbor)) return;
        if (!visited.has(neighbor)) all.push(neighbor);
    });
    return all;
}

// ── augmented_chain ───────────────────────────────────────────────

/**
 * Walk a sequential chain from seed entity, picking the highest-degree
 * neighbor at each hop. Enrich each node with degree and score.
 * Good for multi-hop reasoning questions.
 */
function sampleAugmentedChain(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    config: SamplingConfig
): SamplingResult {
    const visited = new Set<string>();
    const entityOrder: string[] = [];
    const maxHops = config.maxHops;

    let current = config.seedEntities[0];
    if (!current || !graph.hasNode(current)) {
        return { strategy: 'augmented_chain', entities: [], edges: [], hopsCovered: 0, metadata: { reason: 'no_valid_seed' } };
    }

    visited.add(current);
    entityOrder.push(current);

    let hops = 0;
    while (hops < maxHops) {
        const neighbors = getNextEntityNeighbors(graph, current, config, visited);

        if (neighbors.length === 0) break;

        // Pick the highest-degree neighbor
        neighbors.sort((a, b) => getEntityDegree(graph, b) - getEntityDegree(graph, a));
        const next = neighbors[0];
        visited.add(next);
        entityOrder.push(next);
        current = next;
        hops++;
    }

    const nodeSet = new Set(entityOrder);
    const edges = collectAllEdgesBetween(graph, nodeSet);

    return {
        strategy: 'augmented_chain',
        entities: entityOrder.map(id => toSampledEntity(graph, id)),
        edges,
        hopsCovered: hops,
        metadata: { chainLength: entityOrder.length },
    };
}

// ── dual_core_bridge ──────────────────────────────────────────────

/**
 * Given two seed entities, find if they converge on a shared target entity.
 * Good for comparative analysis (e.g., "tokio vs async-std").
 */
function sampleDualCoreBridge(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    config: SamplingConfig
): SamplingResult {
    const seeds = config.seedEntities.slice(0, 2);
    const validSeeds = seeds.filter(s => graph.hasNode(s));

    if (validSeeds.length < 2) {
        return { strategy: 'dual_core_bridge', entities: [], edges: [], hopsCovered: 0, metadata: { reason: 'need_two_seeds' } };
    }

    const [seed1, seed2] = validSeeds;
    const maxHops = config.maxHops;

    // BFS from each seed, collecting reachable entity nodes within maxHops
    function bfsReachable(start: string): Map<string, number> {
        const dist = new Map<string, number>();
        const queue: Array<{ id: string; d: number }> = [{ id: start, d: 0 }];
        dist.set(start, 0);

        while (queue.length > 0) {
            const { id, d } = queue.shift()!;
            if (d >= maxHops) continue;
            graph.forEachNeighbor(id, (neighbor: string) => {
                if (dist.has(neighbor)) return;
                if (graph.getNodeAttributes(neighbor).type !== 'entity') return;
                dist.set(neighbor, d + 1);
                queue.push({ id: neighbor, d: d + 1 });
            });
        }
        return dist;
    }

    const reach1 = bfsReachable(seed1);
    const reach2 = bfsReachable(seed2);

    // Find convergence nodes: entities reachable from both seeds
    const convergenceNodes: Array<{ id: string; totalDist: number; dist1: number; dist2: number }> = [];
    for (const [nodeId, d1] of reach1) {
        const d2 = reach2.get(nodeId);
        if (d2 !== undefined && nodeId !== seed1 && nodeId !== seed2) {
            convergenceNodes.push({ id: nodeId, totalDist: d1 + d2, dist1: d1, dist2: d2 });
        }
    }
    convergenceNodes.sort((a, b) => a.totalDist - b.totalDist);

    if (convergenceNodes.length === 0) {
        // No convergence: just return the two seeds with their direct neighbors
        const nodeSet = new Set([seed1, seed2]);
        const neighbors1 = degreeFilteredNeighbors(graph, seed1, config).slice(0, 3);
        const neighbors2 = degreeFilteredNeighbors(graph, seed2, config).slice(0, 3);
        for (const n of neighbors1) nodeSet.add(n);
        for (const n of neighbors2) nodeSet.add(n);

        return {
            strategy: 'dual_core_bridge',
            entities: Array.from(nodeSet).map(id => toSampledEntity(graph, id)),
            edges: collectAllEdgesBetween(graph, nodeSet),
            hopsCovered: 0,
            metadata: { convergence: false, reason: 'no_shared_target' },
        };
    }

    // Trace shortest paths from each seed to the best convergence node
    const bridgeNode = convergenceNodes[0];
    const allNodes = new Set([seed1, seed2, bridgeNode.id]);

    // Trace path seed1 → bridge
    const path1 = tracePath(graph, seed1, bridgeNode.id, bridgeNode.dist1);
    const path2 = tracePath(graph, seed2, bridgeNode.id, bridgeNode.dist2);
    for (const n of path1) allNodes.add(n);
    for (const n of path2) allNodes.add(n);

    const edges = collectAllEdgesBetween(graph, allNodes);
    const maxDist = Math.max(bridgeNode.dist1, bridgeNode.dist2);

    return {
        strategy: 'dual_core_bridge',
        entities: Array.from(allNodes).map(id => toSampledEntity(graph, id)),
        edges,
        hopsCovered: maxDist,
        metadata: {
            convergence: true,
            bridgeEntity: bridgeNode.id,
            bridgeLabel: graph.getNodeAttributes(bridgeNode.id).label,
            distFromSeed1: bridgeNode.dist1,
            distFromSeed2: bridgeNode.dist2,
            totalConvergencePoints: convergenceNodes.length,
        },
    };
}

/** Trace a shortest path from start to target using BFS (entity-only). */
function tracePath(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    start: string,
    target: string,
    maxDepth: number
): string[] {
    const prev = new Map<string, string>();
    const visited = new Set<string>([start]);
    const queue: Array<{ id: string; d: number }> = [{ id: start, d: 0 }];

    while (queue.length > 0) {
        const { id, d } = queue.shift()!;
        if (id === target) break;
        if (d >= maxDepth) continue;

        graph.forEachNeighbor(id, (neighbor: string) => {
            if (visited.has(neighbor)) return;
            if (graph.getNodeAttributes(neighbor).type !== 'entity') return;
            visited.add(neighbor);
            prev.set(neighbor, id);
            queue.push({ id: neighbor, d: d + 1 });
        });
    }

    // Reconstruct path
    const path: string[] = [];
    let cur = target;
    while (cur && cur !== start) {
        path.push(cur);
        cur = prev.get(cur)!;
    }
    return path;
}

// ── community_core_path ───────────────────────────────────────────

/**
 * High-degree hub entities at the center, paths radiating to peripheral entities.
 * Useful for understanding the "backbone" of the knowledge graph.
 */
function sampleCommunityCorePath(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    config: SamplingConfig
): SamplingResult {
    const range = adaptiveDegreeRange(graph, {
        minDegree: config.degreeRange?.min,
        maxDegreeCap: config.degreeRange?.max ?? config.degreeRange?.maxDegreeCap,
    });

    // Find hub entities within degree range
    let allEntities = filterEntitiesByDegree(graph, {
        minDegree: range.min,
        maxDegreeCap: range.max,
    });

    // Fallback: if degree filtering removes everything, use all entities
    if (allEntities.length === 0) {
        const entities: Array<{ id: string; degree: number; label: string }> = [];
        graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
            if (attrs.type === 'entity') {
                entities.push({ id: node, degree: getEntityDegree(graph, node), label: attrs.label });
            }
        });
        entities.sort((a, b) => b.degree - a.degree);
        allEntities = entities;
    }

    if (allEntities.length === 0) {
        return { strategy: 'community_core_path', entities: [], edges: [], hopsCovered: 0, metadata: { reason: 'no_entities' } };
    }

    // Top hub: highest-degree entity (or seed if provided)
    let hubId = allEntities[0].id;
    if (config.seedEntities.length > 0 && graph.hasNode(config.seedEntities[0])) {
        hubId = config.seedEntities[0];
    }

    // Collect hub and its neighbors within maxHops
    // Use degreeFilteredNeighbors with fallback for each step
    const visited = new Set<string>();
    const nodeSet = new Set<string>();
    const queue: Array<{ id: string; d: number }> = [{ id: hubId, d: 0 }];
    visited.add(hubId);

    while (queue.length > 0) {
        const { id, d } = queue.shift()!;
        if (d > config.maxHops) continue;
        const attrs = graph.getNodeAttributes(id);
        if (attrs.type === 'entity') nodeSet.add(id);

        // Use getNextEntityNeighbors for consistent fallback behavior
        const visitedSet = visited as Set<string>;
        graph.forEachNeighbor(id, (neighbor: string) => {
            if (visited.has(neighbor)) return;
            if (graph.getNodeAttributes(neighbor).type !== 'entity') return;
            visited.add(neighbor);
            queue.push({ id: neighbor, d: d + 1 });
        });
    }

    const edges = collectAllEdgesBetween(graph, nodeSet);

    return {
        strategy: 'community_core_path',
        entities: Array.from(nodeSet).map(id => toSampledEntity(graph, id)),
        edges,
        hopsCovered: Math.min(config.maxHops, ...Array.from(nodeSet).map(id => {
            // BFS distance from hub
            const visited2 = new Set<string>();
            const q: Array<{ n: string; d: number }> = [{ n: hubId, d: 0 }];
            visited2.add(hubId);
            while (q.length > 0) {
                const { n, d } = q.shift()!;
                if (n === id) return d;
                graph.forEachNeighbor(n, (nb: string) => {
                    if (!visited2.has(nb) && nodeSet.has(nb)) {
                        visited2.add(nb);
                        q.push({ n: nb, d: d + 1 });
                    }
                });
            }
            return config.maxHops;
        })),
        metadata: {
            hubEntity: hubId,
            hubLabel: graph.getNodeAttributes(hubId).label,
            hubDegree: getEntityDegree(graph, hubId),
            totalEntities: allEntities.length,
        },
    };
}

// ── deep_chain ────────────────────────────────────────────────────

/**
 * Depth-limited DFS (max 5-8 hops), exploring the deepest reachable paths.
 * Not NP-hard longest path — just a bounded DFS with cycle detection.
 */
function sampleDeepChain(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    config: SamplingConfig
): SamplingResult {
    const start = config.seedEntities[0];
    if (!start || !graph.hasNode(start)) {
        return { strategy: 'deep_chain', entities: [], edges: [], hopsCovered: 0, metadata: { reason: 'no_valid_seed' } };
    }

    const maxHops = Math.min(config.maxHops, 8); // hard cap at 8

    // DFS tracking the deepest path found
    let bestPath: string[] = [start];

    function dfs(current: string, path: string[], visited: Set<string>) {
        if (path.length > bestPath.length) {
            bestPath = [...path];
        }
        if (path.length - 1 >= maxHops) return;

        const neighbors = getNextEntityNeighbors(graph, current, config, visited);

        for (const next of neighbors) {
            visited.add(next);
            path.push(next);
            dfs(next, path, visited);
            path.pop();
            visited.delete(next);
        }
    }

    const visited = new Set<string>([start]);
    dfs(start, [start], visited);

    const nodeSet = new Set(bestPath);
    const edges = collectAllEdgesBetween(graph, nodeSet);

    return {
        strategy: 'deep_chain',
        entities: bestPath.map(id => toSampledEntity(graph, id)),
        edges,
        hopsCovered: bestPath.length - 1,
        metadata: { chainLength: bestPath.length },
    };
}

// ── mixed ─────────────────────────────────────────────────────────

/** Randomly pick one of the concrete strategies. */
function sampleMixed(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    config: SamplingConfig
): SamplingResult {
    const strategies: SamplingStrategy[] = [
        'augmented_chain',
        'dual_core_bridge',
        'community_core_path',
        'deep_chain',
    ];

    const rng = mulberry32(config.rngSeed ?? 42);
    const idx = Math.floor(rng() * strategies.length);
    const chosen = strategies[idx];

    return sampleGraph(graph, { ...config, strategy: chosen });
}

// ── Main dispatch ─────────────────────────────────────────────────

/** Sample a knowledge graph using the specified strategy. */
export function sampleGraph(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    config: SamplingConfig
): SamplingResult {
    switch (config.strategy) {
        case 'augmented_chain':
            return sampleAugmentedChain(graph, config);
        case 'dual_core_bridge':
            return sampleDualCoreBridge(graph, config);
        case 'community_core_path':
            return sampleCommunityCorePath(graph, config);
        case 'deep_chain':
            return sampleDeepChain(graph, config);
        case 'mixed':
            return sampleMixed(graph, config);
        default:
            return { strategy: config.strategy, entities: [], edges: [], hopsCovered: 0, metadata: { reason: 'unknown_strategy' } };
    }
}
