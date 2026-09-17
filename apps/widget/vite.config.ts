import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * `/api` goes to the phase 0 fake on 5180 in development. Slices B and C never
 * point at a real API until integration replaces the fake.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': { target: process.env.ACB_API ?? 'http://localhost:5180', changeOrigin: true } },
  },
  test: { environment: 'jsdom', globals: true },
});
