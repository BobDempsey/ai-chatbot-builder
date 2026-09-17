/**
 * The whole request path, driven with a fake model, a fake embedding client and
 * an in-memory workspace. No API key, no database and no network are involved,
 * which is the point of injecting all three.
 *
 * What these cover: the three upload sources and their refusals, seeding, the
 * doc-set picker, template immutability, retrieval scoping, citations,
 * streaming, the decline and handoff path, the caps and the failure sentences.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  chatEventSchema,
  DEMO_DATA_LABEL,
  MAX_BODY_BYTES,
  MAX_DOCUMENTS_PER_SESSION,
  MAX_MESSAGE_CHARS,
  MAX_QUESTIONS_PER_WINDOW,
  MAX_UPLOAD_BYTES,
  SESSION_COOKIE,
  type ChatEvent,
  type Doc,
} from '@acb/schemas';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApi } from '../app';
import { UnreadableSourceError, extractPdfText } from '../ingest/sources';
import { MemoryWorkspaceStore } from '../store/memory';
import { MemorySessionStore } from '../store/sessions';
import { loadTemplates } from '../templates';
import { createFakeAnswerModel, createFakeEmbeddingClient } from '../testing';
import type { ApiDeps } from './deps';

const SAMPLE_PDF = readFileSync(join(import.meta.dirname, '..', 'ingest', 'fixtures', 'sample.pdf'));

interface Harness {
  api: ReturnType<typeof createApi>;
  store: MemoryWorkspaceStore;
  model: ReturnType<typeof createFakeAnswerModel>;
  embeddings: ReturnType<typeof createFakeEmbeddingClient>;
  deps: ApiDeps;
  /** Waits for every indexing job the routes started. */
  settle: () => Promise<void>;
}

async function harness(overrides: Partial<ApiDeps> = {}): Promise<Harness> {
  const store = new MemoryWorkspaceStore();
  const embeddings = createFakeEmbeddingClient();
  const model = createFakeAnswerModel();
  await loadTemplates(store, embeddings);

  const jobs: Promise<unknown>[] = [];
  const deps: ApiDeps = {
    store,
    embeddings,
    model,
    // The fake embedding client is lexical, so its distances sit higher than
    // the real model's. This floor separates the questions used below; the
    // production default is calibrated separately against the real model.
    retrieval: { floor: 0.78 },
    extractPdf: extractPdfText,
    fetchUrl: async () => ({ title: 'Fetched page', text: '# Fetched page\n\nOur widget ships in 3 days.' }),
    schedule: (work) => {
      jobs.push(work());
    },
    ...overrides,
  };
  return {
    api: createApi(deps, new MemorySessionStore(store)),
    store,
    model,
    embeddings,
    deps,
    settle: async () => {
      await Promise.all(jobs);
    },
  };
}

/** A cookie jar of one, which is all a session needs. */
class Visitor {
  cookie = '';

  constructor(private readonly api: ReturnType<typeof createApi>) {}

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set('cookie', this.cookie);
    const response = await this.api.request(path, { ...init, headers });
    const set = response.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0] as string;
    return response;
  }

  async json(path: string, body: unknown, method = 'POST'): Promise<Response> {
    return this.request(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }

  async ask(message: string): Promise<{ events: ChatEvent[]; response: Response }> {
    const response = await this.json('/api/chat', { message });
    return { events: parseEvents(await response.text()), response };
  }
}

function parseEvents(body: string): ChatEvent[] {
  return body
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => chatEventSchema.parse(JSON.parse(line)));
}

let world: Harness;
let visitor: Visitor;

beforeEach(async () => {
  world = await harness();
  visitor = new Visitor(world.api);
});

