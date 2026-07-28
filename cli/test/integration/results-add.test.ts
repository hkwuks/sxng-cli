import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
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

    it('adds external results from a UTF-8 JSON file without trusting extraction metadata', async () => {
        const dataFile = join(sessionDir, 'exa-results.json');
        writeFileSync(dataFile, `\uFEFF${JSON.stringify([
            {
                url: 'https://example.com/chinese',
                title: '中文结果',
                content: 'This caller-provided summary is not verified source content.',
                extractedAt: 1,
                source: 'exa',
            },
        ], null, 2)}`, 'utf8');

        const code = await runResultsAdd({
            session: sessionDir,
            query: '中文外部查询',
            dataFile,
        } as any);

        expect(code).toBe(0);
        expect(loadSessionResults(sessionDir)[0]).toMatchObject({
            title: '中文结果',
            source: 'exa',
        });
        expect(loadSessionResults(sessionDir)[0].extractedAt).toBeUndefined();
    });

    it('rejects malformed results without creating session state', async () => {
        const code = await runResultsAdd({
            session: sessionDir,
            query: 'bad external input',
            data: JSON.stringify([null]),
        });

        expect(code).toBe(1);
        expect(loadSessionResults(sessionDir)).toEqual([]);
    });
});
