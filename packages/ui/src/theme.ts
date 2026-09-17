/**
 * A bot's saved settings, turned into the CSS variables the components read.
 *
 * It returns a style object rather than writing a stylesheet, so the same
 * settings can theme the dashboard's preview and a widget inside a shadow root
 * without either one touching a global.
 */
import type { BotSettings } from '@acb/schemas';
import type { CSSProperties } from 'react';

/** Black or white against the accent, whichever a reader can actually see. */
export function readableInk(hex: string): '#ffffff' | '#16181d' {
  const value = hex.replace('#', '');
  const channel = (at: number) => Number.parseInt(value.slice(at, at + 2), 16) / 255;
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear(channel(0)) + 0.7152 * linear(channel(2)) + 0.0722 * linear(channel(4));
  return luminance > 0.45 ? '#16181d' : '#ffffff';
}

export function themeStyle(settings: Pick<BotSettings, 'accentColor'>): CSSProperties {
  return {
    ['--color-accent' as string]: settings.accentColor,
    ['--color-accent-ink' as string]: readableInk(settings.accentColor),
  };
}
