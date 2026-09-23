import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { THEME_SCRIPT, THEME_STORAGE_KEY, ThemeToggle } from './theme-toggle';

const root = document.documentElement;

afterEach(() => {
  cleanup();
  root.removeAttribute('data-acb-theme');
  window.localStorage.clear();
});

describe('the theme toggle', () => {
  it('opens light with nothing stored, whatever the system prefers', () => {
    new Function(THEME_SCRIPT)();
    expect(root.getAttribute('data-acb-theme')).toBe('light');
  });

  it('opens dark before first paint when dark was chosen', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    new Function(THEME_SCRIPT)();
    expect(root.getAttribute('data-acb-theme')).toBe('dark');
  });

  it('switches the page and remembers the choice', () => {
    new Function(THEME_SCRIPT)();
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: 'Dark mode' });
    expect(button.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(button);
    expect(root.getAttribute('data-acb-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(button.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(button);
    expect(root.getAttribute('data-acb-theme')).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it.each(['landing', 'dashboard'])('is inlined unchanged in the %s page head', (app) => {
    const html = readFileSync(join(import.meta.dirname, '..', '..', '..', 'apps', app, 'index.html'), 'utf8');
    expect(html).toContain(`<script>${THEME_SCRIPT}</script>`);
  });
});
