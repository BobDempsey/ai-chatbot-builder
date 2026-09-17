/**
 * Stand-ins for the two paid providers.
 *
 * The embedding one is a bag of words hashed into the same 1536 dimensions the
 * real model uses, so texts that share vocabulary come out near each other and
 * texts that do not come out far apart. That is enough to exercise top-k, the
 * relevance floor and the decline path, and it costs nothing and needs no key.
 * It is not a substitute for calibrating the floor against the real model.
 *
 * The answering one replays a script. Both are used by the unit tests and by
 * `pnpm dev:api:real`, which is how the real routes run with nothing configured.
 */
import type { AnswerModel, AnswerPrompt } from './models/answer';
import { EMBEDDING_DIMENSIONS, type EmbeddingClient } from './models/embedding';
import { ProviderError, type ProviderFault } from './models/failures';

function hashToken(token: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return Math.abs(hash) % EMBEDDING_DIMENSIONS;
}

/** Words worth indexing: short ones carry no topic and only blur the vectors. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

export function fakeEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const token of tokenize(text)) {
    const index = hashToken(token);
    vector[index] = (vector[index] as number) + 1;
  }
  return vector;
}

export interface FakeEmbeddingOptions {
  /** Throws this fault instead of embedding, for the failure paths. */
  fault?: ProviderFault;
  /** Throws once the client has been asked this many times, for a mid-run failure. */
  failAfterCalls?: number;
}

export function createFakeEmbeddingClient(options: FakeEmbeddingOptions = {}): EmbeddingClient & { calls: number } {
  const client = {
    calls: 0,
    async embed(texts: string[]) {
      client.calls += 1;
      if (options.fault) throw new ProviderError(options.fault);
      if (options.failAfterCalls !== undefined && client.calls > options.failAfterCalls) {
        throw new ProviderError('rate-limit');
      }
      return texts.map(fakeEmbedding);
    },
  };
  return client;
}

export interface FakeAnswerOptions {
  /** The pieces to yield, in order. Each arrives as its own delta. */
  script?: string[];
  fault?: ProviderFault;
}

export function createFakeAnswerModel(options: FakeAnswerOptions = {}): AnswerModel & { prompts: AnswerPrompt[]; calls: number } {
  const model = {
    prompts: [] as AnswerPrompt[],
    calls: 0,
    async *stream(prompt: AnswerPrompt) {
      model.calls += 1;
      model.prompts.push(prompt);
      if (options.fault) throw new ProviderError(options.fault);
      for (const piece of options.script ?? ['The documents say so. ', '[1]']) yield piece;
    },
  };
  return model;
}
