/**
 * Reading the three fictional document sets off disk.
 *
 * They are Markdown files rather than string literals so they can be read and
 * edited like documents, which is what they are. Every set is invented on
 * purpose: a corpus about a real product would let the model answer from its
 * own training data, and the demo would prove nothing about retrieval.
 *
 * A Vercel function that reads these at runtime must list `corpora/**` under
 * `includeFiles` in `vercel.json`, and reads them from `process.cwd()`. The
 * template loader runs as a script, so it reads them relative to this file.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORPUS_LABELS, DEMO_DATA_LABEL, corpusSchema, type Corpus } from '@acb/schemas';

export const CORPORA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'corpora');

export interface CorpusFile {
  slug: string;
  title: string;
  reference: string;
  markdown: string;
  contentHash: string;
}

/** A question the set should answer, with the text that answer has to rest on. */
export interface AnswerableQuestion {
  question: string;
  expect: string;
}

/** A question the set does not cover, with a word its documents never use. */
export interface DeclinedQuestion {
  question: string;
  absent: string;
}

export interface CorpusQuestions {
  label: string;
  answerable: AnswerableQuestion[];
  decline: DeclinedQuestion[];
}

export const ALL_CORPORA: Corpus[] = corpusSchema.options;

/** The first Markdown heading, which is the document title a citation shows. */
function titleOf(markdown: string, fallback: string): string {
  return /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? fallback;
}

export function loadCorpus(corpus: Corpus, root: string = CORPORA_DIR): CorpusFile[] {
  const directory = join(root, corpus);
  return readdirSync(directory)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => {
      const markdown = readFileSync(join(directory, name), 'utf8');
      const slug = name.replace(/\.md$/, '');
      return {
        slug,
        title: titleOf(markdown, slug),
        reference: `${DEMO_DATA_LABEL}: ${CORPUS_LABELS[corpus]}`,
        markdown,
        contentHash: createHash('sha256').update(markdown).digest('hex'),
      };
    });
}

export function loadQuestions(corpus: Corpus, root: string = CORPORA_DIR): CorpusQuestions {
  return JSON.parse(readFileSync(join(root, corpus, 'questions.json'), 'utf8')) as CorpusQuestions;
}
