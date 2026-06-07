/**
 * Entity obfuscation (MTG-inspired) for knowledge graph.
 *
 * Primary flow: Agent (LLM) generates obfuscated labels.
 * Fallback flow: simple rule-based obfuscation (experimental).
 *
 * The `graph-obfuscate` command outputs candidate entities for obfuscation,
 * then the Agent uses LLM to produce obfuscated labels and writes them
 * back via `graph-add`.
 *
 * Fallback rules are intentionally weak — they preserve too many
 * identifying cues. Marked as experimental, not for production use.
 */

import { DirectedGraph } from 'graphology';
import { GraphNodeAttrs, GraphEdgeAttrs, entityId } from './graph.js';

// ── Types ─────────────────────────────────────────────────────────

export interface ObfuscationCandidate {
    id: string;
    label: string;
    entityType?: string;
    score?: number;
    hasObfuscatedLabel: boolean;
    obfuscatedLabel?: string;
}

export interface FallbackRuleResult {
    original: string;
    obfuscated: string;
    rule: string;
}

export interface ObfuscationResult {
    mode: 'list' | 'fallback_rules';
    candidates: ObfuscationCandidate[];
    fallbackResults?: FallbackRuleResult[];
    stats: {
        totalEntities: number;
        alreadyObfuscated: number;
        needObfuscation: number;
    };
}

export interface ObfuscationConfig {
    mode: 'list' | 'fallback_rules';
    /** Entity types to skip during obfuscation (e.g. "concept" may be too vague) */
    skipEntityTypes?: string[];
}

// ── List candidates ───────────────────────────────────────────────

/** List entities that are candidates for obfuscation (those without obfuscatedLabel). */
export function listObfuscationCandidates(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    config?: ObfuscationConfig
): ObfuscationResult {
    const candidates: ObfuscationCandidate[] = [];
    let totalEntities = 0;
    let alreadyObfuscated = 0;
    const skipTypes = new Set(config?.skipEntityTypes ?? []);

    graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type !== 'entity') return;
        totalEntities++;

        if (skipTypes.has(attrs.entityType ?? '')) return;

        const hasObfuscated = !!attrs.obfuscatedLabel;
        if (hasObfuscated) {
            alreadyObfuscated++;
        }

        candidates.push({
            id: node,
            label: attrs.label,
            entityType: attrs.entityType,
            score: attrs.score,
            hasObfuscatedLabel: hasObfuscated,
            obfuscatedLabel: attrs.obfuscatedLabel,
        });
    });

    const needObfuscation = totalEntities - alreadyObfuscated;

    return {
        mode: 'list',
        candidates,
        stats: { totalEntities, alreadyObfuscated, needObfuscation },
    };
}

// ── Fallback rules (experimental) ────────────────────────────────

/** Version number removal: "TypeScript 5.8" → "TypeScript latest"
 *  Matches trailing version patterns like "5.8", "19", "v3.2.1"
 *  Excludes 4-digit years (dates) which are handled by generalizeDate. */
function removeVersion(label: string): FallbackRuleResult | null {
    // Match labels ending with version-like suffixes, but NOT bare 4-digit years
    const versionPattern = /^(.+?)\s+v?(\d+\.\d+(?:\.\d+)*|\d{1,3})$/;
    const match = label.match(versionPattern);
    if (match) {
        return {
            original: label,
            obfuscated: `${match[1].trim()} latest`,
            rule: 'remove_version',
        };
    }
    return null;
}

/** Category replacement: known software/framework names → generic category.
 *  Uses entityType if available, otherwise heuristics. */
function replaceWithCategory(label: string, entityType?: string): FallbackRuleResult | null {
    const CATEGORY_MAP: Record<string, string> = {
        runtime: 'a runtime',
        library: 'a library',
        framework: 'a framework',
        language: 'a programming language',
        tool: 'a development tool',
        database: 'a database',
        protocol: 'a protocol',
        platform: 'a platform',
        service: 'a service',
        organization: 'an organization',
        person: 'a person',
    };

    if (entityType && CATEGORY_MAP[entityType]) {
        return {
            original: label,
            obfuscated: CATEGORY_MAP[entityType],
            rule: 'category_replacement',
        };
    }
    return null;
}

/** Date generalization: "February 2026" → "early 2026", "Q3 2025" → "mid 2025"
 *  Matches month names, quarters, and specific date patterns. */
