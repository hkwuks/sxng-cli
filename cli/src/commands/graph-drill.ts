/**
 * graph-drill subcommand — Follow specific relations from an entity
 */

import { resolveSessionPath, loadSessionGraph } from '../deep/session.js';
import { createSuccessEnvelope, createErrorEnvelope } from '../protocol.js';
import { drillByRelations, formatDrillAsMarkdown } from '../deep/graph-explore.js';

export interface GraphDrillOptions {
    session: string;
    seed: string;
    relations: string[];
    format?: 'json' | 'md';
}

export async function runGraphDrill(options: GraphDrillOptions): Promise<number> {
    const sessionDir = resolveSessionPath(options.session);
    const graph = loadSessionGraph(sessionDir);
    const result = drillByRelations(graph, options.seed, options.relations);

    if ('error' in result) {
        const envelope = createErrorEnvelope('ENTITY_NOT_FOUND', result.error, {
            details: { suggestions: result.suggestions.map(s => `${s.label} (distance: ${s.distance})`) },
        });
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    if (options.format === 'md') {
        console.log(formatDrillAsMarkdown(result));
    } else {
        console.log(JSON.stringify(createSuccessEnvelope(result), null, 2));
    }
    return 0;
}