import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  appendSessionResults,
  approveResults,
  getPendingExtractionResults,
  getPendingResults,
  initSessionDir,
  injectApprovedResults,
  loadSessionGraph,
  loadSessionResults,
  recordExtractionOutcome,
  setSkipped,
  validateSessionInputFile,
} from '../../src/deep/session.js';

describe('session result contract', () => {
  let sessionDir: string;

  beforeEach(() => {
    sessionDir = mkdtempSync(join(tmpdir(), 'sxng-session-'));
    initSessionDir(sessionDir);
  });

  afterEach(() => rmSync(sessionDir, { recursive: true, force: true }));

  it('stores discovery separately from an extracted body and gives it a stable revision', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', excerpt: 'search snippet',
      origins: [{ tool: 'sxng', engine: 'google', query: 'example query' }],
    }]);

    const [result] = loadSessionResults(sessionDir);
    expect(result).toMatchObject({
      contentType: 'search', status: 'pending', revision: 1,
      origins: [{ tool: 'sxng', engine: 'google', query: 'example query', round: 1 }],
    });
    expect(result.id).toMatch(/^r:/);
    expect(result.content).toBeUndefined();
    expect(getPendingExtractionResults(sessionDir)).toHaveLength(1);
    expect(getPendingResults(sessionDir)).toHaveLength(0);
  });

  it('approves only an extracted result with the matching id and revision', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', contentType: 'extracted',
      content: 'A short but real body is still a successful extraction.', extractor: 'defuddle',
      extractedAt: 1, origins: [{ tool: 'sxng', query: 'example query' }],
    }]);
    const [result] = loadSessionResults(sessionDir);

    expect(approveResults(sessionDir, [{ id: result.id, revision: result.revision + 1 }]).error)
      .toMatchObject({ code: 'RESULT_REVISION_CONFLICT' });
    const approval = approveResults(sessionDir, [{ id: result.id, revision: result.revision }]);
    expect(approval.approved).toBe(1);
    expect(loadSessionResults(sessionDir)[0]).toMatchObject({ status: 'approved', revision: 2 });
  });

  it('records blank extraction as failure and a nonempty short body as success', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', origins: [{ tool: 'sxng', query: 'query' }],
    }]);
    recordExtractionOutcome(sessionDir, [{
      url: 'https://example.com/article', failure: { code: 'empty', message: 'blank response' },
    }]);
    expect(loadSessionResults(sessionDir)[0]).toMatchObject({ failureCount: 1, lastFailure: { code: 'empty' } });

    recordExtractionOutcome(sessionDir, [{
      url: 'https://example.com/article', content: 'Short body.', extractor: 'defuddle', extractedAt: 2,
    }]);
    expect(loadSessionResults(sessionDir)[0]).toMatchObject({
      contentType: 'extracted', content: 'Short body.', extractor: 'defuddle', extractedAt: 2,
    });
    expect(loadSessionResults(sessionDir)[0].failureCount).toBeUndefined();
  });

  it('makes an identical imported body pending again and clears a prior skip', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', contentType: 'extracted', content: 'Stable body.',
      extractor: 'external', extractedAt: 1, origins: [{ tool: 'exa', query: 'query' }],
    }]);
    const [initial] = loadSessionResults(sessionDir);
    approveResults(sessionDir, [{ id: initial.id, revision: initial.revision }]);
    const approved = loadSessionResults(sessionDir)[0];
    setSkipped(sessionDir, [{ id: approved.id, revision: approved.revision }], true);

    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', contentType: 'extracted', content: 'Stable body.',
      extractor: 'external', extractedAt: 2, origins: [{ tool: 'exa', query: 'query' }],
    }]);
    const refreshed = loadSessionResults(sessionDir)[0];
    expect(refreshed).toMatchObject({ status: 'pending', extractedAt: 2 });
    expect(refreshed.skippedAt).toBeUndefined();
  });

  it('does not overwrite corrupt claim state while accepting a new extracted body', () => {
    appendSessionResults(sessionDir, [{ url: 'https://example.com/article', title: 'Article', origins: [{ tool: 'sxng', query: 'query' }] }]);
    const claimsFile = join(sessionDir, 'claims', 'claims.json');
    mkdirSync(join(sessionDir, 'claims'), { recursive: true });
    writeFileSync(claimsFile, '{invalid', 'utf8');
    recordExtractionOutcome(sessionDir, [{ url: 'https://example.com/article', content: 'Body.', extractor: 'defuddle', extractedAt: 1 }]);
    expect(loadSessionResults(sessionDir)[0].content).toBe('Body.');
    expect(readFileSync(claimsFile, 'utf8')).toBe('{invalid');
  });

  it('retains local document chunk fragments as separate stable results', () => {
    appendSessionResults(sessionDir, [
      { url: 'file:///docs/notes.md#chunk-0', title: 'Notes', contentType: 'extracted', content: 'One', extractor: 'local-index', origins: [{ tool: 'local-index', query: 'notes' }] },
      { url: 'file:///docs/notes.md#chunk-1', title: 'Notes', contentType: 'extracted', content: 'Two', extractor: 'local-index', origins: [{ tool: 'local-index', query: 'notes' }] },
    ]);
    expect(loadSessionResults(sessionDir).map(result => result.id)).toHaveLength(2);
    expect(new Set(loadSessionResults(sessionDir).map(result => result.id)).size).toBe(2);
  });

  it('injects structural edges only after approval', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', contentType: 'extracted', content: 'Body',
      extractor: 'defuddle', origins: [{ tool: 'sxng', query: 'example query' }],
    }]);
    const [result] = loadSessionResults(sessionDir);
    const approval = approveResults(sessionDir, [{ id: result.id, revision: result.revision }]);
    const injected = injectApprovedResults(sessionDir, approval.approvedResults);
    expect(injected.nodesAdded).toBeGreaterThan(0);
    expect(loadSessionGraph(sessionDir).someNode((_id, attrs) => attrs.type === 'result')).toBe(true);
  });

  it('accepts Agent JSON only inside the owning session agent-inputs directory', () => {
    expect(validateSessionInputFile(sessionDir, join(sessionDir, 'agent-inputs', 'request.json'))).toBeUndefined();
    expect(validateSessionInputFile(sessionDir, join(sessionDir, '..', 'request.json'))).toBeUndefined();
  });
});
