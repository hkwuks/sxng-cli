/**
 * Lightweight TF-IDF implementation with defined tokenization strategy.
 *
 * Tokenization (whitespace_min3_cjk_bigram):
 *   - English: whitespace split + remove words < 3 chars
 *   - CJK fallback: character bigram (no external deps like jieba)
 *   - Mixed: whitespace split, expand CJK-containing tokens via bigram
 *
 * Only processes title + content (not full text).
 * Only computed on results that have a `content` field.
 */

// ── Tokenization ──────────────────────────────────────────────

const CJK_RANGE = /[一-鿿㐀-䶿　-〿]/;

/** Tokenize a single text string */
export function tokenize(text: string): string[] {
    const tokens: string[] = [];
    // Split by whitespace
    const parts = text.split(/\s+/).filter(Boolean);

    for (const part of parts) {
        const cleaned = part.toLowerCase().replace(/[^\w一-鿿㐀-䶿]/g, '');
        if (!cleaned) continue;

        if (CJK_RANGE.test(cleaned)) {
            // CJK-containing token: expand via character bigram
            for (let i = 0; i < cleaned.length - 1; i++) {
                const bigram = cleaned.slice(i, i + 2);
                if (bigram.length === 2) tokens.push(bigram);
            }
            // Also push single CJK chars if the token is a single char
            if (cleaned.length === 1) tokens.push(cleaned);
        } else {
            // English/ASCII: only keep tokens with length >= 3
            if (cleaned.length >= 3) tokens.push(cleaned);
        }
    }

    return tokens;
}

// ── TF-IDF ────────────────────────────────────────────────────

export interface TfIdfResult {
    term: string;
    tf: number;       // term frequency in the result
    idf: number;      // inverse document frequency
    tfidf: number;    // tf * idf
    docFreq: number;  // number of documents containing this term
}

export interface TfIdfOutput {
    terms: TfIdfResult[];
    tokenizationStrategy: string;
    coverage: number; // fraction of results that had content
    resultsWithContent: number;
    totalResults: number;
}

/** Compute TF-IDF over a set of results.
 *  Each result's "document" is the concatenation of title + content.
 *  Only results with a `content` field are included.
 */
export function computeTfIdf(
    results: Array<{ title?: string; content?: string }>,
    opts?: { top?: number }
): TfIdfOutput {
    const top = opts?.top ?? 30;
    const withContent = results.filter(r => r.content);

    // Build per-document term sets and frequency maps
    const docTermFreqs: Array<Map<string, number>> = [];
    const docFreq = new Map<string, number>(); // term → number of docs containing it
    const totalTermFreq = new Map<string, number>(); // term → total freq across all docs

    for (const result of withContent) {
        const text = `${result.title || ''} ${result.content || ''}`;
        const tokens = tokenize(text);
        // Dedupe within same result: count each term only once for doc freq
        const seen = new Set<string>();
        const freq = new Map<string, number>();

        for (const token of tokens) {
            freq.set(token, (freq.get(token) || 0) + 1);
            if (!seen.has(token)) {
                docFreq.set(token, (docFreq.get(token) || 0) + 1);
                seen.add(token);
            }
            totalTermFreq.set(token, (totalTermFreq.get(token) || 0) + 1);
        }
        docTermFreqs.push(freq);
    }

    const N = withContent.length || 1;

    // Aggregate TF-IDF: sum tfidf across all docs, pick top terms
    const aggregated = new Map<string, { tfSum: number; idf: number; docFreq: number }>();

    for (const freq of docTermFreqs) {
        for (const [term, tf] of freq) {
            const df = docFreq.get(term) || 1;
            const idf = Math.log(N / df) + 1; // smoothed IDF
            const entry = aggregated.get(term);
            if (entry) {
                entry.tfSum += tf;
            } else {
                aggregated.set(term, { tfSum: tf, idf, docFreq: df });
            }
        }
    }

    const terms: TfIdfResult[] = Array.from(aggregated.entries())
        .map(([term, { tfSum, idf, docFreq: df }]) => ({
            term,
            tf: tfSum,
            idf,
            tfidf: tfSum * idf,
            docFreq: df,
        }))
        .sort((a, b) => b.tfidf - a.tfidf)
        .slice(0, top);

    return {
        terms,
        tokenizationStrategy: 'whitespace_min3_cjk_bigram',
        coverage: withContent.length / (results.length || 1),
        resultsWithContent: withContent.length,
        totalResults: results.length,
    };
}
