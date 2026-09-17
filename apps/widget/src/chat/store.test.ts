/**
 * The conversation survives a reload, and it survives storage refusing to
 * cooperate, which is the case a widget on somebody else's page actually meets.
 */
import { MAX_HISTORY_ANSWER_CHARS, MAX_HISTORY_TURNS } from '@acb/schemas';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asHistory, clearConversation, entry, type Entry, readConversation, STORAGE_KEY, writeConversation } from './store';

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  clearConversation();
});

const said: Entry[] = [
  entry({ role: 'user', content: 'How do refunds work?' }),
  entry({ role: 'assistant', content: 'Within 30 days. [1]' }),
];

describe('keeping the conversation', () => {
  it('reads back what was written, which is what a reload does', () => {
    writeConversation(said);
    expect(readConversation()).toEqual(said);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toContain('refunds');
  });

  it('falls back to memory when storage throws on the way in and out', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage is disabled');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage is disabled');
    });

    expect(() => writeConversation(said)).not.toThrow();
    expect(readConversation()).toEqual(said);
  });

  it('ignores anything in storage that is not a conversation', () => {
    window.sessionStorage.setItem(STORAGE_KEY, '{"not":"an array"}');
    expect(readConversation()).toEqual([]);
    window.sessionStorage.setItem(STORAGE_KEY, '[{"role":"pirate"},{"role":"user","content":"hi"}]');
    const kept = readConversation();
    expect(kept).toHaveLength(1);
    // An entry written before ids existed gets one on the way in.
    expect(kept[0]).toMatchObject({ role: 'user', content: 'hi' });
    expect(typeof kept[0]?.id).toBe('string');
  });

  it('clears on request', () => {
    writeConversation(said);
    clearConversation();
    expect(readConversation()).toEqual([]);
  });
});

describe('what goes back to the server', () => {
  it('drops failure sentences, so a provider error is never replayed', () => {
    const history = asHistory([...said, entry({ role: 'assistant', content: 'The assistant took too long.', failed: true })]);
    expect(history).toHaveLength(2);
    expect(history.some((turn) => turn.content.includes('too long'))).toBe(false);
  });

  it('applies both caps before the request is built', () => {
    const many: Entry[] = Array.from({ length: MAX_HISTORY_TURNS + 6 }, (_unused, index) =>
      entry({ role: index % 2 === 0 ? 'user' : 'assistant', content: 'x'.repeat(MAX_HISTORY_ANSWER_CHARS + 50) }),
    );
    const history = asHistory(many);
    expect(history).toHaveLength(MAX_HISTORY_TURNS);
    expect(history.every((turn) => turn.content.length === MAX_HISTORY_ANSWER_CHARS)).toBe(true);
  });
});
