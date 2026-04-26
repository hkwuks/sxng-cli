/**
 * Extract subcommand - content extraction from URLs or search results
 */

import { ContentExtractor, ExtractedContent } from '../deep/extractor.js';
import { createSuccessEnvelope, createErrorEnvelope } from '../protocol.js';
import { readFileSync } from 'fs';
import { loadSessionResults, mergeExtractedContent, resolveSessionPath } from '../deep/session.js';

export interface ExtractOptions {
    urls?: string[];
    fromJson?: string;
    session?: string;
}

interface ExtractOutput {
    extracted: ExtractedContent[];
    failed: string[];
    stats: {
        total: number;
        success: number;
        failed: number;
    };
}

export async function runExtract(
    extractor: ContentExtractor,
    options: ExtractOptions
): Promise<number> {
    let urls: string[] = [];

    // Resolve session path if provided
    if (options.session) {
        options.session = resolveSessionPath(options.session);
    }

    if (options.urls && options.urls.length > 0) {
        urls = options.urls;
    } else if (options.session) {
        // Read URLs from session results
        const results = loadSessionResults(options.session);
        if (results.length === 0) {
            const envelope = createErrorEnvelope(
                'SESSION_EMPTY',
                `Session has no results: ${options.session}`,
                { hint: 'Run a search with --session first to accumulate results' }
            );
            console.log(JSON.stringify(envelope, null, 2));
            return 1;
        }
        urls = results.map(r => r.url).filter(u => typeof u === 'string' && u.length > 0);
    } else if (options.fromJson) {
        try {
            const raw = readFileSync(options.fromJson, 'utf-8');
            const parsed = JSON.parse(raw);

            // Handle envelope format
            let data = parsed;
            if (parsed.status === 'ok' && parsed.data) {
                data = parsed.data;
            }

            // Extract URLs from results array
            const results = data.results || [];
            urls = results
                .map((r: any) => r.url as string)
                .filter((u: string) => typeof u === 'string' && u.length > 0);
        } catch (error) {
            const envelope = createErrorEnvelope(
                'FILE_READ_FAILED',
                `Failed to read or parse file: ${options.fromJson}`,
                { hint: 'Ensure the file exists and contains valid JSON with a results array' }
            );
            console.log(JSON.stringify(envelope, null, 2));
            return 1;
        }
    } else {
        const envelope = createErrorEnvelope(
            'MISSING_INPUT',
            'No URLs or input file provided for extraction',
            { hint: 'Use: sxng extract --urls "url1,url2" or sxng extract --from-json results.json or sxng extract --session /tmp/s' }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    if (urls.length === 0) {
        const envelope = createErrorEnvelope(
            'NO_URLS',
            'No URLs found to extract',
            { hint: 'Provide URLs directly or ensure the JSON/session contains results with URLs' }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    try {
        const contents = await extractor.extractBatch(urls);

        const extracted = contents.filter(c => !c.error && c.content.length > 100);
        const failed = contents.filter(c => c.error || c.content.length <= 100).map(c => c.url);

        // Merge extracted content into session if --session provided
        let sessionMerge: { updated: number; total: number } | null = null;
        if (options.session) {
            sessionMerge = mergeExtractedContent(options.session, contents);
        }

        const output: ExtractOutput = {
            extracted,
            failed,
            stats: {
                total: urls.length,
                success: extracted.length,
                failed: failed.length,
            },
        };

        const envelope = createSuccessEnvelope({
            ...output,
            ...(sessionMerge ? { session: sessionMerge } : {}),
        });
        console.log(JSON.stringify(envelope, null, 2));
        return 0;
    } catch (error) {
        const envelope = createErrorEnvelope(
            'EXTRACT_FAILED',
            error instanceof Error ? error.message : 'Content extraction failed',
            { retryable: true }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }
}