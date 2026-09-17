/**
 * Citation resolution, history bounding and the prompt, checked directly rather
 * than through a request, so each rule has a test that names it.
 */
import { MAX_HISTORY_ANSWER_CHARS, MAX_HISTORY_TURNS } from '@acb/schemas';
import { describe, expect, it } from 'vitest';
import type { BotRecord, RetrievedChunk } from '../store/store';
import { CitationFilter, resolveCitations } from './citations';
import { cosineDistance } from './distance';
import { boundHistory, buildSystemPrompt } from './prompt';

const chunk = (n: number): RetrievedChunk => ({
  chunkId: `chunk-${n}`,
  documentId: `doc-${n}`,
  documentTitle: `Document ${n}`,
  section: `Section ${n}`,
  content: `Content ${n}`,
  distance: 0.1 * n,
});

const CHUNKS = [chunk(1), chunk(2), chunk(3)];

describe('citations', () => {
  it('renumbers to the order the answer uses them', () => {
    const { text, citations } = resolveCitations('See [3] and then [2].', CHUNKS);
    expect(text).toBe('See [1] and then [2].');
    expect(citations.map((citation) => citation.chunkId)).toEqual(['chunk-3', 'chunk-2']);
    expect(citations.map((citation) => citation.index)).toEqual([1, 2]);
  });

  it('reuses one number for a source cited twice', () => {
    const { text, citations } = resolveCitations('First [2]. Again [2].', CHUNKS);
    expect(text).toBe('First [1]. Again [1].');
    expect(citations).toHaveLength(1);
  });

  it('deletes a number the retrieval set does not contain', () => {
    const { text, citations } = resolveCitations('Grounded [1] and invented [9].', CHUNKS);
    expect(text).toBe('Grounded [1] and invented.');
    expect(citations).toHaveLength(1);
  });

  it('never emits a citation pointing outside the retrieval set', () => {
    const { citations } = resolveCitations('[1] [2] [3] [4] [5]', CHUNKS);
    const retrieved = new Set(CHUNKS.map((c) => c.chunkId));
    expect(citations.every((citation) => retrieved.has(citation.chunkId))).toBe(true);
  });

  it('holds a marker split across two deltas until it is whole', () => {
    const filter = new CitationFilter(CHUNKS);
    expect(filter.push('Refunds run 30 days. [')).toBe('Refunds run 30 days. ');
    expect(filter.push('1] Ask from Billing.')).toBe('[1] Ask from Billing.');
    expect(filter.flush()).toBe('');
    expect(filter.citations()).toHaveLength(1);
  });

  it('drops a marker the model never finished', () => {
    const filter = new CitationFilter(CHUNKS);
    filter.push('Cut off here [1');
    expect(filter.flush()).toBe('');
    expect(filter.citations()).toHaveLength(0);
  });
});

describe('history bounding', () => {
  it('keeps only the most recent turns', () => {
    const history = Array.from({ length: MAX_HISTORY_TURNS + 6 }, (_value, index) => ({
      role: 'user' as const,
      content: `turn ${index}`,
    }));
    const bounded = boundHistory(history);
    expect(bounded).toHaveLength(MAX_HISTORY_TURNS);
    expect(bounded.at(-1)?.content).toBe(`turn ${history.length - 1}`);
  });

  it('truncates a long turn to its cap', () => {
    const [turn] = boundHistory([{ role: 'assistant', content: 'x'.repeat(MAX_HISTORY_ANSWER_CHARS + 500) }]);
    expect(turn?.content).toHaveLength(MAX_HISTORY_ANSWER_CHARS);
  });

  it('removes a failure sentence so it is never replayed', () => {
    const bounded = boundHistory([
      { role: 'user', content: 'a question' },
      { role: 'assistant', content: 'The assistant is busy right now. Wait a few seconds and ask again.' },
    ]);
    expect(bounded.map((turn) => turn.content)).toEqual(['a question']);
  });
});

describe('the prompt', () => {
  const bot: BotRecord = {
    id: 'bot',
    publicId: 'public',
    corpus: 'saas-help-center',
    name: 'Northwind Support',
    accentColor: '#2563eb',
    greeting: 'Hi',
    tone: 'formal',
  };

  it('numbers the sources and forbids anything outside them', () => {
    const prompt = buildSystemPrompt(bot, CHUNKS);
    expect(prompt).toContain('[1] Document 1 — Section 1');
    expect(prompt).toContain('[3] Document 3 — Section 3');
    expect(prompt).toContain('Use only the sources');
    expect(prompt).toContain('formally');
    expect(prompt).toContain('Northwind Support');
  });
});

describe('cosine distance', () => {
  it('is zero for the same direction and one for an orthogonal pair', () => {
    expect(cosineDistance([1, 2, 3], [2, 4, 6])).toBeCloseTo(0);
    expect(cosineDistance([1, 0], [0, 1])).toBeCloseTo(1);
  });

  it('treats a zero vector as near nothing', () => {
    expect(cosineDistance([0, 0], [1, 1])).toBe(1);
  });
});
