/**
 * Indexer — Orama index creation, persistence, and loading.
 *
 * Builds BM25 full-text indexes for document chunks, persists them
 * as JSON files under .sxng/docs/<path-hash>/, and restores them
 * on subsequent searches.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { createHash } from 'crypto';
import { freemem, totalmem } from 'os';
import { create, insertMultiple, load } from '@orama/orama';
import { createTokenizer } from '@orama/tokenizers/mandarin';
import { persist } from '@orama/plugin-data-persistence';
import { ScannedChunk, IndexLocation, ORAMA_SCHEMA } from './types.js';

const BATCH_SIZE = 500;
const MAX_INDEX_MEMORY_BYTES = 256 * 1024 * 1024;
const TOKENIZER_VERSION = 'mandarin-lowercase-v1';

function createDocumentTokenizer() {
  const tokenizer = createTokenizer();
  const tokenize = tokenizer.tokenize;
  tokenizer.tokenize = (raw, language, property, withCache) =>
    tokenize(raw.toLowerCase(), language, property, withCache);
  return tokenizer;
}

/** Reserve most memory for the process and OS; Orama expands raw text in memory. */
export function calculateIndexMemoryBudget(totalBytes: number, freeBytes: number): number {
  return Math.min(MAX_INDEX_MEMORY_BYTES, totalBytes * 0.05, freeBytes * 0.2);
}

export function getIndexMemoryBudget(): number {
  return calculateIndexMemoryBudget(totalmem(), freemem());
}

// ── Path utilities ────────────────────────────────────────────────────

/** Get .sxng root directory (cwd-based) */
function getSxngRoot(): string {
  return join(process.cwd(), '.sxng');
}

/** Get docs index directory */
function getDocsDir(): string {
  return join(getSxngRoot(), 'docs');
}

/** Generate deterministic short hash from a path */
export function getIndexPath(rootPath: string): string {
  const abs = resolve(rootPath);
  const hash = createHash('sha256').update(abs).digest('hex').slice(0, 16);
  return join(getDocsDir(), hash);
}

// ── Index building ────────────────────────────────────────────────────

export async function buildIndex(
  rootPath: string,
  chunks: ScannedChunk[]
): Promise<IndexLocation> {
  const absRoot = resolve(rootPath);
  const indexPath = getIndexPath(rootPath);

  mkdirSync(indexPath, { recursive: true });

  const db = await create({
    schema: ORAMA_SCHEMA,
    components: { tokenizer: createDocumentTokenizer() },
  });

  if (chunks.length > 0) {
    // Batch insert to avoid issues with very large arrays
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      await insertMultiple(db, batch);
    }
  }

  // Persist to JSON
  const json = await persist(db, 'json') as string;
  writeFileSync(join(indexPath, 'index.json'), json, 'utf-8');

  // Write meta
  const meta = {
    rootPath: absRoot,
    files: new Set(chunks.map(c => c.filePath)).size,
    chunks: chunks.length,
    indexedAt: Date.now(),
    partial: false,
    memoryBudgetBytes: getIndexMemoryBudget(),
    tokenizer: TOKENIZER_VERSION,
  };
  writeFileSync(join(indexPath, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');

  return { indexPath, meta };
}

/**
 * Build an index incrementally. Each yielded batch is released after insertion.
 * The persisted index remains usable when the memory budget ends the scan early.
 */
export async function buildIndexFromBatches(
  rootPath: string,
  batches: Iterable<ScannedChunk[]>,
  memoryBudgetBytes = getIndexMemoryBudget()
): Promise<IndexLocation> {
  const absRoot = resolve(rootPath);
  const indexPath = getIndexPath(rootPath);
  const initialHeapBytes = process.memoryUsage().heapUsed;
  const db = await create({
    schema: ORAMA_SCHEMA,
    components: { tokenizer: createDocumentTokenizer() },
  });
  let files = 0;
  let chunks = 0;
  let partial = false;

  for (const batch of batches) {
    const batchBytes = batch.reduce((total, item) =>
      total + Buffer.byteLength(item.content, 'utf-8'), 0);
    const heapUsed = process.memoryUsage().heapUsed - initialHeapBytes;

    if (heapUsed >= memoryBudgetBytes || heapUsed + batchBytes * 4 > memoryBudgetBytes) {
      partial = true;
      break;
    }

    for (let offset = 0; offset < batch.length; offset += BATCH_SIZE) {
      await insertMultiple(db, batch.slice(offset, offset + BATCH_SIZE));
    }
    files++;
    chunks += batch.length;
  }

  if (chunks === 0) {
    if (partial) {
      throw Object.assign(
        new Error(`Index memory budget (${memoryBudgetBytes} bytes) is too small to index any files in ${absRoot}`),
        { code: 'MEMORY_LIMIT_REACHED' }
      );
    }
    throw Object.assign(new Error(`No indexable files found in ${absRoot}`), { code: 'NO_INDEXABLE_FILES' });
  }

  mkdirSync(indexPath, { recursive: true });
  const json = await persist(db, 'json') as string;
  writeFileSync(join(indexPath, 'index.json'), json, 'utf-8');

  const meta = {
    rootPath: absRoot,
    files,
    chunks,
    indexedAt: Date.now(),
    partial,
    memoryBudgetBytes,
    tokenizer: TOKENIZER_VERSION,
  };
  writeFileSync(join(indexPath, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
  return { indexPath, meta };
}

// ── Index loading ─────────────────────────────────────────────────────

export async function loadIndex(rootPath: string): Promise<any> {
  const indexPath = getIndexPath(rootPath);
  const data = readFileSync(join(indexPath, 'index.json'), 'utf-8');
  const db = await create({
    schema: ORAMA_SCHEMA,
    components: { tokenizer: createDocumentTokenizer() },
  });
  load(db, JSON.parse(data));
  return db;
}

// ── Index detection ───────────────────────────────────────────────────

export function hasIndex(rootPath: string): boolean {
  const indexPath = getIndexPath(rootPath);
  return existsSync(join(indexPath, 'index.json'))
    && getIndexMeta(rootPath)?.tokenizer === TOKENIZER_VERSION;
}

// ── Index metadata ────────────────────────────────────────────────────

export function getIndexMeta(rootPath: string): IndexLocation['meta'] | null {
  const indexPath = getIndexPath(rootPath);
  const metaFile = join(indexPath, 'meta.json');
  if (!existsSync(metaFile)) return null;
  try {
    return JSON.parse(readFileSync(metaFile, 'utf-8'));
  } catch {
    return null;
  }
}
