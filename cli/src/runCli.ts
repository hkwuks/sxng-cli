/**
 * SearXNG CLI - CLI Runner
 */

import { SearXNGService, SearchOptions } from './service.js';
import { createSuccessEnvelope, createErrorEnvelope } from './protocol.js';
import { config } from './config.js';
import { initConfig } from './init.js';

const HELP_TEXT = `SearXNG CLI - Web Search Tool

Usage:
  sxng <query> [options]
  sxng init
  sxng --engines <engine1,engine2> <query>
  sxng --categories <category> <query>
  sxng --health

Commands:
  init                         Interactive configuration setup
  <query>                      Perform a web search with the given query

Options:
  -e, --engines <engines>      Comma-separated list of search engines
  -c, --categories <cats>      Comma-separated list of categories
  -l, --limit <n>              Maximum number of results (default: ${config.defaultLimit})
  -p, --page <n>               Page number for pagination
  --lang <code>                Language code (e.g., en, zh, ja)
  --time <range>               Time range: day, week, month, year, all
  -f, --format <fmt>           Output format: md, json, csv, html (default: md)
  --engines-list               List available search engines
  --categories-list            List available categories
  --health                     Check SearXNG server health
  -h, --help                   Show this help message

Examples:
  sxng init
  sxng "TypeScript tutorial"
  sxng --engines google,github "react hooks"
  sxng --categories it,science "machine learning"
  sxng --limit 5 --time week "latest news"

Environment Variables:
  SEARXNG_BASE_URL             SearXNG server URL
  SEARXNG_DEFAULT_ENGINE       Default search engine
  SEARXNG_ALLOWED_ENGINES      Comma-separated allowed engines
  SEARXNG_DEFAULT_LIMIT        Default result limit
  SEARXNG_USE_PROXY            Use proxy (true/false)
  SEARXNG_PROXY_URL            Proxy URL
  SEARXNG_TIMEOUT              Request timeout in ms
`;

interface CliOptions {
    query?: string;
    engines?: string[];
    categories?: string[];
    limit?: number;
    page?: number;
    language?: string;
    timeRange?: 'day' | 'week' | 'month' | 'year' | 'all';
    format?: 'json' | 'csv' | 'html' | 'md';
    init: boolean;
    enginesList: boolean;
    categoriesList: boolean;
    health: boolean;
    help: boolean;
}

function parseArgs(args: string[]): CliOptions {
    const options: CliOptions = {
        init: false,
        enginesList: false,
        categoriesList: false,
        health: false,
        help: false
    };

    const positional: string[] = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        switch (arg) {
            case '-h':
            case '--help':
                options.help = true;
                break;
            case 'init':
                options.init = true;
                break;
            case '-e':
            case '--engines':
                options.engines = args[++i]?.split(',').map(e => e.trim()).filter(Boolean);
                break;
            case '-c':
            case '--categories':
                options.categories = args[++i]?.split(',').map(c => c.trim()).filter(Boolean);
                break;
            case '-l':
            case '--limit':
                options.limit = parseInt(args[++i], 10);
                break;
            case '-p':
            case '--page':
                options.page = parseInt(args[++i], 10);
                break;
            case '--lang':
                options.language = args[++i];
                break;
            case '--time':
                const timeVal = args[++i];
                if (['day', 'week', 'month', 'year', 'all'].includes(timeVal)) {
                    options.timeRange = timeVal as any;
                }
                break;
            case '-f':
            case '--format':
                const fmt = args[++i];
                if (['json', 'csv', 'html', 'md', 'markdown'].includes(fmt)) {
                    options.format = fmt === 'markdown' ? 'md' : (fmt as any);
                }
                break;
            case '--engines-list':
                options.enginesList = true;
                break;
            case '--categories-list':
                options.categoriesList = true;
                break;
            case '--health':
                options.health = true;
                break;
            default:
                if (!arg.startsWith('-')) {
                    positional.push(arg);
                }
                break;
        }
    }

    if (positional.length > 0) {
        options.query = positional.join(' ');
    }

    return options;
}

