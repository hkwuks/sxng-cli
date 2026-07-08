/**
 * results-add subcommand - Append external search results to session as pending.
 *
 * Use this to inject results from other search tools (tavily, exa, etc.)
 * into the session pipeline. Results go through the same pending → approve
 * → graph injection flow as sxng-native results.
 */

import { createSuccessEnvelope, createErrorEnvelope } from '../protocol.js';
import { appendSessionResults, resolveSessionPath, getPendingResults } from '../deep/session.js';

export interface ResultsAddOptions {
    session: string;
    data: string; // JSON array of results
}

export async function runResultsAdd(options: ResultsAddOptions): Promise<number> {
    const sessionDir = resolveSessionPath(options.session);

    // Parse input data
    let results: Array<{ url: string; title: string; content?: string; source?: string }>;
    try {
        const parsed = JSON.parse(options.data);
        results = Array.isArray(parsed) ? parsed : (parsed.results || []);
    } catch {
        const envelope = createErrorEnvelope(
            'INVALID_JSON',
            'Failed to parse --data JSON',
            { hint: 'Provide a JSON array of results or an object with a "results" array' }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    if (results.length === 0) {
        const envelope = createErrorEnvelope(
            'NO_RESULTS',
            'No results found in --data',
            { hint: 'Ensure the JSON contains a non-empty results array' }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    const result = appendSessionResults(sessionDir, results);
    const pendingCount = getPendingResults(sessionDir).length;

    const envelope = createSuccessEnvelope({
        added: result.added,
        total: result.total,
        pendingCount,
        message: `Added ${result.added} results from external source as pending (${pendingCount} total pending). Run --quality --approve to inject into graph.`,
    });
    console.log(JSON.stringify(envelope, null, 2));
    return 0;
}
