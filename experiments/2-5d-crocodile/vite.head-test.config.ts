import { defineConfig } from 'vite';

// The unchanged prototype served with a different sprite folder: head-test-public/ (built by tools/head_check.py, or
// HEAD_TEST_PUBLIC) holds a copy of public/ whose crocodile head strip comes from the drawn head images.
const here = new URL('.', import.meta.url).pathname;
export default defineConfig({ root: here, base: './', publicDir: process.env.HEAD_TEST_PUBLIC ?? `${here}head-test-public`, server: { port: 5412, strictPort: true } });
