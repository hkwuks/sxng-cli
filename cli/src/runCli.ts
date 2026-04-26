/**
 * SearXNG CLI - CLI Runner
 */

import { SearXNGService, SearchOptions, SearchResult, SearchResponse } from './service.js';
import { createSuccessEnvelope, createErrorEnvelope } from './protocol.js';
import { config } from './config.js';
import { initConfig } from './init.js';
import { runExtract, ExtractOptions } from './commands/extract.js';
import { runQueryGraph, QueryGraphOptions } from './commands/query-graph.js';
import { runGraphAdd, GraphAddOptions } from './commands/graph-add.js';
import { ContentExtractor } from './deep/extractor.js';
import { rrf } from './deep/rrf.js';
import { normalizeUrl } from './deep/dedupe.js';
import { deserializeGraph, serializeGraph, graphStats, resultId, GraphNodeAttrs, GraphEdgeAttrs } from './deep/graph.js';
import { initSessionDir, resolveSessionPath, appendSessionResults, updateSessionGraph, loadSessionResults } from './deep/session.js';
import { runSessionList, runSessionDelete, getDefaultSessionRoot } from './commands/session.js';
import { DirectedGraph } from 'graphology';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const HELP_TEXT = `SearXNG CLI - Web Search Tool

Usage:
  sxng <query> [options]             Single search
  sxng --queries "q1,q2,q3"          Multi-query search (RRF fusion)
  sxng --session new <query>         Create new session and search (auto-named)
  sxng --session <dir> <query>       Multi-round session with result accumulation
  sxng extract --urls/--from-json    Extract article content
  sxng extract --session <dir>       Extract content from session and merge back
  sxng query-graph <path> --seeds    Query subgraph via BFS
  sxng graph-add <path> --data       Add entities/edges to knowledge graph
  sxng session-list                  List all sessions
  sxng session-delete <names>        Delete sessions by name
  sxng session-delete --older <h>    Delete sessions older than N hours
  sxng init                          Interactive configuration setup
  sxng --health                      Check SearXNG server health

Search Options:
  -e, --engines <engines>      Comma-separated list of search engines
  -c, --categories <cats>      Comma-separated list of categories
  -l, --limit <n>              Maximum number of results (default: ${config.defaultLimit})
  -p, --page <n>               Page number for pagination
  --lang <code>                Language code (e.g., en, zh, ja)
  --time <range>               Time range: day, week, month, year, all
  -f, --format <fmt>           Output format: md (default), json
  --queries <q1,q2,q3>        Multi-query with RRF fusion
  --merge <file>               Merge new results with previous search JSON
  --session <dir|new>          Session dir, or "new" to auto-create
  --owner <name>               Session owner (stored in meta.json)
  --desc <text>                Session description (stored in meta.json)
  --graph <file>               Save search result metadata to knowledge graph file

Extract Options:
  --urls <url1,url2>           URLs to extract content from
  --from-json <file>           Extract from search results JSON file
  --session <dir>              Extract from session results and merge content back

Graph Options:
  --seeds <s1,s2>              Seed nodes for query-graph BFS
  --depth <n>                  BFS depth for query-graph (default: 2)
  --data <json>                JSON with entities/edges for graph-add

Examples:
  sxng "TypeScript tutorial"
  sxng --session new "rust async" --owner "agent-1" --desc "async ecosystem research"
  sxng --session /tmp/s "rust async"
  sxng extract --session /tmp/s
  sxng session-list
  sxng session-delete ds_1745000000_abcd123
  sxng session-delete --older 24

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
    extract: boolean;
    queryGraph: boolean;
    graphAdd: boolean;
    sessionList: boolean;
    sessionDelete: boolean;
    engines?: string[];
    categories?: string[];
    limit?: number;
    page?: number;
    language?: string;
    timeRange?: 'day' | 'week' | 'month' | 'year' | 'all';
    format?: 'json' | 'md';
    init: boolean;
    enginesList: boolean;
    categoriesList: boolean;
    health: boolean;
    help: boolean;
    queries?: string[];
    urls?: string[];
    fromJson?: string;
    merge?: string;
    graph?: string;
    session?: string;
    seeds?: string[];
    depth?: number;
    data?: string;
    owner?: string;
    desc?: string;
    older?: number;
}

function parseArgs(args: string[]): CliOptions {
    const options: CliOptions = {
        init: false,
        extract: false,
        queryGraph: false,
        graphAdd: false,
        sessionList: false,
        sessionDelete: false,
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
            case 'extract':
                options.extract = true;
                break;
            case 'query-graph':
                options.queryGraph = true;
                break;
            case 'graph-add':
                options.graphAdd = true;
                break;
            case 'session-list':
                options.sessionList = true;
                break;
            case 'session-delete':
                options.sessionDelete = true;
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
                if (fmt === 'json' || fmt === 'md' || fmt === 'markdown') {
                    options.format = fmt === 'markdown' ? 'md' : fmt;
                }
                break;
            case '--queries':
                options.queries = args[++i]?.split(',').map(q => q.trim()).filter(Boolean);
                break;
            case '--urls':
                options.urls = args[++i]?.split(',').map(u => u.trim()).filter(Boolean);
                break;
            case '--from-json':
                options.fromJson = args[++i];
                break;
            case '--merge':
                options.merge = args[++i];
                break;
            case '--graph':
                options.graph = args[++i];
                break;
            case '--session':
                options.session = args[++i];
                break;
            case '--seeds':
                options.seeds = args[++i]?.split(',').map(s => s.trim()).filter(Boolean);
                break;
            case '--depth':
                options.depth = parseInt(args[++i], 10);
                break;
            case '--data':
                options.data = args[++i];
                break;
            case '--owner':
                options.owner = args[++i];
                break;
            case '--desc':
                options.desc = args[++i];
                break;
            case '--older':
                options.older = parseFloat(args[++i]);
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

function formatAsMarkdown(data: any): string {
    const lines: string[] = [];

    // Query info
    lines.push(`## Search: ${data.query || 'Unknown'}`);
    lines.push('');

    // Results
    const results = data.results || [];
    if (results.length > 0) {
        lines.push(`**${results.length}** results`);
        lines.push('');

        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            let scoreIndicator = '';
            if (r.score !== undefined && r.score !== null) {
                const normalizedScore = r.score > 1 ? r.score : r.score * 100;
                scoreIndicator = ` [${normalizedScore.toFixed(1)}]`;
            }
            lines.push(`### ${i + 1}. [${r.title || 'No Title'}](${r.url || '#'})${scoreIndicator}`);
            lines.push('');

            if (r.content) {
                lines.push(r.content);
                lines.push('');
            }

            const meta: string[] = [];
            meta.push(`Engine: ${r.engine || 'unknown'}`);
            if (r.category) meta.push(`Category: ${r.category}`);
            if (r.publishedDate) meta.push(`Published: ${r.publishedDate}`);
            lines.push(meta.join(' · '));
            lines.push('');
        }
    } else {
        lines.push('No results found.');
        lines.push('');
    }

    // Unresponsive engines
    if (data.unresponsiveEngines && data.unresponsiveEngines.length > 0) {
        const unresponsive = data.unresponsiveEngines.map((item: any) =>
            Array.isArray(item) ? item[0] : item
        ).join(', ');
        lines.push(`*Unresponsive: ${unresponsive}*`);
        lines.push('');
    }

    // Suggestions
    if (data.suggestions && data.suggestions.length > 0) {
        lines.push('**Suggestions:** ' + data.suggestions.join(' · '));
        lines.push('');
    }

    return lines.join('\n');
}

