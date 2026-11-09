import { defineConfig } from 'vite';

// Served from this folder only, on its own port, so the game's dev server (5200) is never touched.
export default defineConfig({ root: new URL('.', import.meta.url).pathname, base: './', server: { port: 5410, strictPort: true } });
