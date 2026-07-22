/**
 * Threshold calibration script for quality assessment.
 *
 * Generates simulated sessions with varying characteristics,
 * computes quality metric distributions, and recommends thresholds.
 *
 * Run: npx tsx test/calibrate-thresholds.ts
 */

import { assessResultQuality } from '../src/deep/quality-assess.js';
import { createGraph, entityId, GraphNodeAttrs, GraphEdgeAttrs } from '../src/deep/graph.js';
import { SessionResult } from '../src/deep/session.js';
import { DirectedGraph } from 'graphology';

// ── Session simulation ──────────────────────────────────────────────

interface SimulatedSession {
    name: string;
    results: SessionResult[];
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>;
    expectedQuality: 'good' | 'acceptable' | 'poor';
}

function randomDomain(): string {
    const domains = [
        'github.com', 'stackoverflow.com', 'docs.rs', 'blog.rust-lang.org',
        'tokio.rs', 'async.rs', 'reddit.com', 'medium.com',
        'crates.io', 'doc.rust-lang.org', 'example.com', 'test.org',
        'wikipedia.org', 'arxiv.org', 'news.ycombinator.com',
    ];
    return domains[Math.floor(Math.random() * domains.length)];
}

function randomTitle(): string {
    const titles = [
        'Rust Async Programming Guide',
        'Introduction to Tokio Runtime',
        'Async-std vs Tokio Comparison',
        'Building Web Servers with Axum',
        'Understanding Futures in Rust',
        'Tokio Tutorial for Beginners',
        'Rust Concurrency Patterns',
        'Async Rust Ecosystem Overview',
        'Hyper HTTP Library Documentation',
        'Serde Serialization in Rust',
        'Clap Command Line Arguments',
        'Tracing and Logging in Rust',
        'Error Handling with Anyhow',
        'Rust Web Frameworks Comparison',
        'Async Streams and Iterators',
    ];
    return titles[Math.floor(Math.random() * titles.length)];
}

function generateResults(count: number, hasContent: boolean, contentLength: number): SessionResult[] {
    const results: SessionResult[] = [];
    for (let i = 0; i < count; i++) {
        const title = randomTitle();
        const content = hasContent
            ? `${title}. This is a detailed article about ${title.toLowerCase()}. `.repeat(Math.max(1, Math.floor(contentLength / 50)))
            : undefined;
        results.push({
            url: `https://${randomDomain()}/article-${i}`,
            title,
            content,
            engine: ['google', 'bing', 'duckduckgo'][Math.floor(Math.random() * 3)],
            category: 'it',
            score: Math.random() * 100,
        });
    }
    return results;
}

function generateGraph(entityCount: number): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    const graph = createGraph();
    for (let i = 0; i < entityCount; i++) {
        graph.mergeNode(entityId(`entity_${i}`), {
            type: 'entity',
            label: `entity_${i}`,
            entityType: 'concept',
            score: Math.random(),
            frequency: Math.floor(Math.random() * 10) + 1,
        });
    }
    // Add some edges
    for (let i = 0; i < entityCount - 1; i++) {
        if (Math.random() > 0.5) {
            graph.addEdge(entityId(`entity_${i}`), entityId(`entity_${i + 1}`), {
                relation: 'co_occurs_with',
                weight: Math.random(),
            });
        }
    }
    return graph;
}

// ── Session scenarios ───────────────────────────────────────────────

function createSessions(): SimulatedSession[] {
    const sessions: SimulatedSession[] = [];

    // Good sessions: many results, deep content, diverse sources, many entities
    for (let i = 0; i < 3; i++) {
        sessions.push({
            name: `good-${i + 1}`,
            results: generateResults(20 + Math.floor(Math.random() * 10), true, 500),
            graph: generateGraph(10 + Math.floor(Math.random() * 5)),
            expectedQuality: 'good',
        });
    }

    // Acceptable sessions: medium results, some content, moderate diversity
    for (let i = 0; i < 3; i++) {
        sessions.push({
            name: `acceptable-${i + 1}`,
            results: generateResults(5 + Math.floor(Math.random() * 3), Math.random() > 0.3, 150),
            graph: generateGraph(2 + Math.floor(Math.random() * 2)),
            expectedQuality: 'acceptable',
        });
    }

    // Poor sessions: few results, shallow/no content, few sources, few entities
    for (let i = 0; i < 4; i++) {
        sessions.push({
            name: `poor-${i + 1}`,
            results: generateResults(2 + Math.floor(Math.random() * 4), Math.random() > 0.7, 50),
            graph: generateGraph(1 + Math.floor(Math.random() * 2)),
            expectedQuality: 'poor',
        });
    }

    return sessions;
}

// ── Analysis ──────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
}

