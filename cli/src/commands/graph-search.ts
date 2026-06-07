/**
 * graph-search subcommand — Keyword search across entity labels
 */

import { resolveSessionPath, loadSessionGraph } from '../deep/session.js';
import { createSuccessEnvelope } from '../protocol.js';
import { searchEntities, formatSearchAsMarkdown } from '../deep/graph-explore.js';

export interface GraphSearchOptions {
    session: string;
    keyword: string;
    limit: number;
    format?: 'json' | 'md';
}

export async function runGraphSearch(options: GraphSearchOptions): Promise<number> {
    const sessionDir = resolveSessionPath(options.session);
    const graph = loadSessionGraph(sessionDir);
    const results = searchEntities(graph, options.keyword, options.limit);

    if (options.format === 'md') {
        console.log(formatSearchAsMarkdown(results, options.keyword));
    } else {
        console.log(JSON.stringify(createSuccessEnvelope({ keyword: options.keyword, results }), null, 2));
    }
    return 0;
}