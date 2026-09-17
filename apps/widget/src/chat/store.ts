/**
 * The conversation, kept for as long as the tab is open. One `sessionStorage`
 * key, so a reload does not lose the exchange, and nothing outlives the tab.
 *
 * Storage can be absent, full, or refused outright by a host page's privacy
 * settings, so every access is guarded and the conversation falls back to a
 * module-level copy in memory. ai-frontend-advisor's `site/src/chat/store.ts`
 * is the same shape.
 */
import { type Citation, MAX_HISTORY_ANSWER_CHARS, MAX_HISTORY_TURNS, type Turn } from '@acb/schemas';

export interface Entry {
  /** Stable for the life of the entry, so React keys do not ride on positions. */
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Sources the answer drew on, once the stream has closed. */
  citations?: Citation[];
  /** A failure sentence. It is shown, and it is never sent back as history. */
  failed?: boolean;
  /**
   * Set when the bot declined for lack of coverage. It is the id the handoff
   * email is recorded against.
   */
  questionId?: string;
  /** An address was accepted for this declined question. */
  handoffEmail?: string;
}

export const STORAGE_KEY = 'acb-widget-chat';

/** What the conversation falls back to when storage throws or is missing. */
let memory: Entry[] = [];

/** A new entry, ready to be appended. Only this and a reload make one. */
export function entry(fields: Omit<Entry, 'id'>): Entry {
  return { id: crypto.randomUUID(), ...fields };
}

function isEntry(value: unknown): value is Omit<Entry, 'id'> & { id?: string } {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Entry;
  return (candidate.role === 'user' || candidate.role === 'assistant') && typeof candidate.content === 'string';
}

export function readConversation(): Entry[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return memory;
    // An id written by an older tab may be missing, so one is minted on the way
    // in rather than left for the renderer to invent.
    return parsed.filter(isEntry).map((found) => ({ ...found, id: found.id ?? crypto.randomUUID() }));
  } catch {
    return memory;
  }
}

export function writeConversation(entries: Entry[]): void {
  memory = entries;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Nothing to keep it in. The conversation lasts as long as this page view.
  }
}

export function clearConversation(): void {
  memory = [];
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * What goes back to the server: what was actually said, with failure sentences
 * dropped so a provider error is never replayed to the model, and both caps
 * applied before the request is built rather than after it is refused.
 */
export function asHistory(entries: Entry[]): Turn[] {
  return entries
    .filter((entry) => !entry.failed && entry.content.trim().length > 0)
    .slice(-MAX_HISTORY_TURNS)
    .map((entry) => ({ role: entry.role, content: entry.content.slice(0, MAX_HISTORY_ANSWER_CHARS) }));
}