function formatOutput(data: any, format: 'json' | 'md'): string {
    if (format === 'md') return formatAsMarkdown(data);
    return JSON.stringify(data, null, 2);
}

function addToGraph(graphFile: string, results: SearchResult[]): void {
    // Load existing graph or create new one
    let graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>;
    if (existsSync(graphFile)) {
        try {
            const raw = readFileSync(graphFile, 'utf-8');
            const parsed = JSON.parse(raw);
            const graphData = parsed.status === 'ok' && parsed.data?.graph
                ? parsed.data.graph
                : (parsed.nodes && parsed.edges ? parsed : null);
            if (graphData) {
                graph = deserializeGraph(graphData);
            } else {
                graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            }
        } catch {
            graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
        }
    } else {
        graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
    }

    // Save result metadata nodes (title, url, rank) into the graph
    // Entity nodes and relationships are added by Agent via graph-add
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const id = resultId(r.url);
        if (!graph.hasNode(id)) {
            graph.mergeNode(id, {
                type: 'result',
                label: r.title,
                url: r.url,
                title: r.title,
                rank: i + 1,
            });
        }
    }

    const serialized = serializeGraph(graph);
    const stats = graphStats(graph);
    writeFileSync(graphFile, JSON.stringify({ status: 'ok', data: { graph: serialized, stats } }, null, 2), 'utf-8');
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

    if (options.extract) {
        const extractor = new ContentExtractor();
        const extractOptions: ExtractOptions = {
            urls: options.urls,
            fromJson: options.fromJson,
            session: options.session,
        };
        return await runExtract(extractor, extractOptions);
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

    if (options.queryGraph) {
        const { runQueryGraph } = await import('./commands/query-graph.js');
        const graphFormat = options.format === 'json' ? 'json' : 'md';
        return await runQueryGraph({
            graphFile: options.query || options.fromJson || '',
            seeds: options.seeds || [],
            depth: options.depth ?? 2,
            format: graphFormat,
        });
    }

    if (options.graphAdd) {
        const { runGraphAdd } = await import('./commands/graph-add.js');
        return await runGraphAdd({
            graphFile: options.query || options.fromJson || '',
            data: options.data || '',
        });
    }

    if (options.sessionList) {
        return await runSessionList();
    }

    if (options.sessionDelete) {
        const names = (options.query || '').split(',').map(n => n.trim()).filter(Boolean);
        return await runSessionDelete(names, options.older);
    }

    if (!options.query && !options.queries) {
        const envelope = createErrorEnvelope(
            'MISSING_QUERY',
            'No search query provided',
            { hint: 'Use: sxng "your search query" or sxng --queries "q1,q2,q3"' }
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

    const queries = options.queries || (options.query ? [options.query] : []);
    const limit = options.limit ?? config.defaultLimit;

    // Initialize session directory if --session specified
    if (options.session) {
        const resolved = resolveSessionPath(options.session);
        options.session = resolved;
        initSessionDir(resolved, options.owner, options.desc, options.query);
    }

    try {
        // Single query: use SearXNG directly (it already aggregates/sorts)
        if (queries.length === 1 && !options.merge) {
            const searchOptions: SearchOptions = {
                query: queries[0],
                engines: options.engines,
                categories: options.categories,
                limit,
                page: options.page,
                language: options.language,
                timeRange: options.timeRange,
            };
            const results = await service.search(searchOptions);

            // Session: accumulate results and update graph
            let sessionInfo: { added: number; total: number } | null = null;
            if (options.session) {
                sessionInfo = appendSessionResults(options.session, results.results as any[]);
                for (const query of queries) {
                    updateSessionGraph(options.session, query, results.results.map(r => ({
                        url: r.url,
                        title: r.title,
                    })));
                }
            }

            const outputFormat = options.format || config.defaultFormat;

            // When session active, RRF-merge with all accumulated results for display
            let displayResults = results.results;
            if (options.session) {
                const allSessionResults = loadSessionResults(options.session);
                const rankings = [
                    results.results.map(r => ({ id: normalizeUrl(r.url), ...r })),
                    allSessionResults.map(r => ({ id: normalizeUrl(r.url), ...r })),
                ];
                const fused = rrf(rankings);
                const urlMap = new Map<string, SearchResult>();
                for (const r of results.results) urlMap.set(normalizeUrl(r.url), r);
                for (const r of allSessionResults) urlMap.set(normalizeUrl(r.url), r as SearchResult);
                displayResults = fused
                    .map(item => {
                        const original = urlMap.get(item.id);
                        return original ? { ...original, score: item.score } : null;
                    })
                    .filter(Boolean) as SearchResult[];
                if (limit > 0) displayResults = displayResults.slice(0, limit);
            }

            const displayData = {
                query: results.query,
                totalResults: results.numberOfResults,
                results: displayResults,
                answers: results.answers,
                suggestions: results.suggestions,
                unresponsiveEngines: results.unresponsiveEngines,
                ...(sessionInfo ? { session: { dir: options.session, added: sessionInfo.added, total: sessionInfo.total } } : {}),
            };

            if (outputFormat === 'md') {
                console.log(formatOutput(displayData, 'md'));
            } else {
                console.log(JSON.stringify(createSuccessEnvelope({
                    ...displayData,
                    returnedResults: displayResults.length,
                }), null, 2));
            }

            // Auto-insert result metadata into knowledge graph if --graph specified
            if (options.graph) {
                addToGraph(options.graph, results.results);
            }

            return 0;
        }

        // Multi-query or --merge: RRF fusion across ranked lists
        const allResponses: SearchResponse[] = [];
        for (const query of queries) {
            const searchOptions: SearchOptions = {
                query,
                engines: options.engines,
                categories: options.categories,
                limit,
                page: options.page,
                language: options.language,
                timeRange: options.timeRange,
            };
            const response = await service.search(searchOptions);
            allResponses.push(response);
        }

        // Build rankings for RRF: each query's results as a separate ranked list
        let rankings = allResponses.map(resp =>
            resp.results.map((r: SearchResult) => ({ id: normalizeUrl(r.url), ...r }))
        );

        // If --merge, load historical results and add as another ranking
        let mergeData: any = null;
        if (options.merge) {
            try {
                const raw = readFileSync(options.merge, 'utf-8');
                mergeData = JSON.parse(raw);
                let mergeResults = mergeData;
                if (mergeData.status === 'ok' && mergeData.data) {
                    mergeResults = mergeData.data;
                }
                const historicalResults = (mergeResults.results || []);
                if (historicalResults.length > 0) {
                    rankings.push(
                        historicalResults.map((r: any) => ({ id: normalizeUrl(r.url), ...r }))
                    );
                }
            } catch (error) {
                const envelope = createErrorEnvelope(
                    'MERGE_FILE_FAILED',
                    `Failed to read merge file: ${options.merge}`,
                    { hint: 'Ensure the file exists and contains valid search results JSON' }
                );
                console.log(JSON.stringify(envelope, null, 2));
                return 1;
            }
        }

        // RRF fusion
        const rrfFused = rrf(rankings);

        // Map RRF scores back to original results
        const allResults: SearchResult[] = [];
        const allSuggestions: string[] = [];
        const allAnswers: string[] = [];
        const allUnresponsive: string[] = [];

        for (const resp of allResponses) {
            allResults.push(...resp.results);
            for (const s of resp.suggestions) {
                if (!allSuggestions.includes(s)) allSuggestions.push(s);
            }
            for (const a of resp.answers) {
                if (!allAnswers.includes(a)) allAnswers.push(a);
            }
            for (const u of resp.unresponsiveEngines) {
                const name = Array.isArray(u) ? u[0] : u;
                if (!allUnresponsive.includes(name)) allUnresponsive.push(name);
            }
        }

        // Include historical results in the URL map if merging
        if (mergeData) {
            let mergeResults = mergeData;
            if (mergeData.status === 'ok' && mergeData.data) {
                mergeResults = mergeData.data;
            }
            const historical = mergeResults.results || [];
            allResults.push(...historical);
            if (mergeResults.suggestions) {
                for (const s of mergeResults.suggestions) {
                    if (!allSuggestions.includes(s)) allSuggestions.push(s);
                }
            }
            if (mergeResults.answers) {
                for (const a of mergeResults.answers) {
                    if (!allAnswers.includes(a)) allAnswers.push(a);
                }
            }
        }

        // Dedup by URL to get unique results, then apply RRF order
        const urlMap = new Map<string, SearchResult>();
        for (const r of allResults) {
            const norm = normalizeUrl(r.url);
            if (!urlMap.has(norm)) urlMap.set(norm, r);
        }

        let fusedResults = rrfFused
            .map((item: { id: string; score: number }) => {
                const original = urlMap.get(item.id);
                if (!original) return null;
                return { ...original, score: item.score };
            })
            .filter(Boolean) as SearchResult[];

        if (limit > 0) {
            fusedResults = fusedResults.slice(0, limit);
        }

        // Session: accumulate results and update graph
        let sessionInfo: { added: number; total: number } | null = null;
        if (options.session) {
            sessionInfo = appendSessionResults(options.session, fusedResults as any[]);
            for (const query of queries) {
                updateSessionGraph(options.session, query, fusedResults.map(r => ({
                    url: r.url,
                    title: r.title,
                })));
            }
        }

        const displayQuery = queries.length > 1 ? queries.join(' · ') : queries[0];
        const outputFormat = options.format || config.defaultFormat;

        const displayData = {
            query: displayQuery,
            queries,
            totalResults: allResults.length,
            results: fusedResults,
            answers: allAnswers,
            suggestions: allSuggestions,
            unresponsiveEngines: allUnresponsive,
            ...(sessionInfo ? { session: { dir: options.session, added: sessionInfo.added, total: sessionInfo.total } } : {}),
        };

        if (outputFormat === 'md') {
            console.log(formatOutput(displayData, 'md'));
        } else if (outputFormat === 'json') {
            console.log(JSON.stringify(createSuccessEnvelope({
                ...displayData,
                returnedResults: fusedResults.length,
            }), null, 2));
        } else {
            console.log(formatOutput(displayData, outputFormat));
        }

        // Auto-insert result metadata into knowledge graph if --graph specified
        if (options.graph) {
            addToGraph(options.graph, fusedResults);
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
