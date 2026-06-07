/**
 * On-demand degree computation for entity nodes.
 *
 * Degree is NOT stored in node attributes — it's computed on-the-fly
 * from the graph topology using graphology's O(1) inDegree/outDegree.
 * This ensures degree is always consistent with the current graph state.
 */

import { DirectedGraph } from 'graphology';
import { GraphNodeAttrs, GraphEdgeAttrs } from './graph.js';

/** Get the total degree (in + out) for a single node. O(1) via graphology. */
export function getEntityDegree(graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>, nodeId: string): number {
    return graph.inDegree(nodeId) + graph.outDegree(nodeId);
}

/** Get degree for all entity nodes (type === 'entity') in the graph. */
export function getEntitiesWithDegrees(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>
): Array<{ id: string; degree: number; label: string }> {
    const result: Array<{ id: string; degree: number; label: string }> = [];
    graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type === 'entity') {
            result.push({
                id: node,
                degree: getEntityDegree(graph, node),
                label: attrs.label,
            });
        }
    });
    return result.sort((a, b) => b.degree - a.degree);
}

/** Compute adaptive degree range for filtering entity nodes.
 *  - d_max = min(50, floor(graph.order / 5))
 *  - d_min = 1 by default
 *  Small graphs auto-shrink: 30 nodes → d_max=6, 100 nodes → d_max=20
 */
export function adaptiveDegreeRange(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    opts?: { minDegree?: number; maxDegreeCap?: number }
): { min: number; max: number } {
    const dMin = opts?.minDegree ?? 1;
    const cap = opts?.maxDegreeCap ?? 50;
    const dMax = Math.min(cap, Math.floor(graph.order / 5));
    return { min: dMin, max: Math.max(dMax, dMin) };
}

/** Filter entity nodes within the adaptive degree range. */
export function filterEntitiesByDegree(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    opts?: { minDegree?: number; maxDegreeCap?: number }
): Array<{ id: string; degree: number; label: string }> {
    const range = adaptiveDegreeRange(graph, opts);
    return getEntitiesWithDegrees(graph).filter(e => e.degree >= range.min && e.degree <= range.max);
}
