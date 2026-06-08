/**
 * Content extraction: Defuddle (linkedom) → Obscura fallback
 */

import { parseHTML } from 'linkedom';
import { Defuddle } from 'defuddle/node';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { homedir } from 'os';
import { join } from 'path';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CONCURRENCY = 3;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MIN_CONTENT_LENGTH = 100;
const OBSCURA_THRESHOLD = 50;

const OBSCURA_SEARCH_PATHS = [
    'obscura',
    join(homedir(), '.local/bin/obscura'),
    '/usr/local/bin/obscura',
];

export interface ExtractorOptions {
    timeoutMs?: number;
    concurrency?: number;
    maxResponseBytes?: number;
    obscura?: boolean;
    obscuraPath?: string;
    obscuraDumpFormat?: 'html' | 'markdown';
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
    method?: 'defuddle' | 'obscura';
}

let _obscuraAvailable: boolean | null = null;

async function findObscura(path?: string): Promise<string | null> {
    const candidates = path ? [path] : OBSCURA_SEARCH_PATHS;
    for (const candidate of candidates) {
        try {
            await execFileAsync(candidate, ['--version'], { timeout: 5_000 });
            return candidate;
        } catch { continue; }
    }
    return null;
}

async function isObscuraAvailable(path?: string): Promise<boolean> {
    if (_obscuraAvailable !== null && !path) return _obscuraAvailable;
    const found = await findObscura(path);
    const available = found !== null;
    if (!path) _obscuraAvailable = available;
    return available;
}

async function defuddleExtract(html: string, url: string): Promise<ExtractedContent> {
    try {
        const { document } = parseHTML(html);
        const result = await Defuddle(document as any, url, {
            markdown: true,
            useAsync: false,
        });

        const content = (result.content || '').trim();
        if (!content) {
            return {
                title: result.title || '',
                content: '',
                excerpt: result.description || '',
                url,
                byline: result.author || undefined,
                siteName: result.site || undefined,
                length: 0,
                extractedAt: Date.now(),
                method: 'defuddle',
                error: 'Defuddle could not extract content',
            };
        }

        return {
            title: result.title || '',
            content,
            excerpt: result.description || '',
            url,
            byline: result.author || undefined,
            siteName: result.site || undefined,
            length: result.wordCount || content.length,
            extractedAt: Date.now(),
            method: 'defuddle',
        };
    } catch (error) {
        return {
            title: '',
            content: '',
            excerpt: '',
            url,
            length: 0,
            extractedAt: Date.now(),
            method: 'defuddle',
            error: error instanceof Error ? error.message : 'Defuddle parsing failed',
        };
    }
}

async function obscuraExtract(
    url: string,
    options: { timeoutMs: number; obscuraPath?: string; dumpFormat?: 'html' | 'markdown' }
): Promise<ExtractedContent | null> {
    const obscuraBin = await findObscura(options.obscuraPath);
    if (!obscuraBin) return null;

    try {
        const dumpFormat = options.dumpFormat ?? 'html';
        const timeoutSec = Math.ceil(options.timeoutMs / 1000);

        const { stdout } = await execFileAsync(
            obscuraBin,
            ['fetch', url, '--dump', dumpFormat, '--timeout', String(timeoutSec)],
            { timeout: options.timeoutMs + 5_000, maxBuffer: 10 * 1024 * 1024 }
        );

        if (!stdout || !stdout.trim()) return null;

        if (dumpFormat === 'markdown') {
            return {
                title: '',
                content: stdout.trim(),
                excerpt: '',
                url,
                length: stdout.trim().length,
                extractedAt: Date.now(),
                method: 'obscura',
            };
        }

        const html = stdout.trim();
        const result = await defuddleExtract(html, url);
        result.method = 'obscura';
        return result;
    } catch { return null; }
}

export class ContentExtractor {
    private timeoutMs: number;
    private concurrency: number;
    private maxResponseBytes: number;
    private useObscura: boolean;
    private obscuraPath?: string;
    private obscuraDumpFormat: 'html' | 'markdown';

    constructor(options?: ExtractorOptions) {
        this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;
        this.maxResponseBytes = options?.maxResponseBytes ?? MAX_RESPONSE_BYTES;
        this.useObscura = options?.obscura ?? false;
        this.obscuraPath = options?.obscuraPath;
        this.obscuraDumpFormat = options?.obscuraDumpFormat ?? 'html';
    }

    async extract(url: string): Promise<ExtractedContent> {
        try {
            const html = await this.fetchHtml(url);
            const result = await defuddleExtract(html, url);

            if (result.content.length >= MIN_CONTENT_LENGTH) return result;

            // Defuddle insufficient → Obscura fallback
            if (this.useObscura && result.content.length < OBSCURA_THRESHOLD) {
                const obsResult = await obscuraExtract(url, {
                    timeoutMs: this.timeoutMs,
                    obscuraPath: this.obscuraPath,
                    dumpFormat: this.obscuraDumpFormat,
                });
                if (obsResult && obsResult.content.length > result.content.length) return obsResult;
            }

            if (result.content.length < MIN_CONTENT_LENGTH && !result.error) {
                result.error = 'Extracted content too short';
            }
            return result;
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

    private async fetchHtml(url: string): Promise<string> {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; SxngDeepSearch/1.0)',
                'Accept': 'text/html,application/xhtml+xml',
            },
            signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > this.maxResponseBytes) {
            throw new Error(`Response too large: ${contentLength} bytes (max ${this.maxResponseBytes})`);
        }

        const html = await response.text();
        if (html.length > this.maxResponseBytes) {
            throw new Error(`Response too large: ${html.length} bytes (max ${this.maxResponseBytes})`);
        }
        return html;
    }

    async extractFromHtml(html: string, url: string): Promise<ExtractedContent> {
        return defuddleExtract(html, url);
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
