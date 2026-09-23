/**
 * The Postgres store against a real database, with the real migrations and
 * the real row-level policies.
 *
 * Every other test drives the in-memory store, which copies the rules the
 * policies enforce but not the driver or the SQL. Two bugs reached the live
 * site through that gap: seeding that wrote no history, and citations stored
 * as a JSON string. Both would have failed here.
 *
 * It runs only when `ACB_TEST_DB_URL` is set, which CI does against a
 * throwaway Supabase Postgres container with `supabase/migrations/` applied.
 * It loads the templates with fake embeddings, so it must never point at the
 * live project, and it refuses a Supabase-hosted URL outright.
 */
import {
  type Citation,
  type Corpus,
  conversationSchema,
  DEFAULT_CORPUS,
  documentSchema,
  unansweredQuestionSchema,
} from '@acb/schemas';
import type { Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_HISTORY } from '../seed-history';
import { loadTemplates } from '../templates';
import { createFakeEmbeddingClient, fakeEmbedding } from '../testing';
import { createDatabase, PostgresWorkspaceStore } from './postgres';
import { PostgresSessionStore } from './sessions';

const url = process.env.ACB_TEST_DB_URL;

if (url && /supabase\.(co|com)/.test(url)) {
  throw new Error('ACB_TEST_DB_URL points at a hosted Supabase project. These tests overwrite the templates.');
}

