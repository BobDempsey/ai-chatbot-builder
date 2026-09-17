/**
 * The screens the owner reads back: bot settings, the conversation log, the
 * ratings summary and the questions the bot could not answer.
 *
 * All of these are same-origin and cookie-bound. A widget carrying a public bot
 * id reaches none of them, which is the whole reason the chat route is split
 * out from this file.
 */
import { botSettingsSchema, handoffRequestSchema, rateRequestSchema } from '@acb/schemas';
import { Hono } from 'hono';
import type { ApiDeps } from './deps';

export function workspaceRoutes(deps: ApiDeps) {
  const routes = new Hono();

  routes.get('/api/bot', async (c) => {
    const bot = await deps.store.getBot(c.get('session').id);
    if (!bot) return c.json({ error: 'That workspace has no bot yet.' }, 404);
    return c.json(bot);
  });

  routes.put('/api/bot', async (c) => {
    const parsed = botSettingsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Those settings could not be saved.' }, 400);
    }
    return c.json(await deps.store.updateBot(c.get('session').id, parsed.data));
  });

  routes.get('/api/conversations', async (c) => {
    return c.json({ conversations: await deps.store.listConversations(c.get('session').id) });
  });

  routes.get('/api/ratings', async (c) => c.json(await deps.store.ratingSummary(c.get('session').id)));

  routes.get('/api/unanswered', async (c) => {
    return c.json({ questions: await deps.store.listUnanswered(c.get('session').id) });
  });

  routes.post('/api/rate', async (c) => {
    const parsed = rateRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'That rating could not be read.' }, 400);
    const rated = await deps.store.rateMessage(c.get('session').id, parsed.data.messageId, parsed.data.rating);
    // A message belonging to another session is indistinguishable from one that
    // does not exist, which is the answer we want to give either way.
    if (!rated) return c.json({ error: 'That message does not exist.' }, 404);
    return c.json({ ok: true });
  });

  routes.post('/api/handoff', async (c) => {
    const parsed = handoffRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'That email address does not look right.' }, 400);
    const attached = await deps.store.attachHandoffEmail(c.get('session').id, parsed.data.questionId, parsed.data.email);
    if (!attached) return c.json({ error: 'That question does not exist.' }, 404);
    return c.json({ ok: true });
  });

  return routes;
}
