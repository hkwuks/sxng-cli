/**
 * doc-index subcommand — Index local documents for BM25 search.
 *
 * Scans a directory for text files, chunks them, and builds an
 * Orama BM25 index persisted to .sxng/docs/<path-hash>/.
 */

import { resolve } from 'path';
import { scan } from '../deep/local-doc/scanner.js';
import { buildIndex } from '../deep/local-doc/indexer.js';
import { createSuccessEnvelope, createErrorEnvelope } from '../protocol.js';

export interface DocIndexOptions {
  path: string;
  extensions?: string[];
}

export async function runDocIndex(options: DocIndexOptions): Promise<number> {
  const absPath = resolve(options.path);
  const exts = options.extensions || ['md', 'txt'];

  // Scan files
  let chunks;
  try {
    chunks = scan(absPath, { extensions: exts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const envelope = createErrorEnvelope(
      'PATH_NOT_FOUND',
      message,
      { hint: `Ensure the path exists: ${absPath}` }
    );
    console.log(JSON.stringify(envelope, null, 2));
    return 1;
  }

  if (chunks.length === 0) {
    const envelope = createErrorEnvelope(
      'NO_INDEXABLE_FILES',
      `No indexable files found in ${absPath} (supported: ${exts.join(', ')})`,
      { hint: 'Ensure the directory contains matching files' }
    );
    console.log(JSON.stringify(envelope, null, 2));
    return 1;
  }

  // Build index
  try {
    const result = await buildIndex(absPath, chunks);
    const envelope = createSuccessEnvelope({
      path: absPath,
      indexPath: result.indexPath,
      files: result.meta.files,
      chunks: result.meta.chunks,
      indexedAt: result.meta.indexedAt,
    });
    console.log(JSON.stringify(envelope, null, 2));
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const envelope = createErrorEnvelope(
      'INDEX_FAILED',
      `Failed to build index: ${message}`,
      { hint: 'Check disk space and file permissions' }
    );
    console.log(JSON.stringify(envelope, null, 2));
    return 1;
  }
}
