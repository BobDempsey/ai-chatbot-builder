/**
 * The real API, assembled from its dependencies.
 *
 * Two request classes live here, and the split is the point. A widget on
 * someone else's page posts to `/api/chat` with a public bot id: that is
 * answered cross-origin and grants asking a question and nothing else. Every
 * other route is same-origin, carries the session cookie, and is where
 * settings, uploads and logs live. Loosening the cookie policy everywhere would
 * have made the permissive surface the whole API instead of one route.
 *
 * ai-frontend-advisor's same-origin check is deliberately not copied wholesale:
 * its chat only ever runs on its own site, and this one does not.
 */
import { handoffRequestSchema } from '@acb/schemas';
import { Hono } from 'hono';
import { type ChatDeps, handleChat } from './routes/chat';
import { cronRoutes } from './routes/cron';
import type { ApiDeps } from './routes/deps';
import { documentRoutes } from './routes/documents';
import { workspaceRoutes } from './routes/workspace';
import { type SessionStore, sessionMiddleware } from './session';

declare module 'hono' {
  interface ContextVariableMap {
    /** The chat body, read once and checked for size before anything parses it. */
    rawBody: string;
  }
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

/** The bot id, if this body names one, without trusting the rest of the body. */
function peekBotId(raw: string): string | null {
  try {
    const body = JSON.parse(raw) as { botId?: unknown };
    return typeof body.botId === 'string' ? body.botId : null;
  } catch {
    return null;
  }
}

export interface ApiOptions {
  /** Proves a request came from Vercel Cron. Without it the sweep refuses everything. */
  cronSecret?: string;
}

export function createApi(deps: ApiDeps, sessions: SessionStore, options: ApiOptions = {}) {
  const chatDeps: ChatDeps = {
    store: deps.store,
    embeddings: deps.embeddings,
    model: deps.model,
    ...(deps.retrieval ? { retrieval: deps.retrieval } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  };

  const api = new Hono();

  // Above the session middleware: a sweep that minted a workspace of its own
  // would undo half its work.
  api.route('/', cronRoutes(sessions, options.cronSecret));

  api.options('/api/chat', (c) => c.body(null, 204, CORS_HEADERS));

  // A body naming a public bot id is a widget on a third-party page. Anything
  // else falls through to the cookie-bound app below.
  api.post('/api/chat', async (c, next) => {
    const raw = await c.req.text();
    c.set('rawBody', raw);
    const publicId = peekBotId(raw);
    if (!publicId) return next();

    const found = await deps.store.getBotByPublicId(publicId);
    if (!found) return withCors(Response.json({ error: 'That chatbot could not be found.' }, { status: 404 }));
    return withCors(await handleChat(chatDeps, { sessionId: found.sessionId, bot: found.bot, surface: 'widget', rawBody: raw }));
  });

  // What a public bot id grants besides asking: the bot's appearance, so the
  // widget can theme itself before its first question, and the email handoff
  // that follows a decline. Both are cross-origin for the same reason the chat
  // is, and both return only what the id is allowed to reach: no session id, no
  // documents, no logs.
  api.options('/api/bot', (c) => c.body(null, 204, { ...CORS_HEADERS, 'access-control-allow-methods': 'GET, OPTIONS' }));
  api.options('/api/handoff', (c) => c.body(null, 204, CORS_HEADERS));

  api.get('/api/bot', async (c, next) => {
    const publicId = c.req.query('botId');
    if (!publicId) return next();
    const found = await deps.store.getBotByPublicId(publicId);
    if (!found) return withCors(Response.json({ error: 'That chatbot could not be found.' }, { status: 404 }));
    const { name, accentColor, greeting, tone, publicId: id } = found.bot;
    return withCors(Response.json({ publicId: id, name, accentColor, greeting, tone }));
  });

  api.post('/api/handoff', async (c, next) => {
    const raw = await c.req.text();
    c.set('rawBody', raw);
    const publicId = peekBotId(raw);
    if (!publicId) return next();

    const found = await deps.store.getBotByPublicId(publicId);
    if (!found) return withCors(Response.json({ error: 'That chatbot could not be found.' }, { status: 404 }));
    const parsed = handoffRequestSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return withCors(Response.json({ error: 'That email address does not look right.' }, { status: 400 }));
    const attached = await deps.store.attachHandoffEmail(found.sessionId, parsed.data.questionId, parsed.data.email);
    if (!attached) return withCors(Response.json({ error: 'That question could not be found.' }, { status: 404 }));
    return withCors(Response.json({ ok: true }));
  });

  const owner = new Hono();

  // A browser only sends `Origin` on cross-origin requests, so its presence
  // with a different host is the signal to refuse.
  owner.use('*', async (c, next) => {
    const origin = c.req.header('origin');
    if (origin && new URL(origin).host !== new URL(c.req.url).host) {
      return c.json({ error: 'This request has to come from the dashboard.' }, 403);
    }
    await next();
  });
  owner.use('*', sessionMiddleware(sessions));

  owner.post('/api/chat', async (c) => {
    const session = c.get('session');
    const bot = await deps.store.getBot(session.id);
    if (!bot) return c.json({ error: 'That workspace has no bot yet.' }, 404);
    const raw = c.get('rawBody') ?? (await c.req.text());
    const answer = await handleChat(chatDeps, { sessionId: session.id, bot, surface: 'preview', rawBody: raw });
    // Returning the Response as it stands would drop the Set-Cookie the session
    // middleware prepared, and every request would mint a new workspace. Handing
    // it back through the context merges those headers in.
    return c.newResponse(answer.body, answer);
  });

  owner.route('/', documentRoutes(deps));
  owner.route('/', workspaceRoutes(deps));

  api.route('/', owner);
  return api;
}
