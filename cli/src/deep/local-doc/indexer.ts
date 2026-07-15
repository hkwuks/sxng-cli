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
import { create, insertMultiple } from '@orama/orama';
import { persist, restore } from '@orama/plugin-data-persistence';
import { ScannedChunk, IndexLocation, ORAMA_SCHEMA } from './types.js';

const BATCH_SIZE = 500;

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

  // Ensure directory exists
  mkdirSync(indexPath, { recursive: true });

  // Create index with default tokenizer (handles Latin text)
  // CJK support: use @orama/tokenizers/mandarin via components.tokenizer if needed
  const db = await create({
    schema: ORAMA_SCHEMA,
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
  };
  writeFileSync(join(indexPath, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');

  return { indexPath, meta };
}

// ── Index loading ─────────────────────────────────────────────────────

export async function loadIndex(rootPath: string): Promise<any> {
  const indexPath = getIndexPath(rootPath);
  const data = readFileSync(join(indexPath, 'index.json'), 'utf-8');
  return restore('json', data);
}

// ── Index detection ───────────────────────────────────────────────────

export function hasIndex(rootPath: string): boolean {
  const indexPath = getIndexPath(rootPath);
  return existsSync(join(indexPath, 'index.json'));
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
