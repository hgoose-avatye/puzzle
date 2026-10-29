import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'viewer',
  build: { outDir: 'dist', emptyOutDir: true },
  test: { root: '.', include: ['src/**/*.test.ts'] },
});
