/**
 * Co-occurrence matrix and cross-results frequency statistics.
 *
 * Co-occurrence: word pairs that appear within the same result.
 * Frequency: how many results contain each term.
 * Both derived from TF-IDF tokenization output.
 */

import { tokenize } from './tfidf.js';
import { DirectedGraph } from 'graphology';
import { GraphNodeAttrs, GraphEdgeAttrs } from './graph.js';
import { getEntityDegree } from './degree-utils.js';

// ── Co-occurrence ─────────────────────────────────────────────

export interface CoOccurrencePair {
    term1: string;
    term2: string;
    count: number; // number of results where both appear
}

export interface CoOccurrenceOutput {
    pairs: CoOccurrencePair[];
    truncated: boolean;
    maxTerms: number;
}

const MAX_TERMS_FOR_CO_OCCURRENCE = 50;
const DEFAULT_THRESHOLD = 2;

/** Build co-occurrence matrix from results.
 *  Only results with `content` are processed.
 *  If unique terms > maxTerms, take the top by frequency and set truncated=true.
 */
export function buildCoOccurrence(
    results: Array<{ title?: string; content?: string }>,
    opts?: { threshold?: number; maxTerms?: number }
): CoOccurrenceOutput {
    const threshold = opts?.threshold ?? DEFAULT_THRESHOLD;
    const maxTerms = opts?.maxTerms ?? MAX_TERMS_FOR_CO_OCCURRENCE;

    const withContent = results.filter(r => r.content);

    // Per-result term sets
    const perResultTermSets: Array<Set<string>> = [];
    const globalFreq = new Map<string, number>(); // term → # results containing it

    for (const result of withContent) {
        const text = `${result.title || ''} ${result.content || ''}`;
        const tokens = tokenize(text);
        const termSet = new Set(tokens);
        perResultTermSets.push(termSet);

        for (const term of termSet) {
            globalFreq.set(term, (globalFreq.get(term) || 0) + 1);
        }
    }

    // Truncate to top maxTerms by frequency
    const sortedTerms = Array.from(globalFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxTerms)
        .map(([term]) => term);

    const truncated = globalFreq.size > maxTerms;
    const termIndex = new Set(sortedTerms);

    // Count co-occurrences
    const pairCounts = new Map<string, number>();

    for (const termSet of perResultTermSets) {
        const filtered = sortedTerms.filter(t => termSet.has(t));
        for (let i = 0; i < filtered.length; i++) {
            for (let j = i + 1; j < filtered.length; j++) {
                const key = filtered[i] < filtered[j]
                    ? `${filtered[i]}|${filtered[j]}`
                    : `${filtered[j]}|${filtered[i]}`;
                pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
            }
        }
    }

    const pairs: CoOccurrencePair[] = [];
    for (const [key, count] of pairCounts) {
        if (count >= threshold) {
            const [term1, term2] = key.split('|');
            pairs.push({ term1, term2, count });
        }
    }

    pairs.sort((a, b) => b.count - a.count);

    return { pairs, truncated, maxTerms };
}

// ── Cross-results frequency ───────────────────────────────────

export interface TermFrequency {
    term: string;
    count: number; // number of results containing this term
}

/** Count how many results contain each term. */
export function computeCrossResultFrequency(
    results: Array<{ title?: string; content?: string }>,
    opts?: { top?: number }
): TermFrequency[] {
    const top = opts?.top ?? 50;
    const withContent = results.filter(r => r.content);
    const freq = new Map<string, number>();

    for (const result of withContent) {
        const text = `${result.title || ''} ${result.content || ''}`;
        const tokens = tokenize(text);
        const seen = new Set(tokens);
        for (const term of seen) {
            freq.set(term, (freq.get(term) || 0) + 1);
        }
    }

    return Array.from(freq.entries())
        .map(([term, count]) => ({ term, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, top);
}

// ── Existing entity context ───────────────────────────────────

export interface EntityContext {
    id: string;
    label: string;
    degree: number;
    entityType?: string;
}

/** Get existing entity nodes from the graph with their on-demand degree. */
export function getExistingEntityContext(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>
): EntityContext[] {
    const entities: EntityContext[] = [];
    graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type === 'entity') {
            entities.push({
                id: node,
                label: attrs.label,
                degree: getEntityDegree(graph, node),
                entityType: attrs.entityType,
            });
        }
    });
    return entities.sort((a, b) => b.degree - a.degree);
}
