/**
 * Getting material into a workspace: a PDF, pasted Markdown or a help-center
 * URL, plus the status the dashboard polls while it indexes.
 *
 * Every source is read before a row exists. A PDF that will not parse or a URL
 * that will not fetch is refused with one sentence and leaves nothing behind,
 * which is what the spec means by creating no partial document.
 *
 * The caps are applied here, before the extractor and long before the embedding
 * call, so a refusal costs nothing at the provider.
 */
import {
  MAX_DOCUMENTS_PER_SESSION,
  MAX_UPLOAD_BYTES,
  corpusChoiceSchema,
  markdownUploadSchema,
  urlUploadSchema,
} from '@acb/schemas';
import { Hono } from 'hono';
import { indexDocument } from '../ingest/pipeline';
import { UnreadableSourceError } from '../ingest/sources';
import type { ApiDeps } from './deps';

const sizeLimitSentence = `That file is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1_000_000)} MB upload limit.`;
const countLimitSentence = `This demo holds ${MAX_DOCUMENTS_PER_SESSION} documents at a time. Delete one before adding another.`;

export function documentRoutes(deps: ApiDeps) {
  const routes = new Hono();

  /** Refuses when the session is already at its document cap. */
  const atCap = async (sessionId: string) => (await deps.store.countDocuments(sessionId)) >= MAX_DOCUMENTS_PER_SESSION;

  routes.get('/api/documents', async (c) => {
    return c.json({ documents: await deps.store.listDocuments(c.get('session').id) });
  });

  routes.get('/api/documents/:id', async (c) => {
    const document = await deps.store.getDocument(c.get('session').id, c.req.param('id'));
    if (!document) return c.json({ error: 'That document does not exist.' }, 404);
    return c.json(document);
  });

  routes.post('/api/documents/markdown', async (c) => {
    const sessionId = c.get('session').id;
    if (await atCap(sessionId)) return c.json({ error: countLimitSentence }, 429);

    const parsed = markdownUploadSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Give the document a title and some text.' }, 400);
    if (parsed.data.markdown.length > MAX_UPLOAD_BYTES) return c.json({ error: sizeLimitSentence }, 413);

    const document = await deps.store.createDocument(sessionId, {
      title: parsed.data.title,
      source: 'markdown',
      reference: 'Pasted Markdown',
    });
    deps.schedule(() => indexDocument(deps.store, deps.embeddings, sessionId, document.id, parsed.data.markdown));
    return c.json(document, 202);
  });

  routes.post('/api/documents/url', async (c) => {
    const sessionId = c.get('session').id;
    if (await atCap(sessionId)) return c.json({ error: countLimitSentence }, 429);

    const parsed = urlUploadSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'That does not look like a web address.' }, 400);

    let page: { title: string; text: string };
    try {
      page = await deps.fetchUrl(parsed.data.url);
    } catch (error) {
      return c.json({ error: reasonFor(error, 'That page could not be read.') }, 422);
    }
    if (page.text.length > MAX_UPLOAD_BYTES) return c.json({ error: sizeLimitSentence }, 413);

    const document = await deps.store.createDocument(sessionId, {
      title: page.title,
      source: 'url',
      reference: parsed.data.url,
    });
    deps.schedule(() => indexDocument(deps.store, deps.embeddings, sessionId, document.id, page.text));
    return c.json(document, 202);
  });

  routes.post('/api/documents/pdf', async (c) => {
    const sessionId = c.get('session').id;
    if (await atCap(sessionId)) return c.json({ error: countLimitSentence }, 429);

    // The declared length is checked before the body is read, so an oversized
    // upload is refused without buffering it.
    const declared = Number(c.req.header('content-length') ?? 0);
    if (declared > MAX_UPLOAD_BYTES) return c.json({ error: sizeLimitSentence }, 413);

    const form = await c.req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return c.json({ error: 'Choose a PDF file to upload.' }, 400);
    if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: sizeLimitSentence }, 413);

    let text: string;
    try {
      text = await deps.extractPdf(new Uint8Array(await file.arrayBuffer()));
    } catch (error) {
      return c.json({ error: reasonFor(error, 'That file could not be read as a PDF.') }, 422);
    }

    const document = await deps.store.createDocument(sessionId, {
      title: file.name.replace(/\.pdf$/i, '') || 'Uploaded PDF',
      source: 'pdf',
      reference: file.name,
    });
    deps.schedule(() => indexDocument(deps.store, deps.embeddings, sessionId, document.id, text));
    return c.json(document, 202);
  });

  routes.post('/api/corpus', async (c) => {
    const parsed = corpusChoiceSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'That is not one of the demo document sets.' }, 400);
    const sessionId = c.get('session').id;
    await deps.store.setCorpus(sessionId, parsed.data.corpus);
    return c.json({ documents: await deps.store.listDocuments(sessionId) });
  });

  return routes;
}

function reasonFor(error: unknown, fallback: string): string {
  return error instanceof UnreadableSourceError ? error.message : fallback;
}
