/**
 * Indexing a document, as a job the upload request does not wait for.
 *
 * Embedding a PDF takes longer than a serverless request should, so the upload
 * stores the document as `queued` and returns. This runs afterwards and moves
 * it through `extracting` and `embedding` to `ready`, which is what the
 * dashboard polls and what makes the progress bar honest rather than animated.
 *
 * A failure part way through clears the chunks before marking the document
 * failed, so retrieval never finds half a document.
 */
import type { DocumentState } from '@acb/schemas';
import { failureSentence, ProviderError } from '../models/failures';
import type { EmbeddingClient } from '../models/embedding';
import type { WorkspaceStore } from '../store/store';
import { chunkMarkdown, DEFAULT_CHUNK_OPTIONS, type ChunkOptions } from './chunk';

/** Inputs per embedding request. The provider accepts many, and fewer round trips is cheaper. */
const EMBED_BATCH = 64;

export interface IndexOptions {
  chunkOptions?: ChunkOptions;
}

export async function indexDocument(
  store: WorkspaceStore,
  embeddings: EmbeddingClient,
  sessionId: string,
  documentId: string,
  text: string,
  options: IndexOptions = {},
): Promise<DocumentState> {
  try {
    await store.setDocumentState(sessionId, documentId, 'extracting');
    const chunks = chunkMarkdown(text, options.chunkOptions ?? DEFAULT_CHUNK_OPTIONS);
    if (chunks.length === 0) throw new Error('nothing to index');

    await store.setDocumentState(sessionId, documentId, 'embedding');
    const vectors: number[][] = [];
    for (let start = 0; start < chunks.length; start += EMBED_BATCH) {
      const batch = chunks.slice(start, start + EMBED_BATCH);
      vectors.push(...(await embeddings.embed(batch.map((chunk) => chunk.content))));
    }

    await store.replaceChunks(
      sessionId,
      documentId,
      chunks.map((chunk, index) => ({ ...chunk, embedding: vectors[index] ?? null })),
    );
    await store.setDocumentState(sessionId, documentId, 'ready');
    return 'ready';
  } catch (error) {
    await store.clearChunks(sessionId, documentId);
    // A provider fault gets the provider's own sentence; anything else is ours to explain.
    const reason =
      error instanceof ProviderError ? failureSentence(error) : 'That document could not be indexed. Upload it again.';
    await store.setDocumentState(sessionId, documentId, 'failed', reason);
    return 'failed';
  }
}
