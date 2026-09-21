/**
 * The sweep: who may call it, what it deletes, and what it must leave alone.
 *
 * It runs through a real Hono app over the in-memory store, so the route, the
 * bearer gate and the deletion are all exercised without a database. The rule
 * the last two tests protect is the one that costs real data if it breaks: a
 * live workspace is never swept, and the sweep never mints one of its own.
 */
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from './memory-store';
import { cronRoutes, SWEEP_PATH } from './routes/cron';
import { sessionMiddleware } from './session';

const SECRET = 'cron-secret';

/** `null` stands for a deployment that set no variable, which `undefined` cannot: it would take the default. */
function app(store: MemoryStore, secret: string | null = SECRET) {
  const api = new Hono();
  api.route('/', cronRoutes(store, secret ?? undefined));
  api.use('*', sessionMiddleware(store));
  api.get('/api/session', (c) => c.json({ id: c.get('session').id }));
  api.get('/api/documents', (c) => c.json({ documents: store.visible('document') }));
  return api;
}

const cookieValue = (response: Response) => (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

const sweep = (api: Hono, token = SECRET) => api.request(SWEEP_PATH, { headers: { authorization: `Bearer ${token}` } });

describe('the daily sweep', () => {
  it('refuses a request carrying no secret, the wrong secret, or a bare token', async () => {
    const api = app(new MemoryStore());

    expect((await api.request(SWEEP_PATH)).status).toBe(401);
    expect((await sweep(api, 'wrong')).status).toBe(401);
    expect((await api.request(SWEEP_PATH, { headers: { authorization: SECRET } })).status).toBe(401);
  });

  it('refuses everything when the deployment configured no secret', async () => {
    // A missing variable must not leave an unauthenticated delete answering.
    const api = app(new MemoryStore(), null);
    expect((await sweep(api)).status).toBe(401);
  });

  it('deletes an expired workspace and its rows', async () => {
    const store = new MemoryStore();
    const api = app(store);

    const first = await api.request('/api/session');
    const id = ((await first.json()) as { id: string }).id;
    expect(store.rowOf(id, 'document')).toBeDefined();
    store.expire(id);

    const response = await sweep(api);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ swept: 1 });
    expect(store.rowOf(id, 'document')).toBeUndefined();
  });

  it('leaves a live session untouched and mints none of its own', async () => {
    const store = new MemoryStore();
    const api = app(store);

    const live = await api.request('/api/session');
    const cookie = cookieValue(live);
    const liveId = ((await live.json()) as { id: string }).id;

    const expired = await api.request('/api/session');
    store.expire(((await expired.json()) as { id: string }).id);

    const response = await sweep(api);
    expect(await response.json()).toEqual({ swept: 1 });
    // The sweep carried no cookie, so it must not have been handed one.
    expect(response.headers.get('set-cookie')).toBeNull();

    const after = await api.request('/api/session', { headers: { cookie } });
    expect(((await after.json()) as { id: string }).id).toBe(liveId);
    const documents = (await (await api.request('/api/documents', { headers: { cookie } })).json()) as {
      documents: unknown[];
    };
    expect(documents.documents.length).toBeGreaterThan(0);
  });
});
