/**
 * graph-obfuscate subcommand - List obfuscation candidates or apply fallback rules
 *
 * Primary flow: Agent uses --list to get candidates, then LLM generates
 * obfuscated labels, and writes them back via graph-add.
 *
 * Fallback: --fallback-rules applies simple rule-based obfuscation (experimental).
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { deserializeGraph, serializeGraph, graphStats, GraphNodeAttrs, GraphEdgeAttrs } from '../deep/graph.js';
import { runGraphObfuscate, ObfuscationConfig, ObfuscationResult } from '../deep/graph-obfuscate.js';
import { DirectedGraph } from 'graphology';
import { createSuccessEnvelope, createErrorEnvelope } from '../protocol.js';
import { getDefaultSessionRoot } from './session.js';

function resolveGraphFile(path: string): string {
    if (!path.includes('/') && !path.includes('\\')) {
        path = join(getDefaultSessionRoot(), path);
    }
    try {
        if (statSync(path).isDirectory()) {
            return join(path, 'graph.json');
        }
    } catch {
        // Not a file/dir, return as-is
    }
    return path;
}

function loadGraph(graphFile: string): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> | null {
    if (!existsSync(graphFile)) {
        return null;
    }
    try {
        const raw = readFileSync(graphFile, 'utf-8');
        const parsed = JSON.parse(raw);
        const graphData = parsed.status === 'ok' && parsed.data?.graph
            ? parsed.data.graph
            : (parsed.nodes && parsed.edges ? parsed : null);
        return graphData ? deserializeGraph(graphData) : null;
    } catch {
        return null;
    }
}

function saveGraph(graphFile: string, graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>): void {
    const serialized = serializeGraph(graph);
    const stats = graphStats(graph);
    writeFileSync(
        graphFile,
        JSON.stringify({ status: 'ok', data: { graph: serialized, stats } }, null, 2),
        'utf-8'
    );
}

function formatAsMarkdown(result: ObfuscationResult): string {
    const lines: string[] = [];
    lines.push('## Entity Obfuscation');
    lines.push('');
    lines.push(`**Mode:** ${result.mode}`);
    lines.push(`**Total entities:** ${result.stats.totalEntities}`);
    lines.push(`**Already obfuscated:** ${result.stats.alreadyObfuscated}`);
    lines.push(`**Need obfuscation:** ${result.stats.needObfuscation}`);
    lines.push('');

    if (result.mode === 'list') {
        lines.push('### Candidates');
        lines.push('');
        for (const c of result.candidates) {
            const status = c.hasObfuscatedLabel
                ? `✓ ${c.obfuscatedLabel}`
                : '✗ needs obfuscation';
            lines.push(`- **${c.label}** (${c.entityType ?? 'unknown'}): ${status}`);
        }
        lines.push('');
    }

    if (result.mode === 'fallback_rules' && result.fallbackResults) {
        lines.push('### Fallback Rules Applied ⚠️ *experimental*');
        lines.push('');
        lines.push('| Original | Obfuscated | Rule |');
        lines.push('|----------|------------|------|');
        for (const r of result.fallbackResults) {
            lines.push(`| ${r.original} | ${r.obfuscated} | ${r.rule} |`);
        }
        lines.push('');
        lines.push('*Fallback rules are experimental — they preserve too many identifying cues for true obfuscation.*');
        lines.push('');
    }

    return lines.join('\n');
}

export interface GraphObfuscateOptions {
    graphFile: string;
    list: boolean;
    fallbackRules: boolean;
    format: 'json' | 'md';
    skipEntityTypes?: string[];
}

export async function runGraphObfuscateCommand(options: GraphObfuscateOptions): Promise<number> {
    const graphFile = resolveGraphFile(options.graphFile);

    const graph = loadGraph(graphFile);
    if (!graph) {
        const envelope = createErrorEnvelope(
            'GRAPH_LOAD_FAILED',
            `Failed to load graph from: ${graphFile}`,
            { hint: 'Ensure the file exists and contains a valid graphology graph' }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    const mode: 'list' | 'fallback_rules' = options.fallbackRules ? 'fallback_rules' : 'list';
    const config: ObfuscationConfig = {
        mode,
        skipEntityTypes: options.skipEntityTypes,
    };

    const result = runGraphObfuscate(graph, config);

    // Save graph if fallback rules were applied (they mutate the graph)
    if (mode === 'fallback_rules' && result.fallbackResults && result.fallbackResults.length > 0) {
        saveGraph(graphFile, graph);
    }

    if (options.format === 'md') {
        console.log(formatAsMarkdown(result));
    } else {
        console.log(JSON.stringify(createSuccessEnvelope(result), null, 2));
    }

    return 0;
}
