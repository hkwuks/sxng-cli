/**
 * Scanner — file scanning + structure-aware chunking
 *
 * Scans a directory for documents, parses YAML frontmatter,
 * and splits content into chunks using chunk-smart (markdown)
 * or paragraph splitting (plain text).
 */

import { readFileSync, statSync, readdirSync } from 'fs';
import { resolve, extname, join } from 'path';
import { createHash } from 'crypto';
import { chunk } from 'chunk-smart';
import { ScannedChunk, ScannerOptions } from './types.js';

const DEFAULT_OPTIONS: Required<ScannerOptions> = {
  extensions: ['md', 'txt'],
  maxFileSize: 10 * 1024 * 1024, // 10MB
};

// ── Frontmatter parsing ──────────────────────────────────────────────

interface FrontmatterResult {
  title: string;
  body: string;
}

function parseFrontmatter(content: string): FrontmatterResult {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    return { title: '', body: content };
  }

  const fmText = match[1];
  const body = content.slice(match[0].length);

  // Extract title line from YAML frontmatter (simple, no full YAML parser)
  const titleMatch = fmText.match(/^title:\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim().replace(/^['"](.*)['"]$/, '$1') : '';

  return { title, body };
}

// ── Paragraph splitting for .txt files ────────────────────────────────

interface RawChunk {
  content: string;
  headings: string[];
}

/**
 * Split plain text by paragraph boundaries (double newlines).
 * chunk-smart's 'paragraph' mode may return one single chunk;
 * this provides a reliable fallback.
 */
function splitParagraphs(text: string): RawChunk[] {
  const parts = text.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0);
  if (parts.length === 0) return [{ content: text, headings: [] }];
  return parts.map(p => ({ content: p, headings: [] }));
}

// ── ID generation ─────────────────────────────────────────────────────

function makeId(filePath: string, chunkIndex: number): string {
  return createHash('sha256').update(`${filePath}\0${chunkIndex}`).digest('hex').slice(0, 16);
}

// ── Main scan function ────────────────────────────────────────────────

export function scan(rootPath: string, options?: ScannerOptions): ScannedChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const absRoot = resolve(rootPath);

  // Verify path exists
  try {
    statSync(absRoot);
  } catch {
    throw new Error(`Path not found: ${absRoot}`);
  }

  // Build glob patterns
  const patterns = opts.extensions.map(ext =>
    `**/*.${ext.startsWith('.') ? ext.slice(1) : ext}`
  );

  // Build extension set for matching
  const extSet = new Set(
    opts.extensions.map(ext => ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`)
  );

  // Recursively collect matching files
  const files: string[] = [];
  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(dir, entry);
      try {
        const st = statSync(abs);
        if (st.isDirectory()) {
          walk(abs);
        } else if (st.isFile() && extSet.has(extname(abs).toLowerCase())) {
          files.push(abs);
        }
      } catch {
        // Skip unreadable entries
      }
    }
  }
  walk(absRoot);

  if (files.length === 0) {
    return [];
  }

  const chunks: ScannedChunk[] = [];
  let scannedFiles = 0;

  for (const absFile of files) {
    const relFile = absFile.startsWith(absRoot) ? absFile.slice(absRoot.length + 1) : absFile;

    // File size check
    try {
      const st = statSync(absFile);
      if (st.size > opts.maxFileSize) {
        console.warn(`[doc-index] Skipping large file (>10MB): ${relFile}`);
        continue;
      }
    } catch {
      continue;
    }

    // Read content
    let content: string;
    try {
      content = readFileSync(absFile, 'utf-8');
    } catch {
      console.warn(`[doc-index] Skipping unreadable file: ${relFile}`);
      continue;
    }

    if (!content.trim()) {
      continue;
    }

    // Parse frontmatter
    const { title: fmTitle, body } = parseFrontmatter(content);
    const docTitle = fmTitle || relFile;

    // Chunk based on file type
    const ext = extname(absFile).toLowerCase();
    const isMarkdown = ext === '.md';

    let rawChunks: RawChunk[];

    if (isMarkdown) {
      try {
        // (chunk-smart types may not include 'mode' — cast as needed)
        const mdChunks = (chunk as any)(body, { mode: 'markdown' });
        rawChunks = mdChunks.map((c: any) => ({
          content: c.content,
          headings: (c.metadata?.headings || []).map((h: string) => h),
        }));
      } catch {
        // Fallback: treat as plain text
        rawChunks = splitParagraphs(body);
      }
    } else {
      rawChunks = splitParagraphs(body);
    }

    if (rawChunks.length === 0) {
      continue;
    }

    scannedFiles++;

    for (let i = 0; i < rawChunks.length; i++) {
      const rc = rawChunks[i];
      const chunkContent = rc.content.trim();
      if (!chunkContent) continue;

      // Build headings hierarchy: doc title + chunk headings
      const allHeadings: string[] = [];
      if (docTitle && fmTitle) allHeadings.push(docTitle);
      allHeadings.push(...rc.headings);

      const id = makeId(relFile, i);
      chunks.push({
        id,
        filePath: relFile,
        title: docTitle,
        content: chunkContent,
        headings: allHeadings,
        chunkIndex: i,
        totalChunks: rawChunks.length,
      });
    }
  }

  if (chunks.length === 0 && scannedFiles === 0) {
    return [];
  }

  return chunks;
}
