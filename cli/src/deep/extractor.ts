/**
 * Content extraction: Defuddle (linkedom) → Playwright fallback
 */

import { parseHTML } from 'linkedom';
import { Defuddle } from 'defuddle/node';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CONCURRENCY = 3;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MIN_CONTENT_LENGTH = 100;
const PW_THRESHOLD = 50;

export interface ExtractorOptions {
    timeoutMs?: number;
    concurrency?: number;
    maxResponseBytes?: number;
    playwright?: boolean;
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
    method?: 'defuddle' | 'playwright';
}

type PwBrowser = any;
type PwPage = any;

let _browser: PwBrowser | null = null;
let _pwModule: any = null;

async function loadPlaywright() {
    if (_pwModule) return _pwModule;
    try {
        // @ts-ignore — playwright is an optional peer dependency
        _pwModule = await import('playwright');
        return _pwModule;
    } catch { return null; }
}

async function getBrowser(): Promise<PwBrowser | null> {
    if (_browser) return _browser;
    const pw = await loadPlaywright();
    if (!pw) return null;
    _browser = await pw.chromium.launch({ headless: true });
    return _browser;
}

async function closeBrowser() {
    if (_browser) { await _browser.close(); _browser = null; }
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

export class ContentExtractor {
    private timeoutMs: number;
    private concurrency: number;
    private maxResponseBytes: number;
    private usePlaywright: boolean;

    constructor(options?: ExtractorOptions) {
        this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;
        this.maxResponseBytes = options?.maxResponseBytes ?? MAX_RESPONSE_BYTES;
        this.usePlaywright = options?.playwright ?? false;
    }

    async extract(url: string): Promise<ExtractedContent> {
        try {
            const html = await this.fetchHtml(url);
            const result = await defuddleExtract(html, url);

            if (result.content.length >= MIN_CONTENT_LENGTH) return result;

            // Defuddle insufficient → Playwright fallback
            if (this.usePlaywright && result.content.length < PW_THRESHOLD) {
                const pwResult = await this.playwrightExtract(url);
                if (pwResult && pwResult.content.length > result.content.length) return pwResult;
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

    // Sync wrapper for backward compat — uses Defuddle with useAsync:false
    // Note: still async internally because defuddle/node export is async
    async extractFromHtml(html: string, url: string): Promise<ExtractedContent> {
        return defuddleExtract(html, url);
    }

    private async playwrightExtract(url: string): Promise<ExtractedContent | null> {
        const browser = await getBrowser();
        if (!browser) return null;

        try {
            const page = await browser.newPage();
            await page.setExtraHTTPHeaders({ 'User-Agent': 'Mozilla/5.0 (compatible; SxngDeepSearch/1.0)' });

            const response = await page.goto(url, {
                waitUntil: 'networkidle',
                timeout: this.timeoutMs,
            });
            if (!response || !response.ok()) {
                await page.close();
                return null;
            }

            await page.waitForTimeout(1000);
            const html = await page.content();
            await page.close();

            const result = await defuddleExtract(html, url);
            result.method = 'playwright';
            return result;
        } catch { return null; }
    }

    async extractBatch(urls: string[]): Promise<ExtractedContent[]> {
        const results: ExtractedContent[] = [];
        for (let i = 0; i < urls.length; i += this.concurrency) {
            const batch = urls.slice(i, i + this.concurrency);
            const batchResults = await Promise.all(batch.map(u => this.extract(u)));
            results.push(...batchResults);
        }
        await closeBrowser();
        return results;
    }
}