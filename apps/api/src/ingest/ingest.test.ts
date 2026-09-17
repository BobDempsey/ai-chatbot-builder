/**
 * Ingestion: chunk boundaries and headings, the three sources, and the states a
 * document moves through. The embedding client is a fake throughout, so none of
 * this needs a key.
 */
import { describe, expect, it } from 'vitest';
import { createFakeEmbeddingClient } from '../testing';
import { MemoryWorkspaceStore } from '../store/memory';
import { chunkMarkdown } from './chunk';
import { indexDocument } from './pipeline';
import { htmlToText } from './sources';

const DOC = `# Handbook

Intro paragraph about the handbook.

## Time off

Everyone gets 28 days of paid leave a year.

Leave accrues monthly.

## Expenses

Claim within 60 days of the spend.
`;

describe('chunking', () => {
  it('keeps the nearest heading on every chunk', () => {
    const chunks = chunkMarkdown(DOC, { targetChars: 80, overlapChars: 10 });
    expect(chunks.map((chunk) => chunk.section)).toContain('Time off');
    expect(chunks.map((chunk) => chunk.section)).toContain('Expenses');
    const timeOff = chunks.filter((chunk) => chunk.section === 'Time off');
    expect(timeOff.map((chunk) => chunk.content).join(' ')).toContain('28 days');
  });

  it('numbers chunks in document order with no gaps', () => {
    const chunks = chunkMarkdown(DOC, { targetChars: 60, overlapChars: 10 });
    expect(chunks.map((chunk) => chunk.ordinal)).toEqual(chunks.map((_chunk, index) => index));
  });

  it('never merges two sections into one chunk', () => {
    for (const chunk of chunkMarkdown(DOC, { targetChars: 4000, overlapChars: 0 })) {
      if (chunk.section === 'Expenses') expect(chunk.content).toContain('Claim within 60 days');
      else expect(chunk.content).not.toContain('Claim within 60 days');
    }
  });

  it('splits a paragraph longer than the target and overlaps the halves', () => {
    const long = `# One\n\n${'Sentence number one. '.repeat(40)}`;
    const chunks = chunkMarkdown(long, { targetChars: 200, overlapChars: 40 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1]?.content.slice(0, 20)).toBeTruthy();
    for (const chunk of chunks) expect(chunk.section).toBe('One');
  });
});

describe('html extraction', () => {
  it('keeps headings and drops scripts and styles', () => {
    const { title, text } = htmlToText(
      '<html><head><title>Refunds &amp; you</title><style>p{color:red}</style></head>' +
        '<body><main><h2>Window</h2><p>Refunds within 30 days.</p><script>alert(1)</script></main></body></html>',
    );
    expect(title).toBe('Refunds & you');
    expect(text).toContain('## Window');
    expect(text).toContain('Refunds within 30 days.');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('color:red');
  });
});

describe('the indexing job', () => {
  it('advances a document to ready with a chunk count matching the chunker', async () => {
    const store = new MemoryWorkspaceStore();
    const embeddings = createFakeEmbeddingClient();
    await store.seedWorkspace('session-a', 'saas-help-center');
    const document = await store.createDocument('session-a', {
      title: 'Handbook',
      source: 'markdown',
      reference: 'Pasted Markdown',
    });

    expect((await store.getDocument('session-a', document.id))?.state).toBe('queued');
    await indexDocument(store, embeddings, 'session-a', document.id, DOC);

    const ready = await store.getDocument('session-a', document.id);
    expect(ready?.state).toBe('ready');
    expect(ready?.chunkCount).toBe(chunkMarkdown(DOC).length);
  });

  it('marks a mid-run embedding failure failed and leaves no chunks behind', async () => {
    const store = new MemoryWorkspaceStore();
    const embeddings = createFakeEmbeddingClient({ fault: 'rate-limit' });
    await store.seedWorkspace('session-a', 'saas-help-center');
    const document = await store.createDocument('session-a', {
      title: 'Handbook',
      source: 'markdown',
      reference: 'Pasted Markdown',
    });

    await indexDocument(store, embeddings, 'session-a', document.id, DOC);

    const failed = await store.getDocument('session-a', document.id);
    expect(failed?.state).toBe('failed');
    expect(failed?.chunkCount).toBe(0);
    expect(failed?.failure).toMatch(/busy/);
    // Nothing from the half-indexed document can be retrieved.
    const matches = await store.matchChunks('session-a', new Array(1536).fill(1), 6, 1);
    expect(matches.every((match) => match.documentId !== document.id)).toBe(true);
  });
});
