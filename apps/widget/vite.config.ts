import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * `/api` goes to the API on 5180, overridable with `ACB_API`.
 *
 * The build emits `embed.js` and one lazily imported chat chunk beside it,
 * rather than a page, because what ships is a script tag on somebody else's
 * site. ES output is what makes the split possible: an IIFE cannot carry a
 * dynamic import, and the whole point of the entry is that the chat downloads
 * later. `index.html` stays a development harness and is not built.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: { embed: fileURLToPath(new URL('src/embed.ts', import.meta.url)) },
      output: { entryFileNames: '[name].js', chunkFileNames: 'chat-[hash].js' },
    },
  },
  server: {
    proxy: { '/api': { target: process.env.ACB_API ?? 'http://localhost:5180', changeOrigin: true } },
  },
  test: { environment: 'jsdom', globals: true },
});