describe('seeding', () => {
  it('answers a seeded question with citations before anything is uploaded', async () => {
    const { events } = await visitor.ask('How long do I have to ask for a refund?');
    const citations = events.find((event) => event.type === 'citations');
    expect(events.some((event) => event.type === 'delta')).toBe(true);
    expect(citations?.type === 'citations' && citations.citations.length).toBeGreaterThan(0);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('fills every screen on first view', async () => {
    const documents = (await (await visitor.request('/api/documents')).json()) as { documents: Doc[] };
    expect(documents.documents.length).toBeGreaterThan(0);
    expect(documents.documents.every((doc) => doc.seeded && doc.state === 'ready')).toBe(true);
    expect(documents.documents[0]?.reference).toContain(DEMO_DATA_LABEL);

    const conversations = (await (await visitor.request('/api/conversations')).json()) as { conversations: unknown[] };
    expect(conversations.conversations.length).toBeGreaterThan(0);
    expect(await (await visitor.request('/api/ratings')).json()).toMatchObject({ up: 1 });
    const unanswered = (await (await visitor.request('/api/unanswered')).json()) as { questions: unknown[] };
    expect(unanswered.questions.length).toBeGreaterThan(0);
  });

  it('leaves the template intact when a session clears its own workspace', async () => {
    await visitor.request('/api/documents');
    await world.store.setCorpus(await sessionOf(visitor), 'recipes');

    const next = new Visitor(world.api);
    const documents = (await (await next.request('/api/documents')).json()) as { documents: Doc[] };
    const titles = documents.documents.map((doc) => doc.title);
    expect(titles).toContain('Refunds and cancellations');
  });
});

async function sessionOf(who: Visitor): Promise<string> {
  await who.request('/api/documents');
  return decodeURIComponent(who.cookie.replace(`${SESSION_COOKIE}=`, ''));
}

describe('the doc-set picker', () => {
  it('replaces the seeded documents and changes what the bot answers', async () => {
    const before = await visitor.ask('What temperature does jam set at?');
    expect(before.events[0]?.type).toBe('declined');

    const swapped = (await visitor.json('/api/corpus', { corpus: 'recipes' })) as Response;
    const body = (await swapped.json()) as { documents: Doc[] };
    expect(body.documents.map((doc) => doc.title)).toContain('Preserves');
    expect(body.documents.map((doc) => doc.title)).not.toContain('Refunds and cancellations');

    const after = await visitor.ask('What temperature does jam set at?');
    expect(after.events.some((event) => event.type === 'delta')).toBe(true);
  });

  it('refuses a set that does not exist', async () => {
    const response = await visitor.json('/api/corpus', { corpus: 'astrology' });
    expect(response.status).toBe(400);
  });
});

describe('uploads', () => {
  it('indexes a pasted Markdown document and answers from it', async () => {
    const response = await visitor.json('/api/documents/markdown', {
      title: 'Warranty',
      markdown: '# Warranty\n\n## Length\n\nEvery Tuppence lamp carries a 7 year warranty.',
    });
    expect(response.status).toBe(202);
    const created = (await response.json()) as Doc;
    expect(created.state).toBe('queued');

    await world.settle();
    const ready = (await (await visitor.request(`/api/documents/${created.id}`)).json()) as Doc;
    expect(ready.state).toBe('ready');
    expect(ready.chunkCount).toBeGreaterThan(0);
  });

  it('extracts text from an uploaded PDF', async () => {
    const form = new FormData();
    form.set('file', new File([new Uint8Array(SAMPLE_PDF)], 'refunds.pdf', { type: 'application/pdf' }));
    const response = await visitor.request('/api/documents/pdf', { method: 'POST', body: form });
    expect(response.status).toBe(202);
    await world.settle();

    const created = (await response.json()) as Doc;
    const ready = (await (await visitor.request(`/api/documents/${created.id}`)).json()) as Doc;
    expect(ready.title).toBe('refunds');
    expect(ready.state).toBe('ready');
  });

  it('rejects an oversized upload and names the limit', async () => {
    const response = await visitor.json('/api/documents/markdown', { title: 'Big', markdown: 'x'.repeat(5_000_001) });
    expect(response.status).toBe(413);
    expect(((await response.json()) as { error: string }).error).toContain('5 MB');
  });

  it('rejects an oversized PDF before reading it, naming the limit', async () => {
    const form = new FormData();
    form.set('file', new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'huge.pdf', { type: 'application/pdf' }));
    const before = world.embeddings.calls;
    const response = await visitor.request('/api/documents/pdf', { method: 'POST', body: form });
    expect(response.status).toBe(413);
    expect(((await response.json()) as { error: string }).error).toContain('5 MB');
    expect(world.embeddings.calls).toBe(before);
  });

  it('rejects an unfetchable URL without creating a document', async () => {
    const failing = await harness({
      fetchUrl: async () => {
        throw new UnreadableSourceError('That page could not be reached. Check the address and try again.');
      },
    });
    const who = new Visitor(failing.api);
    const before = (await (await who.request('/api/documents')).json()) as { documents: Doc[] };

    const response = await who.json('/api/documents/url', { url: 'https://example.invalid/help' });
    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: string }).error).toContain('could not be reached');

    const after = (await (await who.request('/api/documents')).json()) as { documents: Doc[] };
    expect(after.documents).toHaveLength(before.documents.length);
  });

  it('refuses once the session holds its maximum documents, naming the limit', async () => {
    while ((await world.store.countDocuments(await sessionOf(visitor))) < MAX_DOCUMENTS_PER_SESSION) {
      await world.store.createDocument(await sessionOf(visitor), {
        title: 'Filler',
        source: 'markdown',
        reference: 'Pasted Markdown',
      });
    }
    const before = world.embeddings.calls;
    const response = await visitor.json('/api/documents/markdown', { title: 'One more', markdown: '# One more\n\nText.' });
    expect(response.status).toBe(429);
    expect(((await response.json()) as { error: string }).error).toContain(String(MAX_DOCUMENTS_PER_SESSION));
    // The refusal happens before anything is embedded.
    expect(world.embeddings.calls).toBe(before);
  });
});