function generalizeDate(label: string): FallbackRuleResult | null {
    const MONTH_QUARTER_MAP: Record<string, string> = {
        'january': 'early', 'february': 'early', 'march': 'early',
        'april': 'mid', 'may': 'mid', 'june': 'mid',
        'july': 'late', 'august': 'late', 'september': 'late',
        'october': 'late', 'november': 'late', 'december': 'late',
        'q1': 'early', 'q2': 'mid', 'q3': 'late', 'q4': 'late',
    };

    // "February 2026" or "Feb 2026"
    const monthYearPattern = /^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})$/i;
    const match = label.match(monthYearPattern);
    if (match) {
        const month = match[1].toLowerCase().slice(0, 3);
        const year = match[2];
        // Normalize abbreviated months
        const fullMonth: Record<string, string> = {
            jan: 'january', feb: 'february', mar: 'march', apr: 'april',
            jun: 'june', jul: 'july', aug: 'august', sep: 'september',
            oct: 'october', nov: 'november', dec: 'december',
        };
        const normalized = fullMonth[month] || month;
        const period = MONTH_QUARTER_MAP[normalized];
        if (period) {
            return {
                original: label,
                obfuscated: `${period} ${year}`,
                rule: 'date_generalization',
            };
        }
    }

    // "Q3 2025" pattern
    const quarterPattern = /^(q[1-4])\s+(\d{4})$/i;
    const qMatch = label.match(quarterPattern);
    if (qMatch) {
        const quarter = qMatch[1].toLowerCase();
        const year = qMatch[2];
        const period = MONTH_QUARTER_MAP[quarter];
        if (period) {
            return {
                original: label,
                obfuscated: `${period} ${year}`,
                rule: 'date_generalization',
            };
        }
    }

    return null;
}

/** Apply fallback obfuscation rules in priority order:
 *  1. Date generalization (before version removal to avoid "February 2026" → "February latest")
 *  2. Version removal
 *  3. Category replacement
 *
 *  ⚠️ Fallback rules are experimental — they preserve too many
 *  identifying cues for true MTG-style obfuscation. */
function applyFallbackRule(label: string, entityType?: string): FallbackRuleResult | null {
    return generalizeDate(label) || removeVersion(label) || replaceWithCategory(label, entityType);
}

/** Apply fallback rules to all entities without obfuscatedLabel and write results to graph.
 *  Returns the list of applied rules. */
export function applyFallbackRules(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    config?: ObfuscationConfig
): ObfuscationResult {
    const skipTypes = new Set(config?.skipEntityTypes ?? []);
    const fallbackResults: FallbackRuleResult[] = [];
    let totalEntities = 0;
    let alreadyObfuscated = 0;
    let needObfuscation = 0;

    const candidates: ObfuscationCandidate[] = [];

    graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type !== 'entity') return;
        totalEntities++;

        if (skipTypes.has(attrs.entityType ?? '')) return;

        if (attrs.obfuscatedLabel) {
            alreadyObfuscated++;
            candidates.push({
                id: node,
                label: attrs.label,
                entityType: attrs.entityType,
                score: attrs.score,
                hasObfuscatedLabel: true,
                obfuscatedLabel: attrs.obfuscatedLabel,
            });
            return;
        }

        needObfuscation++;
        const result = applyFallbackRule(attrs.label, attrs.entityType);

        if (result) {
            // Write obfuscatedLabel back to graph node
            graph.mergeNode(node, {
                ...attrs,
                obfuscatedLabel: result.obfuscated,
            });
            fallbackResults.push(result);
            candidates.push({
                id: node,
                label: attrs.label,
                entityType: attrs.entityType,
                score: attrs.score,
                hasObfuscatedLabel: true,
                obfuscatedLabel: result.obfuscated,
            });
        } else {
            candidates.push({
                id: node,
                label: attrs.label,
                entityType: attrs.entityType,
                score: attrs.score,
                hasObfuscatedLabel: false,
            });
        }
    });

    return {
        mode: 'fallback_rules',
        candidates,
        fallbackResults,
        stats: { totalEntities, alreadyObfuscated, needObfuscation },
    };
}

// ── Main dispatch ─────────────────────────────────────────────────

/** Run entity obfuscation on a graph. */
export function runGraphObfuscate(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    config: ObfuscationConfig
): ObfuscationResult {
    switch (config.mode) {
        case 'list':
            return listObfuscationCandidates(graph, config);
        case 'fallback_rules':
            return applyFallbackRules(graph, config);
        default:
            return {
                mode: config.mode,
                candidates: [],
                stats: { totalEntities: 0, alreadyObfuscated: 0, needObfuscation: 0 },
            };
    }
}
