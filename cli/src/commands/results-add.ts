/**
 * results-add subcommand - Append external search results to session as pending.
 *
 * Use this to inject results from other search tools (tavily, exa, etc.)
 * into the session pipeline. Results go through the same pending → approve
 * → graph injection flow as sxng-native results.
 */

import { createSuccessEnvelope, createErrorEnvelope } from '../protocol.js';
import { appendSessionResults, resolveSessionPath, getPendingResults, injectApprovedResults } from '../deep/session.js';
import { isJsonObject, readSingleJsonInput } from './json-input.js';

export interface ResultsAddOptions {
    session: string;
    data?: string; // JSON array of results
    dataFile?: string;
    query: string;
}

export async function runResultsAdd(options: ResultsAddOptions): Promise<number> {
    const sessionDir = resolveSessionPath(options.session);

    const input = readSingleJsonInput([
        { option: '--data', value: options.data },
        { option: '--data-file', value: options.dataFile, file: true },
    ]);
    if (!input.ok) {
        console.log(JSON.stringify(createErrorEnvelope(input.code, input.message), null, 2));
        return 1;
    }

    // Validate command-specific result shape after shared transport parsing.
    const parsed = input.value;
    const results = Array.isArray(parsed)
        ? parsed
        : (isJsonObject(parsed) && Array.isArray(parsed.results) ? parsed.results : []);

    if (results.length === 0) {
        const envelope = createErrorEnvelope(
            'NO_RESULTS',
            'No results found in --data',
            { hint: 'Ensure the JSON contains a non-empty results array' }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }
    if (!results.every(result => isJsonObject(result) && typeof result.url === 'string' && typeof result.title === 'string')) {
        console.log(JSON.stringify(createErrorEnvelope(
            'INVALID_RESULTS',
            'Each result must be an object with string url and title fields',
            { hint: 'Provide a JSON array of search results or an object with a results array' }
        ), null, 2));
        return 1;
    }

    const result = appendSessionResults(sessionDir, results.map(({ extractedAt: _extractedAt, ...item }) => ({
        ...(item as { url: string; title: string; content?: string; source?: string }),
        origins: [{ query: options.query }],
    })));
    injectApprovedResults(sessionDir, result.approvedResults);
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
