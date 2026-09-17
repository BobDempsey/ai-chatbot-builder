/**
 * `pnpm --filter @acb/api eval`
 *
 * Asks the live model a fixed set of questions per corpus and fails on four
 * things a unit test cannot see: an answer with no citation, an answer that
 * misses what its corpus actually says, a figure that appears nowhere in the
 * corpus, and an answer to a question the corpus does not cover.
 *
 * It is modelled on ai-frontend-advisor's `advisor:eval` and shares its purpose:
 * unit tests prove the plumbing with a fake model, and this proves the grounding
 * with the real one.
 *
 * It needs `OPENAI_API_KEY` and nothing else. The workspace is in memory and the
 * corpora are read from disk, so running it does not touch the database or any
 * visitor's data.
 */
import { type ChatEvent, chatEventSchema } from '@acb/schemas';
import { createApi } from '../src/app';
import { ALL_CORPORA, loadCorpus, loadQuestions } from '../src/corpora';
import { extractPdfText, fetchUrlText } from '../src/ingest/sources';
import { createOpenAiAnswerModel } from '../src/models/answer';
import { createOpenAiEmbeddingClient } from '../src/models/embedding';
import { MemoryWorkspaceStore } from '../src/store/memory';
import { MemorySessionStore } from '../src/store/sessions';
import { loadTemplates } from '../src/templates';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Set OPENAI_API_KEY before running the eval. It asks the real model on purpose.');
  process.exit(1);
}

/** Numbers a reader would check: money, days, percentages, temperatures. */
const FIGURE = /\d[\d,.]*/g;

interface Failure {
  corpus: string;
  question: string;
  reason: string;
}

const embeddings = createOpenAiEmbeddingClient({ apiKey });
const model = createOpenAiAnswerModel({ apiKey });
const store = new MemoryWorkspaceStore();

await loadTemplates(store, embeddings);

const api = createApi(
  {
    store,
    embeddings,
    model,
    extractPdf: extractPdfText,
    fetchUrl: fetchUrlText,
    schedule: (work) => {
      void work();
    },
  },
  new MemorySessionStore(store),
);

async function ask(cookie: string, message: string): Promise<{ events: ChatEvent[]; cookie: string }> {
  const response = await api.request('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ message }),
  });
  const set = response.headers.get('set-cookie');
  const body = await response.text();
  return {
    cookie: set ? (set.split(';')[0] as string) : cookie,
    events: body
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => chatEventSchema.parse(JSON.parse(line))),
  };
}

function answerText(events: ChatEvent[]): string {
  return events
    .filter((event): event is Extract<ChatEvent, { type: 'delta' }> => event.type === 'delta')
    .map((event) => event.text)
    .join('');
}

const failures: Failure[] = [];

for (const corpus of ALL_CORPORA) {
  const questions = loadQuestions(corpus);
  // Anything the corpus never says is something the model made up.
  const corpusText = loadCorpus(corpus)
    .map((file) => file.markdown)
    .join('\n');

  const minted = await api.request('/api/documents');
  const cookie = (minted.headers.get('set-cookie')?.split(';')[0] ?? '') as string;
  await api.request('/api/corpus', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ corpus }),
  });

  console.log(`\n${questions.label}`);

  for (const { question, expect } of questions.answerable) {
    const { events } = await ask(cookie, question);
    const text = answerText(events);
    const citations = events.find((event) => event.type === 'citations');
    const cited = citations?.type === 'citations' ? citations.citations : [];

    if (events.some((event) => event.type === 'declined')) {
      failures.push({ corpus, question, reason: 'declined a question the corpus covers' });
      continue;
    }
    if (cited.length === 0) {
      failures.push({ corpus, question, reason: 'answered with no citation' });
      continue;
    }

    if (!text.includes(expect.split(' ')[0] as string)) {
      failures.push({ corpus, question, reason: `the answer misses what the corpus says: ${expect}` });
      continue;
    }

    // Every figure the answer states has to appear somewhere in the corpus.
    const invented = [...text.replace(/\[\d+\]/g, ' ').matchAll(FIGURE)]
      .map((match) => match[0])
      .filter((figure) => !corpusText.includes(figure));
    if (invented.length > 0) {
      failures.push({ corpus, question, reason: `figures absent from the sources: ${invented.join(', ')}` });
      continue;
    }
    console.log(`  ok   ${question}`);
  }

  for (const { question } of questions.decline) {
    const { events } = await ask(cookie, question);
    if (!events.some((event) => event.type === 'declined')) {
      failures.push({ corpus, question, reason: 'answered a question the corpus does not cover' });
      continue;
    }
    console.log(`  ok   declined: ${question}`);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} failures:`);
  for (const failure of failures) console.error(`  ${failure.corpus}: ${failure.question}\n    ${failure.reason}`);
  process.exit(1);
}

console.log('\nEvery corpus answered what it covers and declined what it does not.');
