/** What retrieval actually returns for the three failing questions. */
import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url), quiet: true });
const { createOpenAiEmbeddingClient } = await import('./src/models/embedding.ts');
const { createDatabase } = await import('./src/store/postgres.ts');

const sql = createDatabase(process.env.SUPABASE_DB_URL as string);
const embeddings = createOpenAiEmbeddingClient({ apiKey: process.env.OPENAI_API_KEY as string });

const questions = [
  'How many does the fish pie serve?',
  'What wine goes with fish pie?',
  'How many calories are in the green soup?',
  'How do I make a chocolate cake?',
];

for (const q of questions) {
  const [vector] = await embeddings.embed([q]);
  const rows = await sql<{ title: string; section: string; distance: number; content: string }[]>`
    select d.title, c.section, (c.embedding <=> ${`[${vector?.join(',')}]`}::extensions.vector) as distance, c.content
    from template_chunks c join template_documents d on d.id = c.template_document_id
    where d.corpus = 'recipes'
    order by distance limit 3`;
  console.log(`\n${q}`);
  for (const r of rows) console.log(`  ${r.distance.toFixed(3)}  ${r.title} / ${r.section}  ${r.content.slice(0, 70).replace(/\n/g, ' ')}`);
}
await sql.end();
