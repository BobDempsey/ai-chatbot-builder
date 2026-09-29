import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * `/api` goes to the API on 5180, overridable with `ACB_API`.
 *
 * Two pages: the landing page and `/about`, each its own HTML entry, so the
 * About page ships without the widget.
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // Production routes `/about` to `about/index.html`; Vite's dev server
      // only finds it with the trailing slash, and serves the landing page
      // for `/about`. This makes development match.
      name: 'acb-about-route',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/about' || req.url?.startsWith('/about?')) req.url = req.url.replace('/about', '/about/');
          next();
        });
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        about: resolve(import.meta.dirname, 'about/index.html'),
      },
    },
  },
  server: {
    proxy: { '/api': { target: process.env.ACB_API ?? 'http://localhost:5180', changeOrigin: true } },
  },
  test: { environment: 'jsdom', globals: true },
});
