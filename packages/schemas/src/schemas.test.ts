/**
 * The contract's own checks. These exist because both front ends and the API
 * build requests from these shapes: a rename that slips through here becomes a
 * runtime failure in three places at once.
 */
import { describe, expect, it } from 'vitest';
import { chatEventSchema, chatRequestSchema } from './chat';
import { botSettingsSchema, DEFAULT_BOT_SETTINGS } from './settings';
import { MAX_HISTORY_TURNS, MAX_MESSAGE_CHARS } from './limits';

describe('chat request', () => {
  it('defaults history to empty and trims the message', () => {
    const parsed = chatRequestSchema.parse({ message: '  How do refunds work?  ' });
    expect(parsed.message).toBe('How do refunds work?');
    expect(parsed.history).toEqual([]);
  });

  it('refuses an empty question, an over-long one, and too much history', () => {
    expect(chatRequestSchema.safeParse({ message: '   ' }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ message: 'x'.repeat(MAX_MESSAGE_CHARS + 1) }).success).toBe(false);
    const history = Array.from({ length: MAX_HISTORY_TURNS + 1 }, () => ({ role: 'user' as const, content: 'hi' }));
    expect(chatRequestSchema.safeParse({ message: 'hi', history }).success).toBe(false);
  });
});

describe('chat events', () => {
  it('accepts each event the stream can carry', () => {
    const events = [
      { type: 'delta', text: 'Refunds ' },
      { type: 'citations', citations: [] },
      { type: 'declined', message: 'Not covered.', questionId: '00000000-0000-4000-8000-000000000001' },
      { type: 'done', messageId: '00000000-0000-4000-8000-000000000002' },
      { type: 'failure', message: 'The assistant took too long to answer.' },
    ];
    for (const event of events) expect(chatEventSchema.safeParse(event).success).toBe(true);
  });

  it('refuses an event type nothing sends', () => {
    expect(chatEventSchema.safeParse({ type: 'thinking' }).success).toBe(false);
  });
});

describe('bot settings', () => {
  it('accepts the defaults the seeded bot ships with', () => {
    expect(botSettingsSchema.safeParse(DEFAULT_BOT_SETTINGS).success).toBe(true);
  });

  it('names the field when a color or a name is wrong', () => {
    const bad = botSettingsSchema.safeParse({ ...DEFAULT_BOT_SETTINGS, accentColor: 'blue' });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]?.message).toContain('hex color');

    const unnamed = botSettingsSchema.safeParse({ ...DEFAULT_BOT_SETTINGS, name: '' });
    expect(unnamed.success).toBe(false);
    if (!unnamed.success) expect(unnamed.error.issues[0]?.message).toContain('name');
  });
});