describe.skipIf(!url)('PostgresWorkspaceStore against a real database', () => {
  let sql: Sql;
  let store: PostgresWorkspaceStore;
  let sessions: PostgresSessionStore;

  beforeAll(async () => {
    sql = createDatabase(url);
    store = new PostgresWorkspaceStore(sql);
    sessions = new PostgresSessionStore(sql, store);
    await loadTemplates(store, createFakeEmbeddingClient());
  });

  afterAll(async () => {
    await sql`delete from sessions`;
    await sql.end();
  });

  const newSession = async () => (await sessions.create()).id;

  describe('seeding', () => {
    it('copies the default set and its history, and every row parses', async () => {
      const id = await newSession();
      const history = SEED_HISTORY[DEFAULT_CORPUS];

      const documents = await store.listDocuments(id);
      expect(documents.length).toBe(await store.countTemplateDocuments(DEFAULT_CORPUS));
      for (const doc of documents) expect(documentSchema.parse(doc).seeded).toBe(true);

      const conversations = await store.listConversations(id);
      expect(conversations).toHaveLength(history.conversations.length);
      for (const conversation of conversations) conversationSchema.parse(conversation);

      const answers = conversations.flatMap((c) => c.messages).filter((m) => m.role === 'assistant');
      for (const answer of answers) {
        expect(Array.isArray(answer.citations)).toBe(true);
        expect(answer.citations.length).toBeGreaterThan(0);
      }

      const exchanges = history.conversations.flatMap((c) => c.exchanges);
      expect(await store.ratingSummary(id)).toEqual({
        up: exchanges.filter((e) => e.rating === 'up').length,
        down: exchanges.filter((e) => e.rating === 'down').length,
      });

      const unanswered = await store.listUnanswered(id);
      expect(unanswered).toHaveLength(history.unanswered.length);
      for (const question of unanswered) unansweredQuestionSchema.parse(question);
    });

    it('keeps the seeded questions out of the chat cap', async () => {
      const id = await newSession();
      expect(await store.countQuestionsSince(id, new Date(Date.now() - 10 * 60_000))).toBe(0);
    });
  });

  describe('the record', () => {
    it('stores citations as an array and keeps a rating', async () => {
      const id = await newSession();
      const [seeded] = await store.listConversations(id);
      const citations = seeded?.messages.find((m) => m.role === 'assistant')?.citations as Citation[];

      const { messageId } = await store.recordExchange(id, {
        question: 'How long do I have to ask for a refund?',
        answer: 'Thirty days. [1]',
        citations,
        surface: 'widget',
      });
      expect(await store.rateMessage(id, messageId, 'down')).toBe(true);

      const [row] = await sql<{ kind: string }[]>`select jsonb_typeof(citations) as kind from messages where id = ${messageId}`;
      expect(row?.kind).toBe('array');

      const message = (await store.listConversations(id)).flatMap((c) => c.messages).find((m) => m.id === messageId);
      expect(message?.citations).toEqual(citations);
      expect(message?.rating).toBe('down');
      expect(await store.countQuestionsSince(id, new Date(Date.now() - 60_000))).toBe(1);
    });

    it('attaches a follow-up email to an unanswered question', async () => {
      const id = await newSession();
      const { id: questionId } = await store.recordUnanswered(id, 'Do you ship to the moon?');
      expect(await store.attachHandoffEmail(id, questionId, 'visitor@example.com')).toBe(true);
      const question = (await store.listUnanswered(id)).find((q) => q.id === questionId);
      expect(question?.email).toBe('visitor@example.com');
    });
  });

  describe('isolation', () => {
    it('shows one session nothing of another', async () => {
      const a = await newSession();
      const b = await newSession();
      const { messageId } = await store.recordExchange(a, { question: 'q', answer: 'a', citations: [], surface: 'preview' });

      expect(await store.rateMessage(b, messageId, 'up')).toBe(false);
      const seen = (await store.listConversations(b)).flatMap((c) => c.messages).map((m) => m.id);
      expect(seen).not.toContain(messageId);

      const aDocs = new Set((await store.listDocuments(a)).map((d) => d.id));
      for (const doc of await store.listDocuments(b)) expect(aDocs.has(doc.id)).toBe(false);
    });

    it('resolves a public bot id to its own session only while it lives', async () => {
      const id = await newSession();
      const bot = await store.getBot(id);
      expect((await store.getBotByPublicId(bot?.publicId as string))?.sessionId).toBe(id);

      await sql`update sessions set expires_at = now() - interval '1 second' where id = ${id}`;
      expect(await store.getBotByPublicId(bot?.publicId as string)).toBeNull();
      expect(await store.listConversations(id)).toEqual([]);
    });
  });

  describe('documents and retrieval', () => {
    it('retrieves only ready documents, nearest first', async () => {
      const id = await newSession();
      const question = fakeEmbedding('How long do I have to ask for a refund?');
      const before = await store.matchChunks(id, question, 6, 2);
      expect(before.length).toBeGreaterThan(0);
      const distances = before.map((m) => m.distance);
      expect(distances).toEqual([...distances].sort((x, y) => x - y));

      const upload = await store.createDocument(id, { title: 'Moon shipping', source: 'markdown', reference: 'upload' });
      await store.replaceChunks(id, upload.id, [
        { ordinal: 0, section: 'Moon', content: 'refund refund refund', embedding: fakeEmbedding('refund refund refund') },
      ]);
      const whileIndexing = await store.matchChunks(id, question, 50, 2);
      expect(whileIndexing.some((m) => m.documentId === upload.id)).toBe(false);

      await store.setDocumentState(id, upload.id, 'ready');
      const ready = await store.matchChunks(id, question, 50, 2);
      expect(ready.some((m) => m.documentId === upload.id)).toBe(true);
    });

    it('swaps the seeded set and leaves uploads alone', async () => {
      const id = await newSession();
      const upload = await store.createDocument(id, { title: 'Mine', source: 'markdown', reference: 'upload' });
      const next: Corpus = 'recipes';

      await store.setCorpus(id, next);
      const documents = await store.listDocuments(id);
      expect(documents.filter((d) => d.seeded)).toHaveLength(await store.countTemplateDocuments(next));
      expect(documents.some((d) => d.id === upload.id)).toBe(true);
      expect((await store.getBot(id))?.corpus).toBe(next);
    });
  });

  describe('the sweep', () => {
    it('deletes expired workspaces and leaves live ones and the templates', async () => {
      const dead = await newSession();
      const live = await newSession();
      const templates = await store.countTemplateDocuments(DEFAULT_CORPUS);
      await sql`update sessions set expires_at = now() - interval '1 second' where id = ${dead}`;

      expect(await sessions.sweepExpired()).toBeGreaterThanOrEqual(1);
      const [left] = await sql<{ count: string }[]>`select count(*) from messages where session_id = ${dead}`;
      expect(Number(left?.count)).toBe(0);
      expect((await store.listConversations(live)).length).toBeGreaterThan(0);
      expect(await store.countTemplateDocuments(DEFAULT_CORPUS)).toBe(templates);
    });
  });
});
