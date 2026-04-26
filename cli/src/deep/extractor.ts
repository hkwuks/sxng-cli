/**
 * Content extraction using linkedom + @mozilla/readability
 */

import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CONCURRENCY = 3;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB

export interface ExtractorOptions {
    timeoutMs?: number;
    concurrency?: number;
    maxResponseBytes?: number;
}

export interface ExtractedContent {
    title: string;
    content: string;
    excerpt: string;
    url: string;
    byline?: string;
    siteName?: string;
    length: number;
    extractedAt: number;
    error?: string;
}

export class ContentExtractor {
    private timeoutMs: number;
    private concurrency: number;
    private maxResponseBytes: number;

    constructor(options?: ExtractorOptions) {
        this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;
        this.maxResponseBytes = options?.maxResponseBytes ?? MAX_RESPONSE_BYTES;
    }

    async extract(url: string): Promise<ExtractedContent> {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SxngDeepSearch/1.0)',
                    'Accept': 'text/html,application/xhtml+xml',
                },
                signal: AbortSignal.timeout(this.timeoutMs),
            });

            if (!response.ok) {
                return {
                    title: '',
                    content: '',
                    excerpt: '',
                    url,
                    length: 0,
                    extractedAt: Date.now(),
                    error: `HTTP ${response.status}: ${response.statusText}`,
                };
            }

            const contentLength = response.headers.get('content-length');
            if (contentLength && parseInt(contentLength, 10) > this.maxResponseBytes) {
                return {
                    title: '',
                    content: '',
                    excerpt: '',
                    url,
                    length: 0,
                    extractedAt: Date.now(),
                    error: `Response too large: ${contentLength} bytes (max ${this.maxResponseBytes})`,
                };
            }

            const html = await response.text();
            if (html.length > this.maxResponseBytes) {
                return {
                    title: '',
                    content: '',
                    excerpt: '',
                    url,
                    length: 0,
                    extractedAt: Date.now(),
                    error: `Response too large: ${html.length} bytes (max ${this.maxResponseBytes})`,
                };
            }

            return this.extractFromHtml(html, url);
        } catch (error) {
            return {
                title: '',
                content: '',
                excerpt: '',
                url,
                length: 0,
                extractedAt: Date.now(),
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    extractFromHtml(html: string, url: string): ExtractedContent {
        try {
            const { document } = parseHTML(html);
            const reader = new Readability(document as any, { charThreshold: 100 });
            const article = reader.parse();

            if (!article || !article.textContent) {
                return {
                    title: '',
                    content: '',
                    excerpt: '',
                    url,
                    length: 0,
                    extractedAt: Date.now(),
                    error: 'Readability could not extract content',
                };
            }

            return {
                title: article.title || '',
                content: article.textContent.replace(/\n{3,}/g, '\n\n').trim(),
                excerpt: article.excerpt || '',
                url,
                byline: article.byline || undefined,
                siteName: article.siteName || undefined,
                length: article.length || article.textContent.length,
                extractedAt: Date.now(),
            };
        } catch (error) {
            return {
                title: '',
                content: '',
                excerpt: '',
                url,
                length: 0,
                extractedAt: Date.now(),
                error: error instanceof Error ? error.message : 'HTML parsing failed',
            };
        }
    }

    async extractBatch(urls: string[]): Promise<ExtractedContent[]> {
        const results: ExtractedContent[] = [];
        for (let i = 0; i < urls.length; i += this.concurrency) {
            const batch = urls.slice(i, i + this.concurrency);
            const batchResults = await Promise.all(batch.map(u => this.extract(u)));
            results.push(...batchResults);
        }
        return results;
    }
}