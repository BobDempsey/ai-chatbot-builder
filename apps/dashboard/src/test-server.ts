/**
 * A stand-in server for the dashboard's own tests.
 *
 * It answers the same routes as the phase 0 fake in `apps/api`, with the same
 * canned material, and every response is built from `@acb/schemas` so a contract
 * change breaks these tests rather than the browser. It exists because the
 * tests need a backend they can drive: a document that advances a state per
 * poll, a save that comes back rejected, a decline followed by a captured
 * email. A process on port 5180 cannot be steered like that from inside a test.
 *
 * It also answers the writes the phase 0 fake does not implement yet: saving
 * settings, the three upload forms and the corpus picker. Those routes are the
 * dashboard's proposal to slice A, and integration reconciles them.
 */
import {
  type Bot,
  type ChatEvent,
  type Citation,
  type Conversation,
  DEFAULT_BOT_SETTINGS,
  DEMO_DATA_LABEL,
  type Doc,
  type DocumentState,
  type RatingSummary,
  type UnansweredQuestion,
} from '@acb/schemas';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const CITATIONS: Citation[] = [
  { index: 1, documentId: id(1), documentTitle: 'Refunds and cancellations', section: 'The 30 day window', chunkId: id(11) },
  { index: 2, documentId: id(2), documentTitle: 'Billing basics', section: 'Changing a plan', chunkId: id(12) },
];

const ANSWER = [
  'Northwind Cloud refunds any plan within **30 days** of the charge. [1]\n\n',
  'After that the plan stays active until the end of the billing period. [2]\n\n',
  // A table, because the accessibility check needs one on screen and because
  // it is the shape most likely to break a narrow layout.
  '| Plan | Refund window |\n| --- | ---: |\n| Monthly | 30 days |\n| Annual | 30 days |\n',
];

const DECLINE = 'The documents I have do not cover that. I can pass it to a person instead.';

function seedDocuments(): Doc[] {
  return [
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
  ];
}

function seedConversations(): Conversation[] {
  return [
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
          createdAt: '2026-09-17T10:15:04.000Z',
        },
      ],
    },
  ];
}

/** The states a freshly uploaded document walks through, one per poll. */
const PROGRESSION: DocumentState[] = ['queued', 'embedding', 'ready'];

export interface TestServer {
  bot: Bot;
  documents: Doc[];
  conversations: Conversation[];
  ratings: RatingSummary;
  unanswered: UnansweredQuestion[];
  /** Every request made, newest last, as `METHOD /path`. */
  calls: string[];
  /** Set to make the next settings save come back refused. */
  rejectSave: string | null;
  /** Bodies posted, keyed by path, so a test can check what was sent. */
  posted: Record<string, unknown>;
  restore: () => void;
}

export function installTestServer(): TestServer {
  const state: TestServer = {
    bot: { ...DEFAULT_BOT_SETTINGS, id: id(40), publicId: id(41) },
    documents: seedDocuments(),
    conversations: seedConversations(),
    ratings: { up: 4, down: 1 },
    unanswered: [],
    calls: [],
    rejectSave: null,
    posted: {},
    restore: () => {
      globalThis.fetch = original;
    },
  };

  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    const method = init?.method ?? 'GET';
    state.calls.push(`${method} ${path}`);
    const body = readBody(init);
    if (body !== undefined) state.posted[path] = body;
    return route(state, method, path, body, init);
  }) as typeof fetch;

  return state;
}

function readBody(init?: RequestInit): unknown {
  if (typeof init?.body !== 'string') return undefined;
  try {
    return JSON.parse(init.body);
  } catch {
    return undefined;
  }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function route(state: TestServer, method: string, path: string, body: unknown, init?: RequestInit): Response {
  if (method === 'GET' && path === '/api/bot') return json(state.bot);

  if (method === 'PUT' && path === '/api/bot') {
    if (state.rejectSave) return json({ error: state.rejectSave }, 400);
    state.bot = { ...state.bot, ...(body as object) };
    return json(state.bot);
  }

  if (method === 'GET' && path === '/api/documents') {
    // Each read advances anything still indexing, which is what gives the
    // progress view something honest to draw between polls.
    state.documents = state.documents.map(advance);
    return json({ documents: state.documents });
  }

  if (method === 'POST' && path === '/api/documents/markdown') {
    const upload = body as { title: string };
    return json(accept(state, upload.title, 'markdown', `${upload.title}.md`));
  }

  if (method === 'POST' && path === '/api/documents/url') {
    const upload = body as { url: string };
    return json(accept(state, upload.url, 'url', upload.url));
  }

  if (method === 'POST' && path === '/api/documents/pdf') {
    const file = init?.body instanceof FormData ? init.body.get('file') : null;
    const name = file instanceof File ? file.name : 'upload.pdf';
    return json(accept(state, name, 'pdf', name));
  }

  if (method === 'POST' && path === '/api/corpus') {
    state.documents = seedDocuments();
    return json({ documents: state.documents });
  }

  if (method === 'GET' && path === '/api/conversations') return json({ conversations: state.conversations });
  if (method === 'GET' && path === '/api/unanswered') return json({ questions: state.unanswered });
  if (method === 'GET' && path === '/api/ratings') return json(state.ratings);

  if (method === 'POST' && path === '/api/rate') {
    const request = body as { messageId: string; rating: 'up' | 'down' };
    state.ratings = {
      up: state.ratings.up + (request.rating === 'up' ? 1 : 0),
      down: state.ratings.down + (request.rating === 'down' ? 1 : 0),
    };
    return json({ ok: true });
  }

  if (method === 'POST' && path === '/api/handoff') {
    const request = body as { questionId: string; email: string };
    state.unanswered = state.unanswered.map((question) =>
      question.id === request.questionId ? { ...question, email: request.email } : question,
    );
    return json({ ok: true });
  }

  if (method === 'POST' && path === '/api/chat') {
    const request = body as { message: string };
    const declines = /sso|saml|uptime/i.test(request.message);
    if (declines) {
      state.unanswered = [...state.unanswered, { id: id(50), question: request.message, askedAt: '2026-09-17T12:00:00.000Z' }];
    }
    return ndjson(declines ? [{ type: 'declined', message: DECLINE, questionId: id(50) }] : answerEvents());
  }

  return json({ error: `Nothing serves ${method} ${path}.` }, 404);
}

function answerEvents(): ChatEvent[] {
  return [
    ...ANSWER.map((text) => ({ type: 'delta', text }) as ChatEvent),
    { type: 'citations', citations: CITATIONS },
    { type: 'done', messageId: id(51) },
  ];
}

function accept(state: TestServer, title: string, source: Doc['source'], reference: string): Doc {
  const document: Doc = {
    id: id(60 + state.documents.length),
    title,
    source,
    reference,
    state: 'queued',
    chunkCount: 0,
    seeded: false,
    createdAt: '2026-09-17T12:00:00.000Z',
  };
  state.documents = [document, ...state.documents];
  return document;
}

function advance(document: Doc): Doc {
  const next = PROGRESSION[PROGRESSION.indexOf(document.state) + 1];
  if (document.state === 'ready' || document.state === 'failed' || !next) return document;
  return { ...document, state: next, chunkCount: next === 'ready' ? 7 : 0 };
}

/** The stream the answer route returns, as newline-delimited JSON with no pauses. */
function ndjson(events: ChatEvent[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
}
