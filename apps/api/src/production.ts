/**
 * The API a deployment runs, assembled once from the environment.
 *
 * `dev-real.ts` degrades on purpose so a front end can run with nothing
 * configured. This does the opposite: it reads the environment through the
 * guard and throws if anything is missing, because a function answering with
 * fake clients would look like it worked. The two share every dependency
 * underneath and differ only in what they tolerate.
 *
 * Nothing here reads a file at request time. The demo corpora are indexed into
 * template rows by `pnpm --filter @acb/api templates:load` before a deploy, and
 * seeding copies those rows, so no Markdown has to travel with the function and
 * `includeFiles` stays empty.
 */
import { createApi } from './app';
import { readEnv } from './env';
import { extractPdfText, fetchUrlText } from './ingest/sources';
import { createOpenAiAnswerModel } from './models/answer';
import { createOpenAiEmbeddingClient } from './models/embedding';
import { createDatabase, PostgresWorkspaceStore } from './store/postgres';
import { PostgresSessionStore } from './store/sessions';

export function createProductionApi(source: Record<string, string | undefined> = process.env) {
  const env = readEnv(source);
  const sql = createDatabase(env.SUPABASE_DB_URL);
  const store = new PostgresWorkspaceStore(sql);
  const sessions = new PostgresSessionStore(sql, store);

  return createApi(
    {
      store,
      embeddings: createOpenAiEmbeddingClient({ apiKey: env.OPENAI_API_KEY }),
      model: createOpenAiAnswerModel({ apiKey: env.OPENAI_API_KEY }),
      extractPdf: extractPdfText,
      fetchUrl: fetchUrlText,
      // Indexing outlives the upload response. The function stays warm long
      // enough for short documents, and a cold stop only leaves a document
      // marked indexing, which the dashboard already renders.
      schedule: (work) => {
        void work().catch(() => undefined);
      },
    },
    sessions,
    { ...(source.CRON_SECRET ? { cronSecret: source.CRON_SECRET } : {}) },
  );
}
