/**
 * The light and dark switch for the pages this project owns: the landing page
 * and the dashboard.
 *
 * It follows ai-frontend-advisor's toggle rather than next-themes, which is
 * built for Next. The theme is `data-acb-theme` on `<html>`, the attribute
 * `styles.css` already keys the dark tokens on. There is no system option on
 * purpose: a first visit opens light, and only this button changes it.
 *
 * {@link THEME_SCRIPT} sets the attribute from storage in the document head,
 * before the first paint, so a reader who chose dark never sees a light flash.
 * The button then reads what that script decided rather than deciding again.
 *
 * The choice lives in localStorage under one key, and the landing page and the
 * dashboard share an origin in production, so they switch together. Storage
 * can be missing or throw (private windows, blocked site data), so every access
 * is guarded and the choice then lasts for the page view only.
 */
import { THEME_ATTRIBUTE } from '@acb/schemas/embed';
import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { Button } from './primitives';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'acb-theme';

/** Inlined in each page's `<head>`. Anything but a stored "dark" opens light. */
export const THEME_SCRIPT = `try{document.documentElement.setAttribute('${THEME_ATTRIBUTE}',localStorage.getItem('${THEME_STORAGE_KEY}')==='dark'?'dark':'light')}catch(e){document.documentElement.setAttribute('${THEME_ATTRIBUTE}','light')}`;

export function currentTheme(): Theme {
  return document.documentElement.getAttribute(THEME_ATTRIBUTE) === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The choice then lasts for this page view only.
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const dark = theme === 'dark';

  const toggle = () => {
    const next: Theme = dark ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Dark mode"
      aria-pressed={dark}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggle}
      className={className}
    >
      {dark ? <Sun aria-hidden="true" className="acb:size-5" /> : <Moon aria-hidden="true" className="acb:size-5" />}
    </Button>
  );
}
