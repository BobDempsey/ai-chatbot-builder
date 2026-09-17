/**
 * Indexing the demo corpora once, into template rows no session can write.
 *
 * Seeding copies these rows rather than recomputing them, so a new workspace
 * costs nothing at the embeddings API and every visitor starts from the same
 * documents. That is also why the templates are read-only: one visitor deleting
 * a seeded document must not change what the next visitor is given.
 *
 * The loader is keyed on a hash of the source Markdown, so running it twice
 * writes nothing the second time and editing one file re-indexes only that file.
 */
import type { Corpus } from '@acb/schemas';
import { ALL_CORPORA, loadCorpus } from './corpora';
import { chunkMarkdown, DEFAULT_CHUNK_OPTIONS, type ChunkOptions } from './ingest/chunk';
import type { EmbeddingClient } from './models/embedding';
import type { WorkspaceStore } from './store/store';

export interface LoadTemplatesOptions {
  corpora?: Corpus[];
  chunkOptions?: ChunkOptions;
  root?: string;
}

export interface LoadTemplatesResult {
  written: number;
  unchanged: number;
  chunks: number;
}

export async function loadTemplates(
  store: WorkspaceStore,
  embeddings: EmbeddingClient,
  options: LoadTemplatesOptions = {},
): Promise<LoadTemplatesResult> {
  const result: LoadTemplatesResult = { written: 0, unchanged: 0, chunks: 0 };

  for (const corpus of options.corpora ?? ALL_CORPORA) {
    for (const file of loadCorpus(corpus, options.root)) {
      // The hash is checked before embedding, so an unchanged file costs nothing.
      if (await store.templateIsCurrent(corpus, file.slug, file.contentHash)) {
        result.unchanged += 1;
        continue;
      }

      const chunks = chunkMarkdown(file.markdown, options.chunkOptions ?? DEFAULT_CHUNK_OPTIONS);
      const vectors = await embeddings.embed(chunks.map((chunk) => chunk.content));
      await store.writeTemplateDocument({
        corpus,
        slug: file.slug,
        title: file.title,
        reference: file.reference,
        contentHash: file.contentHash,
        chunks: chunks.map((chunk, index) => ({ ...chunk, embedding: vectors[index] ?? null })),
      });
      result.written += 1;
      result.chunks += chunks.length;
    }
  }

  return result;
}
