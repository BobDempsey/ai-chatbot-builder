/**
 * Task 5.8: axe over every dashboard screen, at 1440 and at 375.
 *
 * "Screen" here means every state a reader can be looking at, not every route,
 * because the dashboard is one page: loading, a failed load, the settled
 * workspace, a settings form showing its errors, an answered question with
 * citations and a table, a declined one with the email capture, and an opened
 * conversation. Each is rendered and checked at both widths.
 *
 * What this does and does not prove. jsdom applies no stylesheet and computes
 * no layout, so the rules that depend on painted pixels cannot run: color
 * contrast is switched off here for the same reason the shared UI package
 * switches it off, and the two widths exercise the components' own width
 * handling rather than Tailwind's media queries. What it does catch is the
 * whole class of structural failures, which is where this kind of screen
 * actually fails: an unlabelled control, a missing form label, a heading order
 * that jumps, an ARIA attribute on an element that cannot carry it, a
 * scrollable region a keyboard cannot reach.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './app';
import { installTestServer, type TestServer } from './test-server';

let server: TestServer;

beforeEach(() => {
  server = installTestServer();
});

afterEach(() => {
  server.restore();
  setWidth(1024);
  cleanup();
});

const WIDTHS = [1440, 375];

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

/**
 * Runs axe at both widths over the container it is given. Contrast is off
 * because no stylesheet is loaded; every other rule in the default set runs.
 */
async function checkBothWidths(container: HTMLElement, name: string) {
  for (const width of WIDTHS) {
    setWidth(width);
    container.style.width = `${width}px`;
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(
      results.violations.map((violation) => violation.id),
      `${name} at ${width}`,
    ).toEqual([]);
  }
}

describe('5.8 accessibility', () => {
  it('passes while the workspace is still loading', async () => {
    const { container } = render(<App />);
    expect(screen.getByText('Loading your workspace.')).toBeTruthy();
    await checkBothWidths(container, 'loading');
    await screen.findByRole('heading', { level: 1, name: 'Northwind Support' });
  });

  it('passes when the workspace could not be loaded', async () => {
    server.restore();
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'Your session has expired.' }), { status: 404 })) as typeof fetch;
    const { container } = render(<App />);
    await screen.findByText('Your session has expired.');
    await checkBothWidths(container, 'load failure');
  });

  it('passes on the settled workspace', async () => {
    const { container } = render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Northwind Support' });
    await checkBothWidths(container, 'workspace');
  });

  it('passes with the settings form showing its errors', async () => {
    const { container } = render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Northwind Support' });
    fireEvent.change(screen.getByLabelText('Accent color'), { target: { value: 'blue' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await screen.findByText(/six-digit hex color/);
    await checkBothWidths(container, 'rejected settings');
  });

  it('passes with an answer, citations and a table on screen', async () => {
    const { container } = render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Northwind Support' });
    fireEvent.change(screen.getByLabelText('Ask the bot a question'), { target: { value: 'How do refunds work?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    await screen.findByText('Sources');
    expect(screen.getByRole('region', { name: 'Table' }).tabIndex).toBe(0);
    await checkBothWidths(container, 'answered question');
  });

  it('passes with a decline and the email capture on screen', async () => {
    const { container } = render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Northwind Support' });
    fireEvent.change(screen.getByLabelText('Ask the bot a question'), { target: { value: 'Do you support SAML?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    const handoff = await screen.findByLabelText('Talk to a human');
    fireEvent.change(handoff, { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText(/does not look right/);
    await checkBothWidths(container, 'declined question');
  });

  it('passes with a conversation opened and an indexing document on screen', async () => {
    const { container } = render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Northwind Support' });

    fireEvent.change(screen.getByLabelText('Paste Markdown'), { target: { value: 'Shipping policy' } });
    fireEvent.change(screen.getByLabelText('Markdown'), { target: { value: '# Shipping' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Markdown' }));
    await screen.findByRole('progressbar', { name: 'Shipping policy indexing progress' });

    fireEvent.click(screen.getByRole('button', { name: /How do I cancel\?/ }));
    await waitFor(() => expect(screen.getByText('Sources')).toBeTruthy());
    await checkBothWidths(container, 'open conversation');
  });
});
