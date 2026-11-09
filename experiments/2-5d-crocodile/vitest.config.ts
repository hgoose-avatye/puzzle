import { defineConfig } from 'vitest/config';

// Own config so the game's test run (src/**/*.test.ts) never picks this experiment up, and this run only sees its own file.
export default defineConfig({ test: { root: new URL('.', import.meta.url).pathname, include: ['tools/*.compare.ts'] } });
