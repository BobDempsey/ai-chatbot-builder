/**
 * The daily sweep: the one route no visitor calls.
 *
 * Vercel Cron issues a plain GET and proves itself with
 * `Authorization: Bearer $CRON_SECRET`, so that header is the whole gate. It is
 * mounted above the session middleware on purpose: a sweep that minted a
 * session would create a workspace on every run, and the row it deleted would
 * be replaced by one of its own.
 *
 * Without a secret configured the route refuses everything rather than running
 * open. A deployment missing the variable loses its sweep, which is a storage
 * bill; a deployment answering an unauthenticated delete loses workspaces.
 */
import { Hono } from 'hono';
import type { SessionStore } from '../session';

export const SWEEP_PATH = '/api/cron/sweep';

function authorized(header: string | undefined, secret: string): boolean {
  const offered = header?.startsWith('Bearer ') ? header.slice(7) : '';
  // Lengths differ freely here: the secret is not a user's, and a timing
  // comparison over an unequal length tells an attacker nothing either way.
  return offered.length > 0 && offered === secret;
}

export function cronRoutes(sessions: SessionStore, secret: string | undefined) {
  const routes = new Hono();

  routes.get(SWEEP_PATH, async (c) => {
    if (!secret || !authorized(c.req.header('authorization'), secret)) {
      return c.json({ error: 'That request is not authorized.' }, 401);
    }
    return c.json({ swept: await sessions.sweepExpired() });
  });

  return routes;
}
