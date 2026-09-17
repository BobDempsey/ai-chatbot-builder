/**
 * One plain sentence per provider failure.
 *
 * A reader never sees a status code, a stack or a provider name: those tell
 * them nothing they can act on. ai-frontend-advisor settled this vocabulary and
 * it is copied here so both projects fail the same way.
 *
 * These sentences are also the reason failures are never written to the message
 * log: replaying one as history would teach the model to imitate it.
 */

export type ProviderFault = 'timeout' | 'rate-limit' | 'empty' | 'not-configured' | 'unreachable';

export class ProviderError extends Error {
  constructor(readonly fault: ProviderFault) {
    super(fault);
    this.name = 'ProviderError';
  }
}

const SENTENCES: Record<ProviderFault, string> = {
  timeout: 'The assistant took too long to answer. Ask again in a moment.',
  'rate-limit': 'The assistant is busy right now. Wait a few seconds and ask again.',
  empty: 'The assistant did not write an answer. Try asking the question a different way.',
  'not-configured': 'The assistant is not set up yet. The documents and logs still work.',
  unreachable: 'The assistant could not be reached. Try again shortly.',
};

/** The sentence for a failure, defaulting to the unreachable one for anything unrecognised. */
export function failureSentence(error: unknown): string {
  if (error instanceof ProviderError) return SENTENCES[error.fault];
  if (error instanceof Error && error.name === 'TimeoutError') return SENTENCES.timeout;
  return SENTENCES.unreachable;
}

/** Every sentence this module can produce, so the recorder can refuse to log one. */
export const FAILURE_SENTENCES: readonly string[] = Object.values(SENTENCES);

export function isFailureSentence(text: string): boolean {
  return FAILURE_SENTENCES.includes(text.trim());
}
