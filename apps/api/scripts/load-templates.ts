/**
 * `pnpm --filter @acb/api templates:load`
 *
 * Indexes the three demo corpora into the template rows every new workspace is
 * copied from. Run it once after the migrations, and again whenever a corpus
 * file changes: it is keyed on a hash of the Markdown, so unchanged files cost
 * nothing and nothing is embedded twice.
 *
 * It needs `SUPABASE_DB_URL` and `OPENAI_API_KEY`, because it writes real
 * vectors. Without them it says which one is missing and stops.
 */
import { createOpenAiEmbeddingClient } from '../src/models/embedding';
import { createDatabase, PostgresWorkspaceStore } from '../src/store/postgres';
import { loadTemplates } from '../src/templates';

const missing = ['SUPABASE_DB_URL', 'OPENAI_API_KEY'].filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Set ${missing.join(' and ')} before loading the demo corpora.`);
  process.exit(1);
}

const sql = createDatabase();
const store = new PostgresWorkspaceStore(sql);
const embeddings = createOpenAiEmbeddingClient({ apiKey: process.env.OPENAI_API_KEY });

try {
  const result = await loadTemplates(store, embeddings);
  console.log(`${result.written} documents written, ${result.unchanged} unchanged, ${result.chunks} chunks embedded.`);
} finally {
  await sql.end();
}
