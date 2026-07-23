import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runResultsAdd } from '../../src/commands/results-add.js';
import { loadSessionResults } from '../../src/deep/session.js';

describe('results-add command', () => {
    let sessionDir: string;

    beforeEach(() => {
        sessionDir = mkdtempSync(join(tmpdir(), 'sxng-results-add-'));
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        rmSync(sessionDir, { recursive: true, force: true });
    });

    it('stores the supplied query as each external result origin', async () => {
        const code = await runResultsAdd({
            session: sessionDir,
            query: 'external runtime query',
            data: JSON.stringify([{ url: 'https://example.com/result', title: 'Result', source: 'tavily' }]),
        });

        expect(code).toBe(0);
        expect(loadSessionResults(sessionDir)[0].origins).toEqual([
            { query: 'external runtime query', round: 1 },
        ]);
    });
});
