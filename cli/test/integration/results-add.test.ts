import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runResultsAdd } from '../../src/commands/results-add.js';
import { initSessionDir, loadSessionResults } from '../../src/deep/session.js';

describe('results-add command', () => {
  let sessionDir: string;

  beforeEach(() => {
    sessionDir = mkdtempSync(join(tmpdir(), 'sxng-results-add-'));
    initSessionDir(sessionDir);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(sessionDir, { recursive: true, force: true });
  });

  it('imports external search discovery without treating its excerpt as a body', async () => {
    const dataFile = join(sessionDir, 'agent-inputs', 'search.json');
    writeFileSync(dataFile, JSON.stringify([{
      url: 'https://example.com/article', title: 'Article', excerpt: 'Search result summary', engine: 'google',
    }]), 'utf8');

    expect(await runResultsAdd({ session: sessionDir, kind: 'search', dataFile, tool: 'exa', query: 'external query' })).toBe(0);
    expect(loadSessionResults(sessionDir)[0]).toMatchObject({
      contentType: 'search', excerpt: 'Search result summary',
      origins: [{ tool: 'exa', engine: 'google', query: 'external query', round: 1 }],
    });
    expect(loadSessionResults(sessionDir)[0].content).toBeUndefined();
  });

  it('imports a verified external body with immediate extraction time when absent', async () => {
    const dataFile = join(sessionDir, 'agent-inputs', 'body.json');
    writeFileSync(dataFile, JSON.stringify([{
      url: 'https://example.com/article', title: 'Article', content: 'Externally extracted body.', extractor: 'tavily-extract',
    }]), 'utf8');

    expect(await runResultsAdd({ session: sessionDir, kind: 'extracted', dataFile, tool: 'tavily', query: 'external query' })).toBe(0);
    const [result] = loadSessionResults(sessionDir);
    expect(result).toMatchObject({ contentType: 'extracted', content: 'Externally extracted body.', extractor: 'tavily-extract' });
    expect(result.extractedAt).toEqual(expect.any(Number));
  });

  it('rejects JSON outside the owning agent-inputs directory', async () => {
    const dataFile = join(sessionDir, 'outside.json');
    writeFileSync(dataFile, '[]', 'utf8');
    expect(await runResultsAdd({ session: sessionDir, kind: 'search', dataFile, tool: 'exa', query: 'query' })).toBe(1);
    expect(loadSessionResults(sessionDir)).toEqual([]);
  });
});
