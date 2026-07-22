import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['test/**/*.test.ts', 'test/**/*.bench.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/deep/**/*.ts'],
            reportsDirectory: 'coverage',
        },
    },
    resolve: {
        alias: {
            '../../src': resolve(__dirname, 'src'),
        },
    },
});
