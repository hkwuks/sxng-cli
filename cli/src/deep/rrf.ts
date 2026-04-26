/**
 * RRF (Reciprocal Rank Fusion) - Merge multiple ranked lists
 */

export interface RrfInputItem {
    id: string;
    [key: string]: unknown;
}

export interface RrfOutputItem {
    id: string;
    score: number;
}

export function rrf(
    rankings: Array<Array<RrfInputItem>>,
    k: number = 60
): Array<RrfOutputItem> {
    if (k <= 0) throw new Error(`RRF parameter k must be positive, got: ${k}`);
    if (rankings.length === 0) return [];

    const scores = new Map<string, number>();

    for (const ranking of rankings) {
        for (let i = 0; i < ranking.length; i++) {
            const doc = ranking[i];
            if (!doc.id) continue;
            const score = 1 / (k + i + 1);
            scores.set(doc.id, (scores.get(doc.id) || 0) + score);
        }
    }

    return Array.from(scores.entries())
        .map(([id, score]) => ({ id, score }))
        .sort((a, b) => b.score - a.score);
}