describe('retrieval and citations', () => {
  it('never returns chunks belonging to another session', async () => {
    const other = new Visitor(world.api);
    await other.json('/api/corpus', { corpus: 'recipes' });

    const { events } = await visitor.ask('What temperature does jam set at?');
    expect(events[0]?.type).toBe('declined');
  });

  it('drops a citation the retrieval set does not contain', async () => {
    const inventive = await harness({ model: createFakeAnswerModel({ script: ['Refunds run 30 days. [1] Also [42].'] }) });
    const who = new Visitor(inventive.api);
    const response = await who.json('/api/chat', { message: 'How long do I have to ask for a refund?' });
    const events = parseEvents(await response.text());

    const text = events
      .filter((event): event is Extract<ChatEvent, { type: 'delta' }> => event.type === 'delta')
      .map((event) => event.text)
      .join('');
    expect(text).toContain('[1]');
    expect(text).not.toContain('[42]');

    const citations = events.find((event) => event.type === 'citations');
    expect(citations?.type === 'citations' && citations.citations).toHaveLength(1);
    expect(citations?.type === 'citations' && citations.citations[0]?.index).toBe(1);
  });

  it('holds back a half-arrived citation marker rather than streaming it raw', async () => {
    const split = await harness({ model: createFakeAnswerModel({ script: ['Refunds run 30 days. [', '1] Ask from Billing.'] }) });
    const who = new Visitor(split.api);
    const response = await who.json('/api/chat', { message: 'How long do I have to ask for a refund?' });
    const events = parseEvents(await response.text());
    const deltas = events.filter((event): event is Extract<ChatEvent, { type: 'delta' }> => event.type === 'delta');
    expect(deltas[0]?.text).not.toContain('[');
    expect(deltas.map((delta) => delta.text).join('')).toContain('[1]');
  });

  it('streams text before the answer is finished', async () => {
    const slow = await harness({ model: createFakeAnswerModel({ script: ['First part. ', 'Second part. ', '[1]'] }) });
    const who = new Visitor(slow.api);
    const response = await who.json('/api/chat', { message: 'How long do I have to ask for a refund?' });
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const first = await reader.read();
    const event = chatEventSchema.parse(JSON.parse(new TextDecoder().decode(first.value).split('\n')[0] as string));
    expect(event.type).toBe('delta');
    await reader.cancel();
  });
});

describe('the decline path', () => {
  it('declines without calling the model and logs the question', async () => {
    const { events } = await visitor.ask('Which data centre region hosts my workspace?');
    const declined = events[0];
    expect(declined?.type).toBe('declined');
    expect(world.model.calls).toBe(0);

    const list = (await (await visitor.request('/api/unanswered')).json()) as { questions: { id: string; question: string }[] };
    expect(list.questions.map((question) => question.question)).toContain('Which data centre region hosts my workspace?');

    if (declined?.type !== 'declined') throw new Error('expected a decline');
    const accepted = await visitor.json('/api/handoff', { questionId: declined.questionId, email: 'ada@example.com' });
    expect(accepted.status).toBe(200);
    const after = (await (await visitor.request('/api/unanswered')).json()) as { questions: { email?: string }[] };
    expect(after.questions.some((question) => question.email === 'ada@example.com')).toBe(true);
  });

  it('rejects a malformed email and records nothing', async () => {
    const { events } = await visitor.ask('Which data centre region hosts my workspace?');
    const declined = events[0];
    if (declined?.type !== 'declined') throw new Error('expected a decline');

    const response = await visitor.json('/api/handoff', { questionId: declined.questionId, email: 'ada@' });
    expect(response.status).toBe(400);
    const after = (await (await visitor.request('/api/unanswered')).json()) as { questions: { email?: string }[] };
    expect(after.questions.every((question) => question.email !== 'ada@')).toBe(true);
  });
});

