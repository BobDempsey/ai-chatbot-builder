/**
 * The session rules, driven through a real Hono app with an in-memory store:
 * minting, reuse, expiry, and the cross-session 404 that isolation depends on.
 */
import { SESSION_COOKIE } from '@acb/schemas';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from './memory-store';
import { sessionMiddleware } from './session';

function app(store: MemoryStore) {
  const api = new Hono();
  api.use('*', sessionMiddleware(store));
  api.get('/api/documents', (c) => c.json({ documents: store.visible('document') }));
  api.get('/api/documents/:id', (c) => {
    const found = store.visible('document').find((row) => row.id === c.req.param('id'));
    // Another session's row is indistinguishable from one that never existed.
    return found ? c.json(found) : c.json({ error: 'Not found.' }, 404);
  });
  api.get('/api/session', (c) => c.json({ id: c.get('session').id }));
  return api;
}

const cookieOf = (response: Response) => response.headers.get('set-cookie') ?? '';
const cookieValue = (cookie: string) => cookie.split(';')[0] ?? '';

describe('anonymous sessions', () => {
  it('mints a session on the first request and reuses it on the second', async () => {
    const store = new MemoryStore();
    const api = app(store);

    const first = await api.request('/api/session');
    const cookie = cookieOf(first);
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    const firstId = ((await first.json()) as { id: string }).id;

    const second = await api.request('/api/session', { headers: { cookie: cookieValue(cookie) } });
    expect(((await second.json()) as { id: string }).id).toBe(firstId);
    expect(cookieOf(second)).toBe('');
  });

  it('seeds the workspace, so the first view is never empty', async () => {
    const store = new MemoryStore();
    const response = await app(store).request('/api/documents');
    const body = (await response.json()) as { documents: unknown[] };
    expect(body.documents.length).toBeGreaterThan(0);
  });

  it('starts fresh when the cookie names an expired session', async () => {
    const store = new MemoryStore();
    const api = app(store);

    const first = await api.request('/api/session');
    const cookie = cookieValue(cookieOf(first));
    const firstId = ((await first.json()) as { id: string }).id;
    store.expire(firstId);

    const second = await api.request('/api/session', { headers: { cookie } });
    const secondId = ((await second.json()) as { id: string }).id;
    expect(secondId).not.toBe(firstId);
    expect(cookieOf(second)).toContain(`${SESSION_COOKIE}=`);
  });

  it('refuses cross-session access with a 404, revealing nothing', async () => {
    const store = new MemoryStore();
    const api = app(store);

    const a = await api.request('/api/session');
    const aCookie = cookieValue(cookieOf(a));
    const aId = ((await a.json()) as { id: string }).id;

    const b = await api.request('/api/session');
    const bCookie = cookieValue(cookieOf(b));
    const bId = ((await b.json()) as { id: string }).id;

    const bDocument = store.rowOf(bId, 'document') as string;
    const crossRead = await api.request(`/api/documents/${bDocument}`, { headers: { cookie: aCookie } });
    expect(crossRead.status).toBe(404);

    const aDocument = store.rowOf(aId, 'document') as string;
    const ownRead = await api.request(`/api/documents/${aDocument}`, { headers: { cookie: aCookie } });
    expect(ownRead.status).toBe(200);

    // And each session's listing holds only its own rows.
    const aList = (await (await api.request('/api/documents', { headers: { cookie: aCookie } })).json()) as {
      documents: { sessionId: string }[];
    };
    const bList = (await (await api.request('/api/documents', { headers: { cookie: bCookie } })).json()) as {
      documents: { sessionId: string }[];
    };
    expect(aList.documents.every((row) => row.sessionId === aId)).toBe(true);
    expect(bList.documents.every((row) => row.sessionId === bId)).toBe(true);
  });

  it('sees nothing when no claim is in force', () => {
    const store = new MemoryStore();
    expect(store.visible()).toEqual([]);
  });
});
