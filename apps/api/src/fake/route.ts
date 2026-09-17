/**
 * The phase 0 stand-in for the real answer route.
 *
 * Slices B and C build the dashboard and the widget against this, so neither
 * waits on slice A. It satisfies the same schemas, streams the same events at a
 * human pace, and returns canned documents, conversations and ratings, so every
 * screen has something to draw. There is no database and no model behind it.
 *
 * It is deleted at integration (task 7.2). Nothing here should grow logic worth
 * keeping: if a front end needs behavior this cannot fake, that is a sign the
 * contract in `@acb/schemas` is missing something.
 */
import {
  type ChatEvent,
  type Citation,
  chatRequestSchema,
  type Conversation,
  DEFAULT_BOT_SETTINGS,
  DEMO_DATA_LABEL,
  type Doc,
  handoffRequestSchema,
  MAX_BODY_BYTES,
  rateRequestSchema,
  type RatingSummary,
  type UnansweredQuestion,
} from '@acb/schemas';
import { Hono } from 'hono';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const CITATIONS: Citation[] = [
  { index: 1, documentId: id(1), documentTitle: 'Refunds and cancellations', section: 'The 30 day window', chunkId: id(11) },
  { index: 2, documentId: id(2), documentTitle: 'Billing basics', section: 'Changing a plan', chunkId: id(12) },
];

const ANSWER = [
  'Northwind Cloud refunds any plan within **30 days** of the charge. [1]\n\n',
  'After that the plan stays active until the end of the billing period, and no further charge is made. [2]\n\n',
  '| Plan | Refund window |\n| --- | ---: |\n| Monthly | 30 days |\n| Annual | 30 days |\n',
];

const DOCUMENTS: Doc[] = [
  {
    id: id(1),
    title: 'Refunds and cancellations',
    source: 'markdown',
    reference: `${DEMO_DATA_LABEL}: Northwind Cloud help center`,
    state: 'ready',
    chunkCount: 12,
    seeded: true,
    createdAt: '2026-09-17T09:00:00.000Z',
  },
  {
    id: id(2),
    title: 'Billing basics',
    source: 'markdown',
    reference: `${DEMO_DATA_LABEL}: Northwind Cloud help center`,
    state: 'ready',
    chunkCount: 9,
    seeded: true,
    createdAt: '2026-09-17T09:00:00.000Z',
  },
];

const CONVERSATIONS: Conversation[] = [
  {
    id: id(20),
    surface: 'widget',
    startedAt: '2026-09-17T10:15:00.000Z',
    messages: [
      { id: id(21), role: 'user', content: 'How do I cancel?', citations: [], createdAt: '2026-09-17T10:15:01.000Z' },
      {
        id: id(22),
        role: 'assistant',
        content: 'You can cancel from Billing, and a refund is available within 30 days. [1]',
        citations: [CITATIONS[0] as Citation],
        rating: 'up',
        createdAt: '2026-09-17T10:15:04.000Z',
      },
    ],
  },
];

const UNANSWERED: UnansweredQuestion[] = [
  { id: id(30), question: 'Do you support SAML single sign-on?', email: 'ada@example.com', askedAt: '2026-09-17T11:02:00.000Z' },
  { id: id(31), question: 'What is your uptime guarantee?', askedAt: '2026-09-17T11:40:00.000Z' },
];

const RATINGS: RatingSummary = { up: 14, down: 3 };

const encoder = new TextEncoder();
const line = (event: ChatEvent) => encoder.encode(`${JSON.stringify(event)}\n`);

/** How long between streamed chunks. Zero in tests, so they do not wait. */
export interface FakeOptions {
  delayMs?: number;
}

export function createFakeApi({ delayMs = 120 }: FakeOptions = {}) {
  const api = new Hono();

  api.get('/api/bot', (c) => c.json({ ...DEFAULT_BOT_SETTINGS, id: id(40), publicId: id(41) }));
  api.get('/api/documents', (c) => c.json({ documents: DOCUMENTS }));
  api.get('/api/conversations', (c) => c.json({ conversations: CONVERSATIONS }));
  api.get('/api/unanswered', (c) => c.json({ questions: UNANSWERED }));
  api.get('/api/ratings', (c) => c.json(RATINGS));

  api.post('/api/rate', async (c) => {
    const parsed = rateRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'That rating could not be read.' }, 400);
    return c.json({ ok: true });
  });

  api.post('/api/handoff', async (c) => {
    const parsed = handoffRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'That email address does not look right.' }, 400);
    return c.json({ ok: true });
  });

  api.post('/api/chat', async (c) => {
    const raw = await c.req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return c.json({ error: 'That conversation is too long to send. Start again and ask once more.' }, 413);
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return c.json({ error: 'The question could not be read. Try sending it again.' }, 400);
    }
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Type a question first.' }, 400);

    // Anything mentioning a subject the canned corpus does not cover takes the
    // decline path, so the front ends can build that branch too.
    const declines = /sso|saml|uptime|refund policy in france/i.test(parsed.data.message);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        if (declines) {
          controller.enqueue(
            line({
              type: 'declined',
              message: 'The documents I have do not cover that. I can pass it to a person instead.',
              questionId: id(50),
            }),
          );
          controller.close();
          return;
        }
        for (const piece of ANSWER) {
          controller.enqueue(line({ type: 'delta', text: piece }));
          if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        controller.enqueue(line({ type: 'citations', citations: CITATIONS }));
        controller.enqueue(line({ type: 'done', messageId: id(51) }));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
    });
  });

  return api;
}
