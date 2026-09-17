/**
 * The demo corpora and the loader that indexes them.
 *
 * The first test is the one that keeps the demo honest: every question a set
 * claims to answer has to be answerable from that set's own Markdown, and every
 * question it claims not to cover has to be genuinely absent.
 */
import { CORPUS_LABELS, DEMO_DATA_LABEL } from '@acb/schemas';
import { describe, expect, it } from 'vitest';
import { ALL_CORPORA, loadCorpus, loadQuestions } from './corpora';
import { MemoryWorkspaceStore } from './store/memory';
import { loadTemplates } from './templates';
import { createFakeEmbeddingClient } from './testing';

describe('the three fictional document sets', () => {
  it('ships all three, with the SaaS help center first', () => {
    expect(ALL_CORPORA).toEqual(['saas-help-center', 'recipes', 'employee-handbook']);
  });

  for (const corpus of ALL_CORPORA) {
    describe(CORPUS_LABELS[corpus], () => {
      const files = loadCorpus(corpus);
      const text = files.map((file) => file.markdown).join('\n');
      const questions = loadQuestions(corpus);

      it('labels every document as fictional demo data', () => {
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
          expect(file.reference).toContain(DEMO_DATA_LABEL);
          expect(file.markdown).toContain('Fictional demo data');
          expect(file.title).not.toBe(file.slug);
        }
      });

      it('covers every question its fixture says it answers', () => {
        expect(questions.answerable.length).toBeGreaterThan(0);
        for (const { expect: grounding } of questions.answerable) {
          expect(text, `"${grounding}" is missing from ${corpus}`).toContain(grounding);
        }
      });

      it('says nothing about the questions it is meant to decline', () => {
        expect(questions.decline.length).toBeGreaterThan(0);
        for (const { question, absent } of questions.decline) {
          expect(text.toLowerCase(), `${corpus} answers "${question}" after all`).not.toContain(absent.toLowerCase());
        }
      });
    });
  }
});

describe('the template loader', () => {
  it('indexes every set once and writes nothing on a second run', async () => {
    const store = new MemoryWorkspaceStore();
    const embeddings = createFakeEmbeddingClient();

    const first = await loadTemplates(store, embeddings);
    expect(first.written).toBe(ALL_CORPORA.flatMap((corpus) => loadCorpus(corpus)).length);
    expect(first.chunks).toBeGreaterThan(0);
    const callsAfterFirst = embeddings.calls;

    const second = await loadTemplates(store, embeddings);
    expect(second.written).toBe(0);
    expect(second.unchanged).toBe(first.written);
    // Nothing was embedded again, which is what idempotent has to mean here.
    expect(embeddings.calls).toBe(callsAfterFirst);

    for (const corpus of ALL_CORPORA) {
      expect(await store.countTemplateDocuments(corpus)).toBe(loadCorpus(corpus).length);
    }
  });
});
