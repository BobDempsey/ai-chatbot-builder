/**
 * Anonymous sessions: the only identity this app has.
 *
 * The first request mints a session and a workspace, and the id rides in an
 * httpOnly cookie so page scripts cannot read it. Every later request resolves
 * that cookie to a session and sets `request.acb_session`, which is the claim
 * the row-level security policies compare against. A request that skips this
 * middleware sees no rows at all, which is the failure mode we want.
 *
 * The store is injected. Tests drive the whole path with an in-memory one, so
 * the session rules are checked without a database or a network.
 */
import { SESSION_COOKIE, SESSION_TTL_MS } from '@acb/schemas';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

export interface SessionRecord {
  id: string;
  expiresAt: Date;
}

export interface SessionStore {
  /** The live session with this id, or null when it is unknown or expired. */
  find(id: string): Promise<SessionRecord | null>;
  /** Creates a session and seeds its workspace. */
  create(): Promise<SessionRecord>;
  /**
   * Runs `work` with the database claim set to this session, so every query
   * inside it is filtered by the row-level policies.
   */
  withSession<T>(id: string, work: () => Promise<T>): Promise<T>;
}

declare module 'hono' {
  interface ContextVariableMap {
    session: SessionRecord;
  }
}

/** True in production, where the cookie must not travel over plain HTTP. */
const isSecure = (c: Context) => new URL(c.req.url).protocol === 'https:';

export function sessionMiddleware(store: SessionStore): MiddlewareHandler {
  return async (c, next) => {
    const cookie = getCookie(c, SESSION_COOKIE);
    const existing = cookie ? await store.find(cookie) : null;
    // An unknown or expired cookie is not an error for a visitor: they simply
    // get a new workspace, seeded and clean.
    const session = existing ?? (await store.create());

    if (!existing) {
      setCookie(c, SESSION_COOKIE, session.id, {
        httpOnly: true,
        secure: isSecure(c),
        sameSite: 'Lax',
        path: '/',
        maxAge: Math.floor(SESSION_TTL_MS / 1000),
      });
    }

    c.set('session', session);
    await store.withSession(session.id, async () => {
      await next();
    });
  };
}
