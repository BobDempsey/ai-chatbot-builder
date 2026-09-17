/**
 * The landing page's one job: a visitor who arrives with a question gets a
 * cited answer without going anywhere else.
 *
 * The last test runs the whole path with nothing stubbed but the network, so it
 * covers the part that is easy to break by accident: the page, the embedded
 * widget and the shared answer renderer all agreeing, inside the same shadow
 * root a customer's page would get.
 */
import type { ChatEvent } from '@acb/schemas';
import type { MountChat } from '@acb/widget';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_BOT_ID, Landing, PROMPTS } from './app';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const BOT = {
  id: id(40),
  publicId: DEMO_BOT_ID,
  name: 'Northwind Support',
  accentColor: '#2563eb',
  greeting: 'Hi. Ask me anything about the docs I have been given.',
  tone: 'friendly',
};

const ANSWER_EVENTS: ChatEvent[] = [
  { type: 'delta', text: 'Northwind Cloud refunds any plan within **30 days** of the charge. [1]' },
  {
    type: 'citations',
    citations: [
      { index: 1, documentId: id(1), documentTitle: 'Refunds and cancellations', section: 'The 30 day window', chunkId: id(11) },
    ],
  },
  { type: 'done', messageId: id(51) },
];

function serve() {
  const encoder = new TextEncoder();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/bot')) return Response.json(BOT);
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const event of ANSWER_EVENTS) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            controller.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'application/x-ndjson' } },
      );
    }),
  );
}

/** The widget's shadow root, which is where everything the chat draws lives. */
const widgetShadow = (): ShadowRoot => {
  const host = document.querySelector('[data-acb-widget]');
  if (!host?.shadowRoot) throw new Error('the widget did not mount');
  return host.shadowRoot;
};

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the page leads with the chat', () => {
  it('shows a headline, a question box and starting prompts', () => {
    const loadChat = vi.fn(async () => ({ mountChat: vi.fn<MountChat>(() => () => {}) }));
    render(<Landing loadChat={loadChat} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('answering for themselves');
    expect(screen.getByLabelText('Ask the demo bot')).toBeTruthy();
    for (const prompt of PROMPTS) expect(screen.getByRole('button', { name: prompt })).toBeTruthy();
    // Nothing is downloaded until a visitor reaches for the chat.
    expect(loadChat).not.toHaveBeenCalled();
  });

  it('opens the chat with a typed question already sent', async () => {
    const mountChat = vi.fn<MountChat>(() => () => {});
    render(<Landing loadChat={async () => ({ mountChat })} />);

    fireEvent.change(screen.getByLabelText('Ask the demo bot'), { target: { value: 'How do refunds work?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    await waitFor(() => expect(mountChat).toHaveBeenCalledTimes(1));
    expect(mountChat.mock.calls[0]?.[0]).toMatchObject({ botId: DEMO_BOT_ID, question: 'How do refunds work?' });
  });

  it('opens the chat with a starting prompt already sent', async () => {
    const mountChat = vi.fn<MountChat>(() => () => {});
    render(<Landing loadChat={async () => ({ mountChat })} />);

    const prompt = PROMPTS[0] as string;
    fireEvent.click(screen.getByRole('button', { name: prompt }));

    await waitFor(() => expect(mountChat).toHaveBeenCalledTimes(1));
    expect(mountChat.mock.calls[0]?.[0]).toMatchObject({ question: prompt });
  });
});

describe('the embedded widget on the page', () => {
  it('answers the demo bot with citations, with no dashboard visit first', async () => {
    serve();
    render(<Landing />);

    fireEvent.click(screen.getByRole('button', { name: PROMPTS[0] as string }));

    await waitFor(
      () => {
        const shadow = widgetShadow();
        expect(shadow.textContent).toContain('refunds any plan within');
        expect(shadow.textContent).toContain('Sources');
        expect(shadow.textContent).toContain('Refunds and cancellations');
      },
      { timeout: 4000 },
    );

    // The bubble and the panel are inside the shadow root, and nothing about
    // the page has become a dashboard.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('link', { name: 'Open the dashboard' })).toBeTruthy();
  });
});