describe('caps', () => {
  it('refuses an oversized body before parsing it and before any paid call', async () => {
    const embedCallsBefore = world.embeddings.calls;
    const response = await visitor.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(MAX_BODY_BYTES + 1),
    });
    expect(response.status).toBe(413);
    expect(world.embeddings.calls).toBe(embedCallsBefore);
    expect(world.model.calls).toBe(0);
  });

  it('refuses a question longer than the cap without calling the model', async () => {
    const response = await visitor.json('/api/chat', { message: 'x'.repeat(MAX_MESSAGE_CHARS + 1) });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain(String(MAX_MESSAGE_CHARS));
    expect(world.model.calls).toBe(0);
  });

  it('stops at the question allowance without calling the model', async () => {
    for (let i = 0; i < MAX_QUESTIONS_PER_WINDOW; i += 1) {
      await visitor.ask('How long do I have to ask for a refund?');
    }
    const callsBefore = world.model.calls;
    const response = await visitor.json('/api/chat', { message: 'How long do I have to ask for a refund?' });
    expect(response.status).toBe(429);
    expect(((await response.json()) as { error: string }).error).toContain(String(MAX_QUESTIONS_PER_WINDOW));
    expect(world.model.calls).toBe(callsBefore);
  });

  it('reports how many questions are left', async () => {
    const { response } = await visitor.ask('How long do I have to ask for a refund?');
    expect(Number(response.headers.get('x-acb-questions-remaining'))).toBe(MAX_QUESTIONS_PER_WINDOW - 1);
  });

  it('truncates replayed history and drops a failure sentence from it', async () => {
    const watched = await harness();
    const who = new Visitor(watched.api);
    await who.json('/api/chat', {
      message: 'How long do I have to ask for a refund?',
      history: [
        { role: 'user', content: 'earlier question' },
        { role: 'assistant', content: 'The assistant took too long to answer. Ask again in a moment.' },
      ],
    });
    const prompt = watched.model.prompts[0];
    expect(prompt?.history.map((turn) => turn.content)).toEqual(['earlier question']);
  });
});

describe('provider failures', () => {
  it('sends one plain sentence and records nothing when the model fails', async () => {
    const broken = await harness({ model: createFakeAnswerModel({ fault: 'timeout' }) });
    const who = new Visitor(broken.api);
    const response = await who.json('/api/chat', { message: 'How long do I have to ask for a refund?' });
    const events = parseEvents(await response.text());
    const failure = events.at(-1);
    expect(failure?.type).toBe('failure');
    expect(failure?.type === 'failure' && failure.message).toBe('The assistant took too long to answer. Ask again in a moment.');

    const log = (await (await who.request('/api/conversations')).json()) as {
      conversations: { messages: { content: string }[] }[];
    };
    const contents = log.conversations.flatMap((conversation) => conversation.messages.map((message) => message.content));
    expect(contents.some((content) => content.includes('took too long'))).toBe(false);
  });

  it('says the assistant is not set up when no key is configured', async () => {
    const unconfigured = await harness({ model: createFakeAnswerModel({ fault: 'not-configured' }) });
    const who = new Visitor(unconfigured.api);
    const response = await who.json('/api/chat', { message: 'How long do I have to ask for a refund?' });
    const failure = parseEvents(await response.text()).at(-1);
    expect(failure?.type === 'failure' && failure.message).toContain('not set up yet');

    // The rest of the app keeps working.
    expect((await who.request('/api/documents')).status).toBe(200);
  });
});

