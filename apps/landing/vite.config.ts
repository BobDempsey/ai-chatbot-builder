import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** `/api` goes to the API on 5180, overridable with `ACB_API`. */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': { target: process.env.ACB_API ?? 'http://localhost:5180', changeOrigin: true } },
  },
  test: { environment: 'jsdom', globals: true },
});
