import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { About, RAG_STEPS, STACK } from './about';

afterEach(cleanup);

describe('the About page', () => {
  it('explains RAG, the five steps and the stack under one heading', () => {
    render(<About />);
    const about = screen.getByRole('region', { name: 'About this app' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('About this app');
    const text = about.textContent ?? '';
    expect(text).toContain('retrieval-augmented generation (RAG)');
    for (const step of RAG_STEPS) expect(text).toContain(step.title);
    for (const item of STACK) expect(text).toContain(item.detail);
  });

  it('marks itself as the current page and links home from the title', () => {
    render(<About />);
    const nav = screen.getByRole('navigation', { name: 'Site' });
    expect(within(nav).getByRole('link', { name: 'About' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'AI Chatbot Builder' }).getAttribute('href')).toBe('/');
  });
});
