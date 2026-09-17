/**
 * `pnpm dev:api`: the real routes on the port the dashboard, widget and landing
 * page all proxy `/api` to. It replaced the phase 0 fake at integration, which
 * is why it holds 5180 rather than the 5190 slice A built it on.
 *
 * It degrades rather than refusing to start, so a front end slice can run with
 * nothing configured:
 *
 * - No `OPENAI_API_KEY`: fake embedding and answering clients, and a looser
 *   retrieval floor, because the fake embedder is lexical rather than semantic
 *   and its distances sit higher than the real model's.
 * - No `SUPABASE_DB_URL`: an in-memory workspace, seeded at boot and lost on
 *   restart.
 *
 * With both set it is the deployment, running locally.
 */
import { config } from 'dotenv';
import { serve } from '@hono/node-server';
import { createApi } from './app';
import { extractPdfText, fetchUrlText } from './ingest/sources';
import { createOpenAiAnswerModel } from './models/answer';
import { createOpenAiEmbeddingClient } from './models/embedding';
import { MemoryWorkspaceStore } from './store/memory';
import { createDatabase, PostgresWorkspaceStore } from './store/postgres';
import { MemorySessionStore, PostgresSessionStore } from './store/sessions';
import { loadTemplates } from './templates';
import { createFakeAnswerModel, createFakeEmbeddingClient } from './testing';

config({ path: new URL('../../../.env', import.meta.url), quiet: true });

const apiKey = process.env.OPENAI_API_KEY;
const databaseUrl = process.env.SUPABASE_DB_URL;

const embeddings = apiKey ? createOpenAiEmbeddingClient({ apiKey }) : createFakeEmbeddingClient();
const model = apiKey ? createOpenAiAnswerModel({ apiKey }) : createFakeAnswerModel();

const sql = databaseUrl ? createDatabase(databaseUrl) : null;
const store = sql ? new PostgresWorkspaceStore(sql) : new MemoryWorkspaceStore();
const sessions = sql ? new PostgresSessionStore(sql, store) : new MemorySessionStore(store);

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

// The templates already live in the database when one is configured; loading
// them here is only for the in-memory case, which starts empty every time.
const loaded = databaseUrl ? null : await loadTemplates(store, embeddings);

serve({ fetch: api.fetch, port }, (info) => {
  console.log(`api on http://localhost:${info.port}`);
  console.log(`store: ${databaseUrl ? 'postgres' : 'memory'}, model: ${apiKey ? 'openai' : 'fake'}`);
  if (loaded) console.log(`templates: ${loaded.written} documents, ${loaded.chunks} chunks`);
});
