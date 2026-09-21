/**
 * The one Vercel Function. The filename is an optional catch-all, so `/api`
 * and everything under it land here and Hono routes them from there. A plain
 * `api/index.ts` would answer `/api` alone and 404 `/api/chat`.
 *
 * It is deliberately thin, the way ai-frontend-advisor's is: the app is built
 * and tested in `apps/api/src` with fake clients and no key, and this file
 * only hands Vercel a handler. The handler itself is assembled one directory
 * deeper, where `hono/vercel` resolves under pnpm.
 */
export { default } from '../apps/api/src/vercel';

export const config = { runtime: 'nodejs' };
