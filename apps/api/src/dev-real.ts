/**
 * `pnpm dev:api`: the real routes over an in-memory workspace, on the port the
 * dashboard, widget and landing page all proxy `/api` to.
 *
 * It replaced the phase 0 fake at integration, which is why it holds 5180
 * rather than the 5190 slice A built it on. With
 * no `OPENAI_API_KEY` set it runs the fake embedding and answering clients, so
 * the whole pipeline works with nothing configured; with a key set it calls the
 * real providers, which is the only difference between this and a deployment.
 */
import { serve } from '@hono/node-server';
import { createApi } from './app';
import { createOpenAiAnswerModel } from './models/answer';
import { createOpenAiEmbeddingClient } from './models/embedding';
import { extractPdfText, fetchUrlText } from './ingest/sources';
import { MemoryWorkspaceStore } from './store/memory';
import { MemorySessionStore } from './store/sessions';
import { loadTemplates } from './templates';
import { createFakeAnswerModel, createFakeEmbeddingClient } from './testing';

const apiKey = process.env.OPENAI_API_KEY;
const embeddings = apiKey ? createOpenAiEmbeddingClient({ apiKey }) : createFakeEmbeddingClient();
const model = apiKey ? createOpenAiAnswerModel({ apiKey }) : createFakeAnswerModel();

const store = new MemoryWorkspaceStore();
const sessions = new MemorySessionStore(store);

// The fake embedding client is lexical rather than semantic, so its distances
// sit higher than the real model's and the production floor would decline
// everything. With a key set, the production floor applies.
const retrieval = apiKey ? {} : { floor: 0.78 };

const api = createApi(
  {
    store,
    embeddings,
    model,
    retrieval,
    extractPdf: extractPdfText,
    fetchUrl: fetchUrlText,
    schedule: (work) => {
      void work().catch(() => undefined);
    },
  },
  sessions,
);

const port = Number(process.env.PORT ?? 5180);

const loaded = await loadTemplates(store, embeddings);
serve({ fetch: api.fetch, port }, (info) => {
  console.log(`api on http://localhost:${info.port}`);
  console.log(`templates: ${loaded.written} documents, ${loaded.chunks} chunks, ${apiKey ? 'real' : 'fake'} embeddings`);
});