describe('two request classes', () => {
  it('answers a widget carrying a public bot id from any origin', async () => {
    const sessionId = await sessionOf(visitor);
    const bot = await world.store.getBot(sessionId);
    const response = await world.api.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://someone-elses-site.example' },
      body: JSON.stringify({ message: 'How long do I have to ask for a refund?', botId: bot?.publicId }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(parseEvents(await response.text()).some((event) => event.type === 'delta')).toBe(true);
  });

  it('gives a bot id no way to read logs, change settings or upload', async () => {
    const sessionId = await sessionOf(visitor);
    const bot = await world.store.getBot(sessionId);
    const cross = { origin: 'https://someone-elses-site.example', 'content-type': 'application/json' };

    for (const path of ['/api/conversations', '/api/unanswered', '/api/ratings', '/api/documents']) {
      expect((await world.api.request(path, { headers: cross })).status).toBe(403);
    }
    const settings = await world.api.request('/api/bot', {
      method: 'PUT',
      headers: cross,
      body: JSON.stringify({ name: 'Taken over', accentColor: '#000000', greeting: 'Hi', tone: 'neutral' }),
    });
    expect(settings.status).toBe(403);

    const upload = await world.api.request('/api/documents/markdown', {
      method: 'POST',
      headers: cross,
      body: JSON.stringify({ title: 'Injected', markdown: '# Injected\n\nText.' }),
    });
    expect(upload.status).toBe(403);
    expect((await world.store.getBot(sessionId))?.name).toBe(bot?.name);
  });

  it('gives a widget the bot appearance it needs, and nothing more', async () => {
    const sessionId = await sessionOf(visitor);
    const bot = await world.store.getBot(sessionId);
    const response = await world.api.request(`/api/bot?botId=${bot?.publicId}`, {
      headers: { origin: 'https://someone-elses-site.example' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ name: bot?.name, accentColor: bot?.accentColor, greeting: bot?.greeting });
    // The internal id and the session behind it stay on the server.
    expect(body.id).toBeUndefined();
    expect(body.sessionId).toBeUndefined();
  });

  it('refuses an unknown bot id without calling anything paid', async () => {
    const unknown = '00000000-0000-4000-8000-0000000009ff';
    const bot = await world.api.request(`/api/bot?botId=${unknown}`, { headers: { origin: 'https://elsewhere.example' } });
    expect(bot.status).toBe(404);

    // Seeding the corpus already embedded its chunks, so what matters is that
    // the refused request adds nothing to either count.
    const embeddingsBefore = world.embeddings.calls;
    const answersBefore = world.model.calls;

    const chat = await world.api.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://elsewhere.example' },
      body: JSON.stringify({ message: 'Anything at all', botId: unknown }),
    });
    expect(chat.status).toBe(404);
    expect(world.model.calls).toBe(answersBefore);
    expect(world.embeddings.calls).toBe(embeddingsBefore);
  });

  it('takes a handoff email from a widget on another origin', async () => {
    const sessionId = await sessionOf(visitor);
    const bot = await world.store.getBot(sessionId);
    const declined = await world.api.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://someone-elses-site.example' },
      body: JSON.stringify({ message: 'Do you support SAML single sign-on?', botId: bot?.publicId }),
    });
    const decline = parseEvents(await declined.text()).find((event) => event.type === 'declined');
    if (decline?.type !== 'declined') throw new Error('expected a decline');

    const handoff = await world.api.request('/api/handoff', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://someone-elses-site.example' },
      body: JSON.stringify({ questionId: decline.questionId, email: 'ada@example.com', botId: bot?.publicId }),
    });
    expect(handoff.status).toBe(200);
    expect(handoff.headers.get('access-control-allow-origin')).toBe('*');
    expect((await world.store.listUnanswered(sessionId)).some((q) => q.email === 'ada@example.com')).toBe(true);

    const malformed = await world.api.request('/api/handoff', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://someone-elses-site.example' },
      body: JSON.stringify({ questionId: decline.questionId, email: 'not-an-email', botId: bot?.publicId }),
    });
    expect(malformed.status).toBe(400);
  });
});

describe('the record', () => {
  it('logs the exchange with its citations and keeps a rating', async () => {
    const { events } = await visitor.ask('How long do I have to ask for a refund?');
    const done = events.at(-1);
    if (done?.type !== 'done') throw new Error('expected a done event');

    const rated = await visitor.json('/api/rate', { messageId: done.messageId, rating: 'down' });
    expect(rated.status).toBe(200);

    const log = (await (await visitor.request('/api/conversations')).json()) as {
      conversations: { messages: { id: string; citations: unknown[]; rating?: string }[] }[];
    };
    const message = log.conversations.flatMap((conversation) => conversation.messages).find((m) => m.id === done.messageId);
    expect(message?.citations.length).toBeGreaterThan(0);
    expect(message?.rating).toBe('down');
    expect(await (await visitor.request('/api/ratings')).json()).toMatchObject({ down: 1 });
  });

  it('refuses to rate a message belonging to another session', async () => {
    const { events } = await visitor.ask('How long do I have to ask for a refund?');
    const done = events.at(-1);
    if (done?.type !== 'done') throw new Error('expected a done event');

    const other = new Visitor(world.api);
    const response = await other.json('/api/rate', { messageId: done.messageId, rating: 'up' });
    expect(response.status).toBe(404);
  });
});
