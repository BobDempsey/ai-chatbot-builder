import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * `/api` goes to the API on 5180, overridable with `ACB_API`.
 *
 * `base` is what lets the landing page and the dashboard share one domain: the
 * deploy copies this build to `dist/dashboard`, and without it every asset URL
 * would point at the root and load the landing page instead. It applies in
 * development too, so `pnpm dev:dashboard` serves at
 * `http://localhost:5181/dashboard/` rather than at the root.
 */
export default defineConfig({
  base: '/dashboard/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': { target: process.env.ACB_API ?? 'http://localhost:5180', changeOrigin: true } },
  },
  test: { environment: 'jsdom', globals: true },
});
