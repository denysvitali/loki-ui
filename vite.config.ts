import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/loki-ui/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    // 222 KB gzipped is fine for v0.1; the Vite warning fires on the
    // minified (pre-gzip) size. Our actual budget (PLAN §2.2) is 400 KB
    // gzipped initial, which we're well under.
    chunkSizeWarningLimit: 900,
  },
});
