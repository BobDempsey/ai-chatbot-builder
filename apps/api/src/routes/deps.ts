/**
 * Everything the API reaches outside itself, in one argument.
 *
 * Nothing constructs a client, opens a connection or reads an environment
 * variable below this point. That is what lets the tests assemble the real
 * routes with an in-memory store, a deterministic embedding function and a
 * fake model, and still exercise the code a deployment runs.
 */
import type { AnswerModel } from '../models/answer';
import type { EmbeddingClient } from '../models/embedding';
import type { PdfExtractor, UrlExtractor } from '../ingest/sources';
import type { RetrievalOptions } from '../retrieval/retrieve';
import type { WorkspaceStore } from '../store/store';

export interface ApiDeps {
  store: WorkspaceStore;
  embeddings: EmbeddingClient;
  model: AnswerModel;
  extractPdf: PdfExtractor;
  fetchUrl: UrlExtractor;
  /**
   * Runs indexing after the upload response has gone out. Production detaches
   * it; the tests collect the promises so they can wait for one.
   */
  schedule: (work: () => Promise<unknown>) => void;
  retrieval?: RetrievalOptions;
  now?: () => number;
}
