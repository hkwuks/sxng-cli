/**
 * graph-explore subcommand — List all relations around a seed entity
 */

import { resolveSessionPath, loadSessionGraph } from '../deep/session.js';
import { GraphNodeAttrs, GraphEdgeAttrs } from '../deep/graph.js';
import { createSuccessEnvelope, createErrorEnvelope } from '../protocol.js';
import {
    exploreSeedEntity, detectDeadEnd,
    formatExploreAsMarkdown, formatDeadEndAsMarkdown,
} from '../deep/graph-explore.js';

export interface GraphExploreOptions {
    session: string;
    seed: string;
    format?: 'json' | 'md';
}

export async function runGraphExplore(options: GraphExploreOptions): Promise<number> {
    const sessionDir = resolveSessionPath(options.session);
    const graph = loadSessionGraph(sessionDir);
    const result = exploreSeedEntity(graph, options.seed);

    if ('error' in result) {
        const envelope = createErrorEnvelope('ENTITY_NOT_FOUND', result.error, {
            details: { suggestions: result.suggestions.map(s => `${s.label} (distance: ${s.distance})`) },
        });
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    // Check for dead end
    const deadEnd = detectDeadEnd(graph, result.entity.id);

    if (options.format === 'md') {
        console.log(formatExploreAsMarkdown(result));
        if (deadEnd) {
            console.log(formatDeadEndAsMarkdown(deadEnd));
        }
    } else {
        const output = deadEnd ? { ...result, deadEnd } : result;
        console.log(JSON.stringify(createSuccessEnvelope(output), null, 2));
    }
    return 0;
}