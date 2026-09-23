import { describe, expect, it } from 'vitest';
import { ALL_CORPORA, loadCorpus } from './corpora';
import { chunkMarkdown } from './ingest/chunk';
import { resolveCitations, SEED_HISTORY, type SeededSource } from './seed-history';

function sourcesOf(corpus: (typeof ALL_CORPORA)[number]): SeededSource[] {
  return loadCorpus(corpus).map((file) => ({
    documentId: crypto.randomUUID(),
    documentTitle: file.title,
    chunks: chunkMarkdown(file.markdown).map((chunk) => ({ chunkId: crypto.randomUUID(), section: chunk.section })),
  }));
}

describe.each(ALL_CORPORA)('seeded history for %s', (corpus) => {
  const history = SEED_HISTORY[corpus];
  const sources = sourcesOf(corpus);

  it('cites only sections its corpus really has', () => {
    for (const conversation of history.conversations) {
      for (const exchange of conversation.exchanges) {
        expect(resolveCitations(exchange.cites, sources)).toHaveLength(exchange.cites.length);
      }
    }
  });

  it('marks every citation it carries in the answer text', () => {
    for (const conversation of history.conversations) {
      for (const exchange of conversation.exchanges) {
        for (const index of exchange.cites.keys()) expect(exchange.answer).toContain(`[${index + 1}]`);
      }
    }
  });

  it('fills the ratings with both verdicts and the gap list with a follow-up', () => {
    const ratings = history.conversations.flatMap((c) => c.exchanges.map((e) => e.rating)).filter(Boolean);
    expect(ratings).toContain('up');
    expect(ratings).toContain('down');
    expect(history.unanswered.some((gap) => gap.email)).toBe(true);
  });

  it('sits outside the chat cap window', () => {
    const hours = [...history.conversations, ...history.unanswered].map((entry) => entry.hoursAgo);
    expect(Math.min(...hours)).toBeGreaterThanOrEqual(1);
  });
});
