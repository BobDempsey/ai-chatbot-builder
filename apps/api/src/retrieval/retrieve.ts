/**
 * Top-k search over the asking session's ready chunks.
 *
 * Two rules are not the caller's to remember, so they live below the API: the
 * store scopes by session, and a document that has not finished indexing is not
 * searched. The relevance floor is the third: when nothing sits above it, the
 * answering model is never called, which is both the honest answer and the
 * cheap one.
 */
import type { RetrievedChunk, WorkspaceStore } from '../store/store';
import type { EmbeddingClient } from '../models/embedding';

/** How many chunks go into a prompt. Enough for a cited answer, short enough to stay grounded. */
export const RETRIEVAL_LIMIT = 6;

/**
 * The largest cosine distance still counted as relevant.
 *
 * Measured on 2026-09-17 against `text-embedding-3-small` over the three
 * seeded corpora. Questions the corpora answer come back between 0.35 and 0.51;
 * questions on another subject entirely sit at 0.66 and above. 0.62 separates
 * them with room on both sides.
 *
 * What the floor cannot do is separate a source about the right subject from
 * one that holds the answer. "What wine goes with fish pie" retrieves the fish
 * pie chunk at 0.51, because it is about fish pie. That case is the model's to
 * catch, and it does: see `NO_ANSWER` in `prompt.ts`.
 */
export const RELEVANCE_FLOOR = 0.62;

export interface RetrievalOptions {
  limit?: number;
  floor?: number;
}

export async function retrieveChunks(
  store: WorkspaceStore,
  embeddings: EmbeddingClient,
  sessionId: string,
  question: string,
  options: RetrievalOptions = {},
): Promise<RetrievedChunk[]> {
  const { limit = RETRIEVAL_LIMIT, floor = RELEVANCE_FLOOR } = options;
  const [embedding] = await embeddings.embed([question]);
  if (!embedding) return [];
  return store.matchChunks(sessionId, embedding, limit, floor);
}
