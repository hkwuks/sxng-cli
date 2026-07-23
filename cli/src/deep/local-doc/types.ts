/**
 * Types for local document RAG (doc-index / doc-search)
 */

export interface ScannedChunk {
  id: string;
  filePath: string;
  title: string;
  content: string;
  headings: string[];
  chunkIndex: number;
  totalChunks: number;
}

/** A scanned source file and the chunks derived from its current contents. */
export interface ScannedFile {
  filePath: string;
  contentHash: string;
  chunks: ScannedChunk[];
}

export interface ScannerOptions {
  extensions?: string[];
  maxFileSize?: number;
}

export interface IndexLocation {
  indexPath: string;
  meta: {
    rootPath: string;
    files: number;
    chunks: number;
    indexedAt: number;
    partial: boolean;
    memoryBudgetBytes: number;
    tokenizer: string;
    source?: IndexSourceMetadata;
  };
}

export interface IndexedFileMetadata {
  contentHash: string;
  chunkIds: string[];
}

export interface IndexSourceMetadata {
  files: Record<string, IndexedFileMetadata>;
  extensions: string[];
  git?: { head: string };
}

export const ORAMA_SCHEMA = {
  id: 'string',
  filePath: 'string',
  title: 'string',
  content: 'string',
  headings: 'string[]',
  chunkIndex: 'number',
  totalChunks: 'number',
} as const;

export const DEFAULT_BOOST = {
  title: 3,
  headings: 2,
  content: 1,
} as const;
