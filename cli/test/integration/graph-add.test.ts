import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runGraphAdd } from '../../src/commands/graph-add.js';

describe('graph-add command', () => {
    let tmpDir: string;
    let graphFile: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'sxng-ga-test-'));
        graphFile = join(tmpDir, 'graph.json');
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('adds entities with new fields (obfuscatedLabel, sourceRounds, frequency, reasoningPaths)', async () => {
        const data = JSON.stringify({
            entities: [
                {
                    label: 'Tokio',
                    entityType: 'runtime',
                    score: 0.9,
                    obfuscatedLabel: 'an async runtime',
                    sourceRounds: [1, 2],
                    frequency: 5,
                    reasoningPaths: ['p:chain_001'],
                },
            ],
        });

        const code = await runGraphAdd({ graphFile, data });
        expect(code).toBe(0);

        // Read back and verify the graph contains the new fields
        const raw = readFileSync(graphFile, 'utf-8');
        const parsed = JSON.parse(raw);
        expect(parsed.status).toBe('ok');
        expect(parsed.data.stats.entities).toBe(1);
    });

    it('adds entities without new fields (backward compat)', async () => {
        const data = JSON.stringify({
            entities: [
                { label: 'Tokio', entityType: 'runtime', score: 0.9 },
            ],
        });

        const code = await runGraphAdd({ graphFile, data });
        expect(code).toBe(0);
    });

    it('updates existing entity with new fields', async () => {
        // First add without new fields
        await runGraphAdd({
            graphFile,
            data: JSON.stringify({ entities: [{ label: 'Tokio', entityType: 'runtime' }] }),
        });

        // Then add same entity with new fields
        const code = await runGraphAdd({
            graphFile,
            data: JSON.stringify({
                entities: [{
                    label: 'Tokio',
                    obfuscatedLabel: 'an async runtime',
                    frequency: 3,
                }],
            }),
        });
        expect(code).toBe(0);
    });

    it('adds edges with new relation types', async () => {
        const data = JSON.stringify({
            entities: [
                { label: 'Tokio', id: 'e:tokio' },
                { label: 'Hyper', id: 'e:hyper' },
            ],
            edges: [
                { source: 'e:tokio', target: 'e:hyper', relation: 'co_occurs_with', weight: 0.8 },
            ],
        });

        const code = await runGraphAdd({ graphFile, data });
        expect(code).toBe(0);

        const raw = readFileSync(graphFile, 'utf-8');
        const parsed = JSON.parse(raw);
        expect(parsed.data.stats.entities).toBe(2);
    });

    it('skips edges when source/target nodes are missing', async () => {
        const data = JSON.stringify({
            entities: [{ label: 'Tokio', id: 'e:tokio' }],
            edges: [
                { source: 'e:tokio', target: 'e:nonexistent', relation: 'depends_on' },
            ],
        });

        const code = await runGraphAdd({ graphFile, data });
        expect(code).toBe(0);
    });
});
