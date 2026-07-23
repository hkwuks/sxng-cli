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
  };
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
