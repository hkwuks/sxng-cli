/**
 * graph-preprocess: Preprocess session data to produce TF-IDF terms,
 * co-occurrence pairs, and existing entity context for Agent consumption.
 */

import { DirectedGraph } from 'graphology';
import { computeTfIdf } from './tfidf.js';
import { buildCoOccurrence, computeCrossResultFrequency, getExistingEntityContext } from './co-occurrence.js';
import { loadSessionResults, loadSessionGraph, loadSessionRounds } from './session.js';
import { GraphNodeAttrs, GraphEdgeAttrs, resultId } from './graph.js';

export interface PreprocessResult {
    tfidfTerms: Array<{ term: string; tf: number; idf: number; tfidf: number; docFreq: number }>;
    coOccurrences: Array<{ term1: string; term2: string; count: number }>;
    existingEntities: Array<{ id: string; label: string; degree: number; entityType?: string }>;
    resultProvenance: Array<{ id: string; url: string; title: string; rounds: number[] }>;
    termFrequencies: Array<{ term: string; count: number }>;
    roundsCovered: number;
    totalResults: number;
    resultsWithContent: number;
    tokenizationStrategy: string;
    coOccurrenceTruncated: boolean;
}

export interface PreprocessOptions {
    top?: number;
    coOccurrenceThreshold?: number;
    maxTermsForCoOccurrence?: number;
}

/** Run full preprocessing pipeline on a session directory. */
export function graphPreprocess(
    sessionDir: string,
    opts?: PreprocessOptions
): PreprocessResult {
    const results = loadSessionResults(sessionDir);
    const graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> = loadSessionGraph(sessionDir);
    const rounds = loadSessionRounds(sessionDir);

    const tfidf = computeTfIdf(results, { top: opts?.top });
    const coOcc = buildCoOccurrence(results, {
        threshold: opts?.coOccurrenceThreshold,
        maxTerms: opts?.maxTermsForCoOccurrence,
    });
    const termFreqs = computeCrossResultFrequency(results, { top: opts?.top ?? 50 });
    const entities = getExistingEntityContext(graph);
    const resultProvenance = results.map(result => ({
        id: resultId(result.url),
        url: result.url,
        title: result.title,
        rounds: Array.from(new Set(
            (result.origins || []).flatMap(origin => origin.round == null ? [] : [origin.round])
        )).sort((a, b) => a - b),
    }));

    return {
        tfidfTerms: tfidf.terms,
        coOccurrences: coOcc.pairs,
        existingEntities: entities,
        resultProvenance,
        termFrequencies: termFreqs,
        roundsCovered: rounds,
        totalResults: results.length,
        resultsWithContent: tfidf.resultsWithContent,
        tokenizationStrategy: tfidf.tokenizationStrategy,
        coOccurrenceTruncated: coOcc.truncated,
    };
}
