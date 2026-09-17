/**
 * Documents and the indexing work behind them. The dashboard polls
 * {@link documentSchema} to draw progress, so the states below are the whole
 * vocabulary of that progress bar.
 */
import { z } from 'zod';

export const documentStateSchema = z.enum(['queued', 'extracting', 'embedding', 'ready', 'failed']);
export type DocumentState = z.infer<typeof documentStateSchema>;

export const documentSourceSchema = z.enum(['pdf', 'markdown', 'url']);
export type DocumentSource = z.infer<typeof documentSourceSchema>;

export const documentSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  source: documentSourceSchema,
  /** The URL it came from, or the file name. Shown beside the title. */
  reference: z.string(),
  state: documentStateSchema,
  /** Known once the chunker has run; zero before that. */
  chunkCount: z.number().int().nonnegative(),
  /** Set only in the `failed` state: one plain sentence naming the reason. */
  failure: z.string().optional(),
  /** True for documents copied from a demo corpus, so the UI can label them. */
  seeded: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type Doc = z.infer<typeof documentSchema>;

/** A pasted document. PDFs arrive as multipart instead. */
export const markdownUploadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  markdown: z.string().trim().min(1),
});
export type MarkdownUpload = z.infer<typeof markdownUploadSchema>;

export const urlUploadSchema = z.object({
  url: z.url(),
});
export type UrlUpload = z.infer<typeof urlUploadSchema>;

/** The three fictional corpora a session can pick between. */
export const corpusSchema = z.enum(['saas-help-center', 'recipes', 'employee-handbook']);
export type Corpus = z.infer<typeof corpusSchema>;

export const corpusChoiceSchema = z.object({ corpus: corpusSchema });
export type CorpusChoice = z.infer<typeof corpusChoiceSchema>;

export const DEFAULT_CORPUS: Corpus = 'saas-help-center';

export const CORPUS_LABELS: Record<Corpus, string> = {
  'saas-help-center': 'Northwind Cloud help center',
  recipes: 'Fictional recipe collection',
  'employee-handbook': 'Fictional employee handbook',
};

/** Shown beside every corpus, and on every document copied from one. */
export const DEMO_DATA_LABEL = 'Fictional demo data';
