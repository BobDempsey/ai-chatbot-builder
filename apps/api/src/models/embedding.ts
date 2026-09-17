/**
 * Turning text into vectors.
 *
 * The interface is one method so ingestion and retrieval can both be tested
 * with a deterministic fake and no API key. The OpenAI implementation talks to
 * the REST endpoint directly rather than pulling in the SDK: one POST, one
 * shape, and no extra dependency on a serverless function.
 */
import { ProviderError } from './failures';

/** `text-embedding-3-small` produces 1536 dimensions, matching the `vector(1536)` column. */
export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_MODEL = 'text-embedding-3-small';

export interface EmbeddingClient {
  /** One vector per input, in the same order. */
  embed(texts: string[]): Promise<number[][]>;
}

export interface OpenAiEmbeddingOptions {
  apiKey: string | undefined;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface EmbeddingResponse {
  data?: { embedding: number[] }[];
}

export function createOpenAiEmbeddingClient(options: OpenAiEmbeddingOptions): EmbeddingClient {
  const {
    apiKey,
    model = EMBEDDING_MODEL,
    baseUrl = 'https://api.openai.com/v1',
    timeoutMs = 30_000,
    fetchImpl = fetch,
  } = options;

  return {
    async embed(texts) {
      if (!apiKey) throw new ProviderError('not-configured');
      if (texts.length === 0) return [];
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model, input: texts }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new ProviderError(error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unreachable');
      }
      if (response.status === 429) throw new ProviderError('rate-limit');
      if (!response.ok) throw new ProviderError('unreachable');
      const body = (await response.json()) as EmbeddingResponse;
      const vectors = body.data?.map((item) => item.embedding);
      if (!vectors || vectors.length !== texts.length) throw new ProviderError('empty');
      return vectors;
    },
  };
}
