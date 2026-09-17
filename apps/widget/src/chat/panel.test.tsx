/**
 * The panel, against a stand-in for the answer route that streams exactly what
 * the phase 0 fake streams: the same events, the same markdown, the same
 * citations, the same decline.
 *
 * The checks that matter most are the ones a later change could quietly break:
 * the answer goes through the shared `Answer` component, so the widget and the
 * dashboard's preview cannot drift apart; the conversation survives a reload;
 * sending stops at zero; and the open panel is operable by keyboard and passes
 * axe with an answer, citations and a table on screen.
 */
import type { ChatEvent } from '@acb/schemas';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPanel } from './panel';
import { clearQuota, markSpent } from './quota';
import { clearConversation, STORAGE_KEY } from './store';

const BOT_ID = '00000000-0000-4000-8000-000000000041';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const BOT = {
  id: id(40),
  publicId: id(41),
  name: 'Northwind Support',
  accentColor: '#2563eb',
  greeting: 'Hi. Ask me anything about the docs I have been given.',
  tone: 'friendly',
};

const CITATIONS = [
  { index: 1, documentId: id(1), documentTitle: 'Refunds and cancellations', section: 'The 30 day window', chunkId: id(11) },
  { index: 2, documentId: id(2), documentTitle: 'Billing basics', section: 'Changing a plan', chunkId: id(12) },
];

const ANSWER_EVENTS: ChatEvent[] = [
  { type: 'delta', text: 'Northwind Cloud refunds any plan within **30 days** of the charge. [1]\n\n' },
  { type: 'delta', text: '| Plan | Refund window |\n| --- | ---: |\n| Monthly | 30 days |\n| Annual | 30 days |\n' },
  { type: 'citations', citations: CITATIONS },
  { type: 'done', messageId: id(51) },
];

const DECLINE_EVENTS: ChatEvent[] = [
  {
    type: 'declined',
    message: 'The documents I have do not cover that. I can pass it to a person instead.',
    questionId: id(50),
  },
];

function ndjson(events: ChatEvent[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
}

interface RouteOptions {
  chat?: () => Response;
  handoff?: () => Response;
}

/** Stands in for the answer route, and records what the panel sent it. */
function serve({ chat = () => ndjson(ANSWER_EVENTS), handoff = () => Response.json({ ok: true }) }: RouteOptions = {}) {
  const sent: unknown[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.body) sent.push(JSON.parse(String(init.body)));
    if (url.includes('/api/bot')) return Response.json(BOT);
    if (url.includes('/api/handoff')) return handoff();
    if (url.includes('/api/chat')) return chat();
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { sent, fetchMock };
}

const ask = async (question: string) => {
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: question } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
};

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  clearConversation();
  clearQuota();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('answering', () => {
  it('opens with the bot name and greeting the route gives it', async () => {
    serve();
    render(<ChatPanel botId={BOT_ID} apiBase="" initialOpen />);
    expect(await screen.findByRole('heading', { name: 'Northwind Support' })).toBeTruthy();
    expect(screen.getByText(BOT.greeting)).toBeTruthy();
  });

  it('streams a cited answer and renders it through the shared component', async () => {
    const { sent } = serve();
    render(<ChatPanel botId={BOT_ID} apiBase="" initialOpen />);
    await ask('How do refunds work?');

    expect(await screen.findByText(/refunds any plan within/)).toBeTruthy();
    // The sources list and the table region both come from `Answer`, so the
    // widget cannot render an answer differently from the preview chat.
    await waitFor(() => expect(screen.getByText('Sources')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Refunds and cancellations/ })).toBeTruthy();
    const table = screen.getByRole('region', { name: 'Table' });
    expect(table.tabIndex).toBe(0);
    expect(table.className).toContain('acb:overflow-x-auto');

    // The bot is named by its public id, and no cookie is asked for.
    expect(sent.at(-1)).toMatchObject({ botId: BOT_ID, message: 'How do refunds work?' });
  });

  it('offers a person when the documents do not cover the question', async () => {
    const { sent } = serve({ chat: () => ndjson(DECLINE_EVENTS) });
    render(<ChatPanel botId={BOT_ID} apiBase="" initialOpen />);
    await ask('Do you support SAML single sign-on?');

    expect(await screen.findByText(/do not cover that/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Talk to a human'), { target: { value: 'ada@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask a person' }));

    await waitFor(() => expect(screen.getByText(/A person will follow up at ada@example.com/)).toBeTruthy());
    expect(sent.at(-1)).toMatchObject({ questionId: id(50), email: 'ada@example.com' });
  });

  it('records nothing for a malformed email address', async () => {
    const { fetchMock } = serve({ chat: () => ndjson(DECLINE_EVENTS) });
    render(<ChatPanel botId={BOT_ID} apiBase="" initialOpen />);
    await ask('What is your uptime guarantee?');
    await screen.findByText(/do not cover that/);

    const before = fetchMock.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Talk to a human'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask a person' }));

    expect((await screen.findByRole('alert')).textContent).toBe('That email address does not look right.');
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it('shows one plain sentence when the route fails, and never sends it back', async () => {
    const { sent } = serve({ chat: () => Response.json({ error: 'The assistant is not set up yet.' }, { status: 503 }) });
    render(<ChatPanel botId={BOT_ID} apiBase="" initialOpen />);
    await ask('How do refunds work?');
    expect(await screen.findByText('The assistant is not set up yet.')).toBeTruthy();

    await ask('And after that?');
    await waitFor(() => expect(sent).toHaveLength(2));
    const last = sent.at(-1) as { history: { content: string }[] };
    expect(last.history.some((turn) => turn.content.includes('not set up'))).toBe(false);
  });
});

