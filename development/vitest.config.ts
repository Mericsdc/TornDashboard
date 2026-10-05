import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.mjs'], testTimeout: 15000 }, resolve: { alias: { '@tcd/shared': new URL('./packages/shared/src/index.ts', import.meta.url).pathname } } });
