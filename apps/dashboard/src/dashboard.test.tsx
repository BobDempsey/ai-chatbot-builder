/**
 * What slice B's tasks ask to be verified, one describe block per task.
 *
 * Everything runs against `installTestServer`, which answers the same routes as
 * the phase 0 fake. The tests drive the whole `App`, not isolated panels,
 * because most of what the tasks ask about is one panel reacting to another:
 * a save retinting the preview, a poll changing what the preview says it can
 * answer from, a thumb moving the summary, a decline landing in the gap list.
 */
import { DEFAULT_BOT_SETTINGS } from '@acb/schemas';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './app';
import { BOT_ID_ATTRIBUTE, EMBED_SCRIPT_PATH, embedSnippet } from './embed-snippet';
import { installTestServer, type TestServer } from './test-server';

let server: TestServer;

beforeEach(() => {
  server = installTestServer();
});

afterEach(() => {
  server.restore();
  cleanup();
});

async function openDashboard() {
  render(<App />);
  await screen.findByRole('heading', { name: DEFAULT_BOT_SETTINGS.name, level: 1 });
}

function type(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function ask(question: string) {
  type('Ask the bot a question', question);
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
}

describe('5.1 settings', () => {
  it('rejects a malformed color, names the field, and keeps the previous values', async () => {
    await openDashboard();
    type('Accent color', 'blue');
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText(/six-digit hex color/)).toBeTruthy();
    // Nothing was sent, and the bot the rest of the screen reads is untouched.
    expect(server.calls).not.toContain('PUT /api/bot');
    expect(server.bot.accentColor).toBe(DEFAULT_BOT_SETTINGS.accentColor);
    expect(screen.getByRole('heading', { name: DEFAULT_BOT_SETTINGS.name, level: 1 })).toBeTruthy();
  });

  it('rejects an empty name with the field named', async () => {
    await openDashboard();
    type('Name', '   ');
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText(/Give the bot a name/)).toBeTruthy();
    expect(server.calls).not.toContain('PUT /api/bot');
  });

  it('keeps the previous values when the server refuses the save', async () => {
    await openDashboard();
    server.rejectSave = 'That name is already in use here.';
    type('Name', 'Renamed bot');
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('That name is already in use here.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: DEFAULT_BOT_SETTINGS.name, level: 1 })).toBeTruthy();
  });
});

describe('5.2 preview chat', () => {
  it('streams an answer and lists its citations', async () => {
    await openDashboard();
    await ask('How do refunds work?');

    expect(await screen.findByText(/refunds any plan within/)).toBeTruthy();
    const sources = await screen.findByText('Sources');
    expect(sources).toBeTruthy();
    expect(screen.getByRole('button', { name: /Refunds and cancellations, The 30 day window/ })).toBeTruthy();
  });

  it('shows a saved setting in the preview with no reload', async () => {
    await openDashboard();
    type('Name', 'Northwind Helper');
    type('Greeting', 'Ask me about billing.');
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Preview: Northwind Helper')).toBeTruthy();
    // The greeting is also the textarea's value, so the paragraph is named.
    expect(screen.getByText('Ask me about billing.', { selector: 'p' })).toBeTruthy();
  });

  it('counts a newly indexed document in the preview with no reload', async () => {
    await openDashboard();
    expect(screen.getByText(/Answering from 1 ready document\./)).toBeTruthy();

    type('Paste Markdown', 'Shipping policy');
    type('Markdown', '# Shipping\n\nWe ship on Tuesdays.');
    fireEvent.click(screen.getByRole('button', { name: 'Add Markdown' }));

    await waitFor(() => expect(screen.getByText(/Answering from 2 ready documents\./)).toBeTruthy(), { timeout: 10_000 });
  }, 20_000);
});

