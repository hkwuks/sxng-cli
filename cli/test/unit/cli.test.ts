import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createProgram } from '../../src/runCli.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgVersion = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')).version;

describe('CLI program (commander)', () => {
    const program = createProgram();

    it('has correct name and version', () => {
        expect(program.name()).toBe('sxng');
        expect(program.version()).toBe(pkgVersion);
    });

    it('registers all subcommands', () => {
        const commandNames = program.commands.map(c => c.name());
        expect(commandNames).toContain('init');
        expect(commandNames).toContain('extract');
        expect(commandNames).toContain('query-graph');
        expect(commandNames).toContain('graph-add');
        expect(commandNames).toContain('session-list');
        expect(commandNames).toContain('session-delete');
        expect(commandNames).toContain('graph-preprocess');
        expect(commandNames).toContain('graph-obfuscate');
        expect(commandNames).toContain('suggest-queries');
        expect(commandNames).toContain('strategy-info');
        expect(commandNames).toContain('recovery-analysis');
        expect(commandNames).toContain('session-report');
        expect(commandNames).toContain('graph-explore');
        expect(commandNames).toContain('graph-drill');
        expect(commandNames).toContain('graph-traverse');
        expect(commandNames).toContain('graph-search');
    });

    it('registers all top-level options', () => {
        const optionFlags = program.options.map(o => o.flags);
        expect(optionFlags.some(f => f.includes('--engines'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--categories'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--limit'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--format'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--session'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--queries'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--health'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--engines-list'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--categories-list'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--redundancy'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--quality'))).toBe(true);
    });

    it('query-graph has seeds, depth, and strategy options', () => {
        const qg = program.commands.find(c => c.name() === 'query-graph');
        expect(qg).toBeDefined();
        const flags = qg!.options.map(o => o.flags);
        expect(flags.some(f => f.includes('--seeds'))).toBe(true);
        expect(flags.some(f => f.includes('--depth'))).toBe(true);
        expect(flags.some(f => f.includes('--strategy'))).toBe(true);
    });

    it('graph-add has required --data option', () => {
        const ga = program.commands.find(c => c.name() === 'graph-add');
        expect(ga).toBeDefined();
        const dataOpt = ga!.options.find(o => o.flags.includes('--data'));
        expect(dataOpt).toBeDefined();
    });

    it('graph-obfuscate has --list and --fallback-rules options', () => {
        const go = program.commands.find(c => c.name() === 'graph-obfuscate');
        expect(go).toBeDefined();
        const flags = go!.options.map(o => o.flags);
        expect(flags.some(f => f.includes('--list'))).toBe(true);
        expect(flags.some(f => f.includes('--fallback-rules'))).toBe(true);
    });
});
