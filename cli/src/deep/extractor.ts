/**
 * Content extraction: Defuddle (linkedom) → Obscura → Jina Reader fallback
 */

import { parseHTML } from 'linkedom';
import { Defuddle } from 'defuddle/node';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { homedir, arch, platform } from 'os';
import { join } from 'path';
import { mkdir, chmod, writeFile, rm } from 'fs/promises';

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

const OBSCURA_INSTALL_DIR = join(homedir(), '.local', 'bin');
const OBSCURA_INSTALL_PATH = join(OBSCURA_INSTALL_DIR, 'obscura');
const OBSCURA_RELEASE_DOWNLOAD_BASE = 'https://github.com/h4ckf0r0day/obscura/releases/latest/download';

const JINA_READER_BASE = 'https://r.jina.ai';
const JINA_RPM = 20; // ponytail: free tier rate limit, 1 request per 3s average
const JINA_WINDOW_MS = 60_000;

export interface ExtractorOptions {
    timeoutMs?: number;
    concurrency?: number;
    maxResponseBytes?: number;
    obscura?: boolean;
    obscuraPath?: string;
    obscuraDumpFormat?: 'html' | 'markdown';
    jina?: boolean;
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
    method?: 'defuddle' | 'obscura' | 'jina';
}

let _obscuraAvailable: boolean | null = null;
let _obscuraInstallAttempted = false;

function getObscuraTarballName(): string | null {
    const p = platform();
    const a = arch();
    if (p === 'linux' && a === 'x64') return 'obscura-x86_64-linux.tar.gz';
    if (p === 'linux' && a === 'arm64') return 'obscura-aarch64-linux.tar.gz';
    if (p === 'darwin' && a === 'x64') return 'obscura-x86_64-macos.tar.gz';
    if (p === 'darwin' && a === 'arm64') return 'obscura-aarch64-macos.tar.gz';
    return null;
}

export function obscuraDownloadUrl(tarball: string): string {
    return `${OBSCURA_RELEASE_DOWNLOAD_BASE}/${tarball}`;
}

async function installObscura(): Promise<string | null> {
    if (_obscuraInstallAttempted) return null;
    _obscuraInstallAttempted = true;

    const tarball = getObscuraTarballName();
    if (!tarball) return null;

    try {
        const response = await fetch(obscuraDownloadUrl(tarball), { signal: AbortSignal.timeout(60_000) });
        if (!response.ok) return null;

        const archive = Buffer.from(await response.arrayBuffer());

        await mkdir(OBSCURA_INSTALL_DIR, { recursive: true });
        const tmpTarball = join(OBSCURA_INSTALL_DIR, `${tarball}.downloading`);
        await writeFile(tmpTarball, archive);

        await execFileAsync('tar', ['-xzf', tmpTarball, '-C', OBSCURA_INSTALL_DIR], { timeout: 15_000 });
        await rm(tmpTarball, { force: true });

        await chmod(OBSCURA_INSTALL_PATH, 0o755);
        // ponytail: chmod worker best-effort, may not exist in future releases
        await chmod(join(OBSCURA_INSTALL_DIR, 'obscura-worker'), 0o755).catch(() => {});

        await execFileAsync(OBSCURA_INSTALL_PATH, ['--version'], { timeout: 5_000 });

        _obscuraAvailable = true;
        return OBSCURA_INSTALL_PATH;
    } catch {
        // Clean up partial artifacts
        try {
            await rm(OBSCURA_INSTALL_PATH, { force: true });
            const tmpTarball = join(OBSCURA_INSTALL_DIR, `${tarball}.downloading`);
            await rm(tmpTarball, { force: true });
        } catch { /* best-effort */ }

        _obscuraAvailable = false;
        return null;
    }
}

async function findObscura(path?: string): Promise<string | null> {
    const candidates = path ? [path] : OBSCURA_SEARCH_PATHS;
    for (const candidate of candidates) {
        try {
            await execFileAsync(candidate, ['--version'], { timeout: 5_000 });
            return candidate;
        } catch { continue; }
    }

    // Auto-install if no explicit path was given and not already attempted
    if (!path && !_obscuraInstallAttempted) {
        const installed = await installObscura();
        if (installed) return installed;
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

// --- Jina Reader (r.jina.ai) with 20rpm rate limiting ---

const _jinaTimestamps: number[] = [];

async function jinaAcquireSlot(): Promise<boolean> {
    const now = Date.now();
    // Prune timestamps outside the window
    while (_jinaTimestamps.length > 0 && _jinaTimestamps[0] <= now - JINA_WINDOW_MS) {
        _jinaTimestamps.shift();
    }
    if (_jinaTimestamps.length >= JINA_RPM) return false;
    _jinaTimestamps.push(now);
    return true;
}

async function jinaExtract(
    url: string,
    options: { timeoutMs: number }
): Promise<ExtractedContent | null> {
    if (!await jinaAcquireSlot()) return null;

    try {
        const response = await fetch(`${JINA_READER_BASE}/${url}`, {
            headers: {
                'Accept': 'text/plain',
                'X-Respond-With': 'frontmatter',
            },
            signal: AbortSignal.timeout(options.timeoutMs),
        });

        if (!response.ok) return null;

        const text = await response.text();
        if (!text.trim()) return null;

        // Parse frontmatter: ---\nkey: value\n---\ncontent
        let title = '';
        let content = text.trim();
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (fmMatch) {
            const meta = fmMatch[1];
            content = fmMatch[2].trim();
            const titleMatch = meta.match(/^title:\s*"?(.+?)"?\s*$/m);
            if (titleMatch) title = titleMatch[1];
        }

        if (!content) return null;

        return {
            title,
            content,
            excerpt: '',
            url,
            length: content.length,
            extractedAt: Date.now(),
            method: 'jina',
        };
    } catch { return null; }
}

export class ContentExtractor {
    private timeoutMs: number;
    private concurrency: number;
    private maxResponseBytes: number;
    private useObscura: boolean;
    private obscuraPath?: string;
    private obscuraDumpFormat: 'html' | 'markdown';
    private useJina: boolean;

    constructor(options?: ExtractorOptions) {
        this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;
        this.maxResponseBytes = options?.maxResponseBytes ?? MAX_RESPONSE_BYTES;
        this.useObscura = options?.obscura ?? false;
        this.obscuraPath = options?.obscuraPath;
        this.obscuraDumpFormat = options?.obscuraDumpFormat ?? 'html';
        this.useJina = options?.jina ?? false;
    }

    async extract(url: string): Promise<ExtractedContent> {
        let result: ExtractedContent | null = null;

        try {
            const html = await this.fetchHtml(url);
            result = await defuddleExtract(html, url);
        } catch (error) {
            result = {
                title: '',
                content: '',
                excerpt: '',
                url,
                length: 0,
                extractedAt: Date.now(),
                error: error instanceof Error ? error.message : String(error),
            };
        }

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

        // Obscura insufficient → Jina Reader fallback (also works when fetchHtml itself failed)
        if (this.useJina && result.content.length < MIN_CONTENT_LENGTH) {
            const jinaResult = await jinaExtract(url, { timeoutMs: this.timeoutMs });
            if (jinaResult && jinaResult.content.length > result.content.length) return jinaResult;
        }

        if (result.content.length < MIN_CONTENT_LENGTH && !result.error) {
            result.error = 'Extracted content too short';
        }
        return result;
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
