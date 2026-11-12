import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run stage`        → live dev server for rehearsals
// `npm run stage:build`  → ONE self-contained dist-stage/index.html (fonts, logo, code all inlined)
//                          that opens by double-click with no internet and no server.
export default defineConfig(({ command }) => ({
  root: 'stage',
  base: './',
  plugins: [react(), ...(command === 'build' ? [viteSingleFile()] : [])],
  build: {
    outDir: '../dist-stage',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
  },
  server: { fs: { allow: ['..'] } },
}));
