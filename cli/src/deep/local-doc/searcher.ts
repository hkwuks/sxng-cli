/**
 * Searcher — BM25 search + SessionResult formatting.
 *
 * Searches an Orama index, formats results as SessionResult[]
 * with source: 'local', and injects them into the session pipeline
 * without incrementing the round counter.
 */

import { resolve } from 'path';
import { search as oramaSearch } from '@orama/orama';
import { scan } from './scanner.js';
import { buildIndex, hasIndex, loadIndex } from './indexer.js';
import { DEFAULT_BOOST } from './types.js';
import {
  appendSessionResults,
  getPendingResults,
  initSessionDir,
  resolveSessionPath,
  SessionResult,
} from '../session.js';

export interface DocSearchOptions {
  session: string;
  query: string;
  path: string;
  topK: number;
  boost?: Record<string, number>;
}

export interface DocSearchResult {
  session: string;
  query: string;
  path: string;
  added: number;
  totalPending: number;
  results: SessionResult[];
}

/**
 * Parse boost string like "title:3,headings:2,content:1"
 * into an object { title: 3, headings: 2, content: 1 }
 */
function parseBoost(raw: string): Record<string, number> {
  const boost: Record<string, number> = {};
  for (const pair of raw.split(',')) {
    const [k, v] = pair.split(':');
    if (k && v !== undefined) {
      boost[k.trim()] = parseFloat(v.trim());
    }
  }
  return boost;
}

/**
 * Search local documents and inject results into session.
 * Auto-indexes the path if not already indexed.
 */
export async function docSearch(opts: DocSearchOptions): Promise<DocSearchResult> {
  const { query, topK } = opts;
  const absPath = resolve(opts.path);

  // Validate query
  if (!query || query.trim().length === 0) {
    throw Object.assign(new Error('Query is empty'), { code: 'EMPTY_QUERY' });
  }

  // Auto-index if needed
  if (!hasIndex(absPath)) {
    const chunks = scan(absPath);
    if (chunks.length === 0) {
      throw Object.assign(
        new Error(`No indexable files found in ${absPath} (supported: .md, .txt)`),
        { code: 'NO_INDEXABLE_FILES' }
      );
    }
    await buildIndex(absPath, chunks);
  }

  // Load index
  let db: any;
  try {
    db = await loadIndex(absPath);
  } catch {
    throw Object.assign(
      new Error('Failed to load search index. Try re-indexing with doc-index.'),
      { code: 'INDEX_LOAD_ERROR' }
    );
  }

  // Determine boost
  const boost = opts.boost || DEFAULT_BOOST;

  // Search
  let searchResult: { hits: Array<{ id: string; score: number; document: any }> };
  try {
    searchResult = await oramaSearch(db, {
      term: query,
      mode: 'fulltext',
      limit: topK,
      boost,
    });
  } catch {
    throw Object.assign(
      new Error('Search failed'),
      { code: 'SEARCH_ERROR' }
    );
  }

  if (!searchResult.hits || searchResult.hits.length === 0) {
    return {
      session: opts.session,
      query,
      path: absPath,
      added: 0,
      totalPending: 0,
      results: [],
    };
  }

  // Format as SessionResult[]
  const results: SessionResult[] = [];
  for (const hit of searchResult.hits) {
    const doc = hit.document;

    // Build title: "DocumentName — Section / Subsection"
    const sectionParts: string[] = [];
    if (doc.headings && doc.headings.length > 0) {
      sectionParts.push(...doc.headings);
    }
    let title: string;
    if (sectionParts.length > 0) {
      title = `${doc.title || doc.filePath} — ${sectionParts.join(' / ')}`;
    } else {
      title = doc.title || doc.filePath || 'Untitled';
    }

    // Build file:/// URL with absolute path
    const absFile = resolve(absPath, doc.filePath);
    const url = `file://${absFile}#chunk-${doc.chunkIndex}`;

    results.push({
      url,
      title,
      content: doc.content || '',
      source: 'local',
      score: hit.score,
      filePath: doc.filePath,
      headings: doc.headings || [],
      chunkIndex: doc.chunkIndex,
      status: undefined, // set to 'pending' by appendSessionResults
    });
  }

  // Inject into session (skip round increment — merged with current web round)
  const sessionDir = resolveSessionPath(opts.session);
  initSessionDir(sessionDir); // ensure meta.json exists
  const { added, total } = appendSessionResults(sessionDir, results, {
    skipRoundIncrement: true,
  });

  const pendingCount = getPendingResults(sessionDir).length;

  return {
    session: sessionDir,
    query,
    path: absPath,
    added,
    totalPending: pendingCount,
    results,
  };
}

export { parseBoost };
