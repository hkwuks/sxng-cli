/**
 * Extract subcommand - content extraction from URLs or search results
 */

import { ContentExtractor, ExtractedContent } from '../deep/extractor.js';
import { createSuccessEnvelope, createErrorEnvelope } from '../protocol.js';
import { loadSessionResults, mergeExtractedContent, resolveSessionPath } from '../deep/session.js';
import { SimHash } from '../deep/simhash.js';

export interface ExtractOptions {
    urls?: string[];
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
        urls = results.map(r => r.url)
            .filter(u => typeof u === 'string' && u.length > 0 && !u.startsWith('file://'));
    } else {
        const envelope = createErrorEnvelope(
            'MISSING_INPUT',
            'No URLs or input file provided for extraction',
            { hint: 'Use: sxng extract --urls "url1,url2" or sxng extract --session <session>' }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    if (urls.length === 0) {
        const envelope = createErrorEnvelope(
            'NO_URLS',
            'No URLs found to extract',
            { hint: 'Provide URLs directly or ensure the session contains results with URLs' }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    try {
        const contents = await extractor.extractBatch(urls);

        // Deduplicate extracted content by first 500 chars using SimHash
        const simhash = new SimHash();
        const seenHashes: bigint[] = [];
        const extracted: ExtractedContent[] = [];
        const failed: string[] = [];

        for (const c of contents) {
            if (c.error || c.content.length <= 100) {
                failed.push(c.url);
                continue;
            }
            const prefix = c.content.slice(0, 500);
            const h = simhash.hash(prefix);
            let isDuplicate = false;
            for (const existing of seenHashes) {
                if (simhash.similarity(h, existing) >= 0.85) {
                    isDuplicate = true;
                    break;
                }
            }
            if (!isDuplicate) {
                extracted.push(c);
                seenHashes.push(h);
            } else {
                failed.push(c.url);
            }
        }

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