function formatAsCsv(results: any[]): string {
    if (results.length === 0) return '';

    const headers = ['title', 'url', 'content', 'engine', 'category'];
    const lines = [headers.join(',')];

    for (const r of results) {
        const row = headers.map(h => {
            const val = String(r[h] || '').replace(/"/g, '""');
            return `"${val}"`;
        });
        lines.push(row.join(','));
    }

    return lines.join('\n');
}

function formatAsHtml(results: any[]): string {
    const rows = results.map(r => `
        <tr>
            <td><a href="${r.url}">${r.title}</a></td>
            <td>${r.content}</td>
            <td>${r.engine}</td>
        </tr>
    `).join('');

    return `<!DOCTYPE html>
<html>
<head><title>Search Results</title></head>
<body>
<table border="1">
    <tr><th>Title</th><th>Content</th><th>Engine</th></tr>
    ${rows}
</table>
</body>
</html>`;
}

function formatAsMarkdown(data: any): string {
    const lines: string[] = [];

    // Query info
    lines.push(`## Search: ${data.query || 'Unknown'}`);
    lines.push('');

    // Results
    const results = data.results || [];
    if (results.length > 0) {
        lines.push(`**${results.length}** results`);
        if (data.totalResults) {
            lines.push(`Total: ${data.totalResults}`);
        }
        lines.push('');

        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            lines.push(`### ${i + 1}. [${r.title || 'No Title'}](${r.url || '#'})`);
            lines.push('');
            if (r.content) {
                lines.push(r.content);
                lines.push('');
            }
            // Metadata line: engine, category, score, publishedDate
            const meta: string[] = [];
            meta.push(`Engine: ${r.engine || 'unknown'}`);
            if (r.category) meta.push(`Category: ${r.category}`);
            if (r.score !== undefined && r.score !== null) meta.push(`Score: ${r.score}`);
            if (r.publishedDate) meta.push(`Date: ${r.publishedDate}`);
            lines.push(meta.join(' | '));
            if (r.thumbnail) {
                lines.push(`Thumbnail: ${r.thumbnail}`);
            }
            lines.push('');
        }
    } else {
        lines.push('No results found.');
        lines.push('');
    }

    // Unresponsive engines
    if (data.unresponsiveEngines && data.unresponsiveEngines.length > 0) {
        lines.push('---');
        lines.push('');
        lines.push('### Unresponsive Engines');
        lines.push('');
        for (const item of data.unresponsiveEngines) {
            if (Array.isArray(item)) {
                lines.push(`- ${item[0]}: ${item[1] || 'unknown error'}`);
            } else {
                lines.push(`- ${item}`);
            }
        }
        lines.push('');
    }

    // Answers (if any)
    if (data.answers && data.answers.length > 0) {
        lines.push('---');
        lines.push('');
        lines.push('### Answers');
        lines.push('');
        for (const answer of data.answers) {
            lines.push(answer);
            lines.push('');
        }
    }

    // Suggestions (if any)
    if (data.suggestions && data.suggestions.length > 0) {
        lines.push('---');
        lines.push('');
        lines.push('### Suggestions');
        lines.push('');
        lines.push(data.suggestions.map((s: string) => `- ${s}`).join('\n'));
        lines.push('');
    }

    return lines.join('\n');
}

function formatOutput(data: any, format: 'json' | 'csv' | 'html' | 'md'): string {
    switch (format) {
        case 'csv':
            return formatAsCsv(data.results || []);
        case 'html':
            return formatAsHtml(data.results || []);
        case 'md':
            return formatAsMarkdown(data);
        case 'json':
        default:
            return JSON.stringify(data, null, 2);
    }
}

