// Classic 3D (block animals), kept for comparison only: `npm run dev:game3d`. The game is the 2.5D entry, experiments/2-5d-game/vite.config.ts (`npm run dev:game`).
import { defineConfig } from 'vite';
import { buildDefine } from './tools/build-info';

export default defineConfig({ root: 'game', build: { outDir: 'dist', emptyOutDir: true }, server: { port: 5200 }, define: buildDefine(new URL('.', import.meta.url).pathname) });
