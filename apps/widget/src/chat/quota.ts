/**
 * A browser-side count of the questions this visitor has asked, so the panel
 * can say what is left before the edge starts refusing.
 *
 * The edge rule reports nothing about the remaining allowance, so this counts
 * what this browser sent over the same window the rule uses. It is a hint, not
 * the limit: the server decides, and a 429 marks the allowance spent whatever
 * the count said. The numbers come from `@acb/schemas`, so the hint and the
 * rule cannot drift apart.
 *
 * `localStorage`, so the count survives a new tab the way the edge rule's own
 * memory does. Storage can throw, and the count then lives in memory for this
 * page view.
 */
import { MAX_QUESTIONS_PER_WINDOW, RATE_WINDOW_MS, WARN_AFTER_QUESTIONS } from '@acb/schemas';

export const STORAGE_KEY = 'acb-widget-quota';

let memory: number[] = [];

/** Timestamps still inside the window, newest order not required. */
function read(now: number): number[] {
  let stamps = memory;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (Array.isArray(parsed)) stamps = parsed.filter((stamp): stamp is number => typeof stamp === 'number');
  } catch {
    // Fall back to the in-memory count.
  }
  return stamps.filter((stamp) => now - stamp < RATE_WINDOW_MS);
}

function write(stamps: number[]): void {
  memory = stamps;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stamps));
  } catch {
    // The in-memory count is all there is.
  }
}

/** Questions left before the edge is expected to refuse. Never below zero. */
export function questionsLeft(now = Date.now()): number {
  return Math.max(0, MAX_QUESTIONS_PER_WINDOW - read(now).length);
}

export function recordQuestion(now = Date.now()): void {
  write([...read(now), now]);
}

/** The edge refused a question, so the allowance is spent whatever was counted. */
export function markSpent(now = Date.now()): void {
  const stamps = read(now);
  const missing = Math.max(0, MAX_QUESTIONS_PER_WINDOW - stamps.length);
  write([...stamps, ...Array.from({ length: missing }, () => now)]);
}

export function clearQuota(): void {
  memory = [];
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** The line under the composer, or null while the allowance is barely touched. */
export function allowanceNotice(left: number): string | null {
  if (left === 0) return 'You have used all your questions for now. Try again in a few minutes.';
  if (MAX_QUESTIONS_PER_WINDOW - left < WARN_AFTER_QUESTIONS) return null;
  return `${left} ${left === 1 ? 'question' : 'questions'} remaining.`;
}