export async function runCli(args: string[], service: SearXNGService): Promise<number | null> {
    const options = parseArgs(args);

    if (options.help) {
        console.log(HELP_TEXT);
        return 0;
    }

    if (options.init) {
        return await initConfig();
    }

    if (options.health) {
        const health = await service.healthCheck();
        const envelope = health.status === 'healthy'
            ? createSuccessEnvelope(health)
            : createErrorEnvelope(
                'HEALTH_CHECK_FAILED',
                health.error || 'SearXNG server is not responding',
                { hint: `Check if SearXNG is running at ${config.baseUrl}` }
            );
        console.log(JSON.stringify(envelope, null, 2));
        return health.status === 'healthy' ? 0 : 1;
    }

    if (options.enginesList) {
        try {
            const engines = await service.getEngines();
            if (engines.length === 0) {
                const envelope = createErrorEnvelope(
                    'ENGINES_FETCH_EMPTY',
                    'No engines returned from SearXNG server',
                    { hint: 'Check if SearXNG server is properly configured' }
                );
                console.log(JSON.stringify(envelope, null, 2));
                return 1;
            }
            const envelope = createSuccessEnvelope({
                engines,
                source: 'server'
            });
            console.log(JSON.stringify(envelope, null, 2));
            return 0;
        } catch (error) {
            const envelope = createErrorEnvelope(
                'ENGINES_FETCH_FAILED',
                error instanceof Error ? error.message : 'Failed to fetch engines',
                { hint: 'Check your network connection and SearXNG server status' }
            );
            console.log(JSON.stringify(envelope, null, 2));
            return 1;
        }
    }

    if (options.categoriesList) {
        try {
            const categories = await service.getCategories();
            if (categories.length === 0) {
                const envelope = createErrorEnvelope(
                    'CATEGORIES_FETCH_EMPTY',
                    'No categories returned from SearXNG server',
                    { hint: 'Check if SearXNG server is properly configured' }
                );
                console.log(JSON.stringify(envelope, null, 2));
                return 1;
            }
            const envelope = createSuccessEnvelope({
                categories,
                source: 'server'
            });
            console.log(JSON.stringify(envelope, null, 2));
            return 0;
        } catch (error) {
            const envelope = createErrorEnvelope(
                'CATEGORIES_FETCH_FAILED',
                error instanceof Error ? error.message : 'Failed to fetch categories',
                { hint: 'Check your network connection and SearXNG server status' }
            );
            console.log(JSON.stringify(envelope, null, 2));
            return 1;
        }
    }

    if (!options.query) {
        const envelope = createErrorEnvelope(
            'MISSING_QUERY',
            'No search query provided',
            { hint: 'Use: sxng "your search query"' }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    if (options.engines && config.allowedEngines.length > 0) {
        const invalid = options.engines.filter(e => !config.allowedEngines.includes(e));
        if (invalid.length > 0) {
            const envelope = createErrorEnvelope(
                'INVALID_ENGINES',
                `Engines not allowed: ${invalid.join(', ')}`,
                { hint: `Allowed engines: ${config.allowedEngines.join(', ')}` }
            );
            console.log(JSON.stringify(envelope, null, 2));
            return 1;
        }
    }

    const searchOptions: SearchOptions = {
        query: options.query,
        engines: options.engines,
        categories: options.categories,
        limit: options.limit ?? config.defaultLimit,
        page: options.page,
        language: options.language,
        timeRange: options.timeRange,
        format: options.format || config.defaultFormat
    };

    try {
        const results = await service.search(searchOptions);

        const envelope = createSuccessEnvelope({
            query: results.query,
            totalResults: results.numberOfResults,
            returnedResults: results.results.length,
            results: results.results,
            suggestions: results.suggestions,
            answers: results.answers,
            unresponsiveEngines: results.unresponsiveEngines
        });

        const outputFormat = options.format || config.defaultFormat;

        if (outputFormat === 'md') {
            // Markdown format: output clean markdown directly
            console.log(formatOutput({
                query: results.query,
                totalResults: results.numberOfResults,
                results: results.results,
                answers: results.answers,
                suggestions: results.suggestions,
                unresponsiveEngines: results.unresponsiveEngines
            }, 'md'));
        } else if (outputFormat === 'json') {
            console.log(JSON.stringify(envelope, null, 2));
        } else {
            // csv or html
            console.log(formatOutput(results, outputFormat));
        }

        return 0;
    } catch (error) {
        const envelope = createErrorEnvelope(
            'SEARCH_FAILED',
            error instanceof Error ? error.message : 'Search request failed',
            {
                retryable: true,
                hint: 'Check your network connection and SearXNG server status'
            }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }
}
