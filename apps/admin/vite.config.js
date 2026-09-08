import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Admin web panel dev server. Proxies /api to the local backend so the panel and API share an origin
// in development (no CORS juggling).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