function analyzeSessions(sessions: SimulatedSession[]) {
    const metrics = {
        resultCount: [] as number[],
        contentDepth: [] as number[],
        entityRichness: [] as number[],
        sourceDiversity: [] as number[],
        novelty: [] as number[],
    };

    const qualityResults: Array<{ name: string; expected: string; actual: string; breakdown: any }> = [];

    for (const session of sessions) {
        const quality = assessResultQuality(session.results, [], session.graph);
        qualityResults.push({
            name: session.name,
            expected: session.expectedQuality,
            actual: quality.verdict,
            breakdown: quality.breakdown,
        });

        metrics.resultCount.push(quality.breakdown.resultCount.value);
        metrics.contentDepth.push(quality.breakdown.contentDepth.value);
        metrics.entityRichness.push(quality.breakdown.entityRichness.value);
        metrics.sourceDiversity.push(quality.breakdown.sourceDiversity.value);
        metrics.novelty.push(quality.breakdown.novelty.value);
    }

    // Sort for percentile calculation
    const sorted = {
        resultCount: [...metrics.resultCount].sort((a, b) => a - b),
        contentDepth: [...metrics.contentDepth].sort((a, b) => a - b),
        entityRichness: [...metrics.entityRichness].sort((a, b) => a - b),
        sourceDiversity: [...metrics.sourceDiversity].sort((a, b) => a - b),
        novelty: [...metrics.novelty].sort((a, b) => a - b),
    };

    return {
        qualityResults,
        percentiles: {
            resultCount: { p25: percentile(sorted.resultCount, 25), p50: percentile(sorted.resultCount, 50), p75: percentile(sorted.resultCount, 75) },
            contentDepth: { p25: percentile(sorted.contentDepth, 25), p50: percentile(sorted.contentDepth, 50), p75: percentile(sorted.contentDepth, 75) },
            entityRichness: { p25: percentile(sorted.entityRichness, 25), p50: percentile(sorted.entityRichness, 50), p75: percentile(sorted.entityRichness, 75) },
            sourceDiversity: { p25: percentile(sorted.sourceDiversity, 25), p50: percentile(sorted.sourceDiversity, 50), p75: percentile(sorted.sourceDiversity, 75) },
            novelty: { p25: percentile(sorted.novelty, 25), p50: percentile(sorted.novelty, 50), p75: percentile(sorted.novelty, 75) },
        },
    };
}

// ── Main ───────────────────────────────────────────────────────────

console.log('=== Threshold Calibration ===\n');

const sessions = createSessions();
console.log(`Generated ${sessions.length} simulated sessions\n`);

const analysis = analyzeSessions(sessions);

console.log('Quality Assessment Results:');
console.log('---------------------------');
for (const result of analysis.qualityResults) {
    const match = result.expected === result.actual ? '✓' : '✗';
    console.log(`${match} ${result.name}: expected=${result.expected}, actual=${result.actual}`);
}

console.log('\nMetric Distributions (Percentiles):');
console.log('------------------------------------');
console.log(`resultCount:   P25=${analysis.percentiles.resultCount.p25.toFixed(1)}, P50=${analysis.percentiles.resultCount.p50.toFixed(1)}, P75=${analysis.percentiles.resultCount.p75.toFixed(1)}`);
console.log(`contentDepth:  P25=${analysis.percentiles.contentDepth.p25.toFixed(1)}, P50=${analysis.percentiles.contentDepth.p50.toFixed(1)}, P75=${analysis.percentiles.contentDepth.p75.toFixed(1)}`);
console.log(`entityRichness: P25=${analysis.percentiles.entityRichness.p25.toFixed(1)}, P50=${analysis.percentiles.entityRichness.p50.toFixed(1)}, P75=${analysis.percentiles.entityRichness.p75.toFixed(1)}`);
console.log(`sourceDiversity: P25=${analysis.percentiles.sourceDiversity.p25.toFixed(1)}, P50=${analysis.percentiles.sourceDiversity.p50.toFixed(1)}, P75=${analysis.percentiles.sourceDiversity.p75.toFixed(1)}`);
console.log(`novelty:       P25=${analysis.percentiles.novelty.p25.toFixed(2)}, P50=${analysis.percentiles.novelty.p50.toFixed(2)}, P75=${analysis.percentiles.novelty.p75.toFixed(2)}`);

console.log('\nRecommended Thresholds (based on P25 of good sessions):');
console.log('--------------------------------------------------------');
console.log(`resultCount:    ${Math.max(3, Math.round(analysis.percentiles.resultCount.p25))}`);
console.log(`contentDepth:   ${Math.max(100, Math.round(analysis.percentiles.contentDepth.p25))}`);
console.log(`entityRichness: ${Math.max(1, Math.round(analysis.percentiles.entityRichness.p25))}`);
console.log(`sourceDiversity: ${Math.max(2, Math.round(analysis.percentiles.sourceDiversity.p25))}`);
console.log(`novelty:        ${Math.max(0.1, analysis.percentiles.novelty.p25).toFixed(2)}`);