describe('5.3 uploads, the doc-set picker and indexing progress', () => {
  it('advances an upload from queued to ready without a reload, then stops polling', async () => {
    await openDashboard();
    type('Paste Markdown', 'Shipping policy');
    type('Markdown', '# Shipping\n\nWe ship on Tuesdays.');
    fireEvent.click(screen.getByRole('button', { name: 'Add Markdown' }));

    const progress = await screen.findByRole('progressbar', { name: 'Shipping policy indexing progress' });
    expect(progress.getAttribute('aria-valuetext')).toBe('Queued');

    await waitFor(() => expect(progress.getAttribute('aria-valuetext')).toBe('Ready'), { timeout: 10_000 });
    expect(await screen.findByText(/7 chunks/)).toBeTruthy();

    // A terminal state stops the poll: no further reads after a settling pause.
    const reads = server.calls.filter((call) => call === 'GET /api/documents').length;
    await new Promise((resolve) => setTimeout(resolve, 3200));
    expect(server.calls.filter((call) => call === 'GET /api/documents').length).toBe(reads);
  }, 30_000);

  it('rejects a URL that is not a URL without sending it', async () => {
    await openDashboard();
    type('Add a help-center URL', 'help.example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Fetch and index' }));

    expect(await screen.findByText(/does not look like a full URL/)).toBeTruthy();
    expect(server.calls).not.toContain('POST /api/documents/url');
  });

  it('labels the demo corpora and swaps the workspace when one is chosen', async () => {
    await openDashboard();
    const picker = screen.getByLabelText('Demo document set');
    expect(within(picker).getByText(/Fictional recipe collection \(fictional demo data\)/)).toBeTruthy();

    fireEvent.change(picker, { target: { value: 'recipes' } });
    await waitFor(() => expect(server.calls).toContain('POST /api/corpus'));
    expect(server.posted['/api/corpus']).toEqual({ corpus: 'recipes' });
  });
});

describe('5.4 conversation log', () => {
  it('opens an exchange and shows its sources', async () => {
    await openDashboard();
    const opener = screen.getByRole('button', { name: /How do I cancel\?/ });
    expect(screen.queryByText('Sources')).toBeNull();

    fireEvent.click(opener);
    expect(opener.getAttribute('aria-expanded')).toBe('true');
    expect(await screen.findByText(/cancel from Billing/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Refunds and cancellations, The 30 day window/ })).toBeTruthy();
  });
});

describe('5.5 ratings', () => {
  it('records a rating and moves the summary', async () => {
    await openDashboard();
    expect(screen.getByTestId('ratings-up').textContent).toBe('4 up');

    fireEvent.click(screen.getByRole('button', { name: /How do I cancel\?/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Good answer' }));

    await waitFor(() => expect(server.ratings.up).toBe(5));
    expect(server.posted['/api/rate']).toEqual({ messageId: '00000000-0000-4000-8000-000000000022', rating: 'up' });
    await waitFor(() => expect(screen.getByTestId('ratings-up').textContent).toBe('5 up'));
    expect(screen.getByRole('button', { name: 'Good answer' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('5.6 unanswered questions', () => {
  it('lists a declined question and records the email left against it', async () => {
    await openDashboard();
    await ask('Do you support SAML single sign-on?');

    expect(await screen.findByText(/do not cover that/)).toBeTruthy();
    // Once in the exchange above, once in the gap list the decline created.
    await waitFor(() => expect(screen.getAllByText('Do you support SAML single sign-on?')).toHaveLength(2));

    const handoff = screen.getByLabelText('Talk to a human');
    fireEvent.change(handoff, { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/does not look right/)).toBeTruthy();
    expect(server.calls).not.toContain('POST /api/handoff');

    fireEvent.change(handoff, { target: { value: 'ada@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(server.unanswered[0]?.email).toBe('ada@example.com'));
  });
});

describe('5.7 embed snippet', () => {
  it('carries the public bot id in the attribute the widget reads', () => {
    const snippet = embedSnippet('00000000-0000-4000-8000-000000000041', 'https://bots.example.com');
    expect(snippet).toBe(
      '<script type="module" src="https://bots.example.com/embed.js" data-acb-bot="00000000-0000-4000-8000-000000000041"></script>',
    );
    expect(BOT_ID_ATTRIBUTE).toBe('data-acb-bot');
    expect(EMBED_SCRIPT_PATH).toBe('/embed.js');
  });

  it('copies exactly the line it shows', async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void copied.push(text) },
    });

    await openDashboard();
    const shown = screen.getByTestId('embed-snippet').textContent ?? '';
    fireEvent.click(screen.getByRole('button', { name: 'Copy script tag' }));

    await waitFor(() => expect(copied).toEqual([shown]));
    expect(shown).toContain(`${BOT_ID_ATTRIBUTE}="00000000-0000-4000-8000-000000000041"`);
  });
});