describe('keeping the conversation across a reload', () => {
  it('shows what was said before the page reloaded', async () => {
    serve();
    const first = render(<ChatPanel botId={BOT_ID} apiBase="" initialOpen />);
    await ask('How do refunds work?');
    await screen.findByText('Sources');
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toContain('refunds');

    first.unmount();
    render(<ChatPanel botId={BOT_ID} apiBase="" initialOpen />);
    expect(await screen.findByText('How do refunds work?')).toBeTruthy();
    expect(screen.getByText(/refunds any plan within/)).toBeTruthy();
  });
});

describe('the question allowance', () => {
  it('disables sending at zero and says when to come back', async () => {
    serve();
    markSpent();
    render(<ChatPanel botId={BOT_ID} apiBase="" initialOpen />);

    expect(await screen.findByText('You have used all your questions for now. Try again in a few minutes.')).toBeTruthy();
    expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('treats a refusal from the edge as the allowance spent', async () => {
    serve({ chat: () => Response.json({ error: 'Too many questions.' }, { status: 429 }) });
    render(<ChatPanel botId={BOT_ID} apiBase="" initialOpen />);
    await ask('How do refunds work?');

    // The bot says the demo limit is reached, and the composer shuts, so the
    // next question never leaves the page.
    expect(await screen.findByText('You have reached the demo limit for now. Try again in a few minutes.')).toBeTruthy();
    expect(screen.getByText('You have used all your questions for now. Try again in a few minutes.')).toBeTruthy();
    expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).disabled).toBe(true);
  });
});

describe('keyboard and screen reader', () => {
  it('opens from the bubble, lands focus in the field, and gives it back on Escape', async () => {
    serve();
    render(<ChatPanel botId={BOT_ID} apiBase="" />);
    const bubble = screen.getByRole('button', { name: 'Open the chat' });

    bubble.focus();
    expect(document.activeElement).toBe(bubble);
    // A browser turns Enter on a focused button into a click.
    fireEvent.click(bubble);

    const panel = await screen.findByRole('dialog');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Your question')));
    expect(panel.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(panel, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open the chat' })));
  });

  it('keeps Tab inside the open panel', async () => {
    serve();
    render(<ChatPanel botId={BOT_ID} apiBase="" initialOpen />);
    const panel = await screen.findByRole('dialog');
    const stops = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), textarea, input, [tabindex="0"]')];
    const last = stops[stops.length - 1] as HTMLElement;
    const first = stops[0] as HTMLElement;

    last.focus();
    fireEvent.keyDown(panel, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(panel, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('passes axe with an answer, citations and a table on screen', async () => {
    serve();
    const { container } = render(<ChatPanel botId={BOT_ID} apiBase="" initialOpen />);
    await ask('How do refunds work?');
    await screen.findByText('Sources');
    expect(screen.getByRole('region', { name: 'Table' })).toBeTruthy();

    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
