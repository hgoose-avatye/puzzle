import { defineConfig } from 'vite';
import { buildDefine } from './tools/build-info';

export default defineConfig({ root: 'game', build: { outDir: 'dist', emptyOutDir: true }, server: { port: 5200 }, define: buildDefine(new URL('.', import.meta.url).pathname) });
