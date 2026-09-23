/**
 * The in-memory {@link WorkspaceStore}.
 *
 * It exists so the ingestion, retrieval and answering paths can be tested end
 * to end without a database, and so `pnpm dev:api:real` serves the real routes
 * with nothing configured. It copies the two rules the row-level policies
 * enforce, because a test that ignored them would pass on code the database
 * would refuse: a row belongs to exactly one session, and only a document in
 * the `ready` state is reachable by retrieval.
 *
 * Template rows sit outside any session and are never written by a session,
 * which is what makes the demo corpora read-only.
 */
import type { BotSettings, Citation, Conversation, Corpus, Doc, Rating, RatingSummary, UnansweredQuestion } from '@acb/schemas';
import { DEFAULT_BOT_SETTINGS } from '@acb/schemas';
import { cosineDistance } from '../retrieval/distance';
import { HOUR_MS, MESSAGE_GAP_MS, resolveCitations, SEED_HISTORY, type SeededSource } from '../seed-history';
import type {
  BotRecord,
  ChunkRow,
  NewDocument,
  RecordedExchange,
  RetrievedChunk,
  TemplateDocument,
  WorkspaceStore,
} from './store';

interface DocRow extends Doc {
  sessionId: string;
}

interface ChunkRecord extends ChunkRow {
  id: string;
  sessionId: string;
  documentId: string;
}

interface MessageRow {
  id: string;
  sessionId: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  createdAt: string;
}

interface ConversationRow {
  id: string;
  sessionId: string;
  surface: 'preview' | 'widget';
  startedAt: string;
}

interface UnansweredRow extends UnansweredQuestion {
  sessionId: string;
}

const uuid = () => crypto.randomUUID();

export class MemoryWorkspaceStore implements WorkspaceStore {
  private readonly bots = new Map<string, BotRecord>();
  private readonly documents: DocRow[] = [];
  private readonly chunks: ChunkRecord[] = [];
  private readonly conversations: ConversationRow[] = [];
  private readonly messages: MessageRow[] = [];
  private readonly ratings = new Map<string, { sessionId: string; value: Rating }>();
  private readonly unanswered: UnansweredRow[] = [];
  private readonly templates = new Map<string, TemplateDocument>();

  constructor(private readonly now: () => number = Date.now) {}

  private stamp(offsetMs = 0): string {
    return new Date(this.now() + offsetMs).toISOString();
  }

  async seedWorkspace(sessionId: string, corpus: Corpus): Promise<void> {
    if (this.bots.has(sessionId)) return;
    this.bots.set(sessionId, { ...DEFAULT_BOT_SETTINGS, id: uuid(), publicId: uuid(), corpus });
    this.copyTemplate(sessionId, corpus);
    this.seedHistory(sessionId, corpus);
  }

  /** A seeded workspace opens with the set's past conversations, ratings and gaps, so no screen is empty. */
  private seedHistory(sessionId: string, corpus: Corpus): void {
    const sources: SeededSource[] = this.documents
      .filter((doc) => doc.sessionId === sessionId && doc.seeded)
      .map((doc) => ({
        documentId: doc.id,
        documentTitle: doc.title,
        chunks: this.chunks.filter((c) => c.documentId === doc.id).map((c) => ({ chunkId: c.id, section: c.section })),
      }));
    const history = SEED_HISTORY[corpus];

    for (const conversation of history.conversations) {
      const conversationId = uuid();
      const startedAt = -conversation.hoursAgo * HOUR_MS;
      this.conversations.push({ id: conversationId, sessionId, surface: conversation.surface, startedAt: this.stamp(startedAt) });
      conversation.exchanges.forEach((exchange, turn) => {
        const asked = startedAt + turn * 2 * MESSAGE_GAP_MS;
        this.messages.push({
          id: uuid(),
          sessionId,
          conversationId,
          role: 'user',
          content: exchange.question,
          citations: [],
          createdAt: this.stamp(asked),
        });
        const answerId = uuid();
        this.messages.push({
          id: answerId,
          sessionId,
          conversationId,
          role: 'assistant',
          content: exchange.answer,
          citations: resolveCitations(exchange.cites, sources),
          createdAt: this.stamp(asked + MESSAGE_GAP_MS),
        });
        if (exchange.rating) this.ratings.set(answerId, { sessionId, value: exchange.rating });
      });
    }

    for (const gap of history.unanswered) {
      this.unanswered.push({
        id: uuid(),
        sessionId,
        question: gap.question,
        askedAt: this.stamp(-gap.hoursAgo * HOUR_MS),
        ...(gap.email ? { email: gap.email } : {}),
      });
    }
  }

  private copyTemplate(sessionId: string, corpus: Corpus): void {
    for (const template of this.templates.values()) {
      if (template.corpus !== corpus) continue;
      const documentId = uuid();
      this.documents.push({
        id: documentId,
        sessionId,
        title: template.title,
        source: 'markdown',
        reference: template.reference,
        state: 'ready',
        chunkCount: template.chunks.length,
        seeded: true,
        createdAt: this.stamp(),
      });
      for (const chunk of template.chunks) {
        this.chunks.push({ ...chunk, id: uuid(), sessionId, documentId });
      }
    }
  }

  async getBot(sessionId: string): Promise<BotRecord | null> {
    return this.bots.get(sessionId) ?? null;
  }

  async getBotByPublicId(publicId: string): Promise<{ bot: BotRecord; sessionId: string } | null> {
    for (const [sessionId, bot] of this.bots) {
      if (bot.publicId === publicId) return { bot, sessionId };
    }
    return null;
  }

  async updateBot(sessionId: string, settings: BotSettings): Promise<BotRecord> {
    const bot = this.bots.get(sessionId);
    if (!bot) throw new Error('no bot for this session');
    const updated = { ...bot, ...settings };
    this.bots.set(sessionId, updated);
    return updated;
  }

  async setCorpus(sessionId: string, corpus: Corpus): Promise<void> {
    const bot = this.bots.get(sessionId);
    if (!bot) throw new Error('no bot for this session');
    this.bots.set(sessionId, { ...bot, corpus });
    const seeded = new Set(this.documents.filter((d) => d.sessionId === sessionId && d.seeded).map((d) => d.id));
    this.removeAll(this.documents, (d) => seeded.has(d.id));
    this.removeAll(this.chunks, (c) => seeded.has(c.documentId));
    this.copyTemplate(sessionId, corpus);
  }

  private removeAll<T>(rows: T[], matches: (row: T) => boolean): void {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (matches(rows[i] as T)) rows.splice(i, 1);
    }
  }

  private toDoc({ sessionId: _sessionId, ...doc }: DocRow): Doc {
    return doc;
  }

  async listDocuments(sessionId: string): Promise<Doc[]> {
    return this.documents.filter((doc) => doc.sessionId === sessionId).map((doc) => this.toDoc(doc));
  }

  async getDocument(sessionId: string, documentId: string): Promise<Doc | null> {
    const doc = this.documents.find((d) => d.sessionId === sessionId && d.id === documentId);
    return doc ? this.toDoc(doc) : null;
  }

  async countDocuments(sessionId: string): Promise<number> {
    return this.documents.filter((doc) => doc.sessionId === sessionId).length;
  }

  async createDocument(sessionId: string, document: NewDocument): Promise<Doc> {
    const row: DocRow = {
      ...document,
      id: uuid(),
      sessionId,
      state: 'queued',
      chunkCount: 0,
      seeded: false,
      createdAt: this.stamp(),
    };
    this.documents.push(row);
    return this.toDoc(row);
  }

  async setDocumentState(sessionId: string, documentId: string, state: Doc['state'], failure?: string): Promise<void> {
    const doc = this.documents.find((d) => d.sessionId === sessionId && d.id === documentId);
    if (!doc) return;
    doc.state = state;
    if (failure === undefined) delete doc.failure;
    else doc.failure = failure;
  }

  async replaceChunks(sessionId: string, documentId: string, chunks: ChunkRow[]): Promise<void> {
    await this.clearChunks(sessionId, documentId);
    const doc = this.documents.find((d) => d.sessionId === sessionId && d.id === documentId);
    if (!doc) return;
    for (const chunk of chunks) this.chunks.push({ ...chunk, id: uuid(), sessionId, documentId });
    doc.chunkCount = chunks.length;
  }

  async clearChunks(sessionId: string, documentId: string): Promise<void> {
    this.removeAll(this.chunks, (c) => c.sessionId === sessionId && c.documentId === documentId);
    const doc = this.documents.find((d) => d.sessionId === sessionId && d.id === documentId);
    if (doc) doc.chunkCount = 0;
  }

  async matchChunks(sessionId: string, embedding: number[], limit: number, maxDistance: number): Promise<RetrievedChunk[]> {
    const readyDocs = new Map(
      this.documents.filter((doc) => doc.sessionId === sessionId && doc.state === 'ready').map((doc) => [doc.id, doc]),
    );
    return this.chunks
      .filter((chunk) => chunk.sessionId === sessionId && chunk.embedding !== null && readyDocs.has(chunk.documentId))
      .map((chunk) => ({
        chunkId: chunk.id,
        documentId: chunk.documentId,
        documentTitle: readyDocs.get(chunk.documentId)?.title ?? '',
        section: chunk.section,
        content: chunk.content,
        distance: cosineDistance(embedding, chunk.embedding as number[]),
      }))
      .filter((match) => match.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
  }

  async recordExchange(sessionId: string, exchange: RecordedExchange): Promise<{ conversationId: string; messageId: string }> {
    let conversationId = exchange.conversationId;
    const existing = this.conversations.find((c) => c.sessionId === sessionId && c.id === conversationId);
    if (!existing) {
      conversationId = uuid();
      this.conversations.push({ id: conversationId, sessionId, surface: exchange.surface, startedAt: this.stamp() });
    }
    const target = conversationId as string;
    this.messages.push({
      id: uuid(),
      sessionId,
      conversationId: target,
      role: 'user',
      content: exchange.question,
      citations: [],
      createdAt: this.stamp(),
    });
    const messageId = uuid();
    this.messages.push({
      id: messageId,
      sessionId,
      conversationId: target,
      role: 'assistant',
      content: exchange.answer,
      citations: exchange.citations,
      createdAt: this.stamp(),
    });
    return { conversationId: target, messageId };
  }

  async rateMessage(sessionId: string, messageId: string, rating: Rating): Promise<boolean> {
    const message = this.messages.find((m) => m.sessionId === sessionId && m.id === messageId);
    if (!message) return false;
    this.ratings.set(messageId, { sessionId, value: rating });
    return true;
  }

  async listConversations(sessionId: string): Promise<Conversation[]> {
    return this.conversations
      .filter((c) => c.sessionId === sessionId)
      .map((conversation) => ({
        id: conversation.id,
        surface: conversation.surface,
        startedAt: conversation.startedAt,
        messages: this.messages
          .filter((m) => m.conversationId === conversation.id)
          .map((message) => {
            const rating = this.ratings.get(message.id);
            return {
              id: message.id,
              role: message.role,
              content: message.content,
              citations: message.citations,
              createdAt: message.createdAt,
              ...(rating ? { rating: rating.value } : {}),
            };
          }),
      }));
  }

  async ratingSummary(sessionId: string): Promise<RatingSummary> {
    let up = 0;
    let down = 0;
    for (const rating of this.ratings.values()) {
      if (rating.sessionId !== sessionId) continue;
      if (rating.value === 'up') up += 1;
      else down += 1;
    }
    return { up, down };
  }

  async recordUnanswered(sessionId: string, question: string): Promise<{ id: string }> {
    const row: UnansweredRow = { id: uuid(), sessionId, question, askedAt: this.stamp() };
    this.unanswered.push(row);
    return { id: row.id };
  }

  async attachHandoffEmail(sessionId: string, questionId: string, email: string): Promise<boolean> {
    const row = this.unanswered.find((q) => q.sessionId === sessionId && q.id === questionId);
    if (!row) return false;
    row.email = email;
    return true;
  }

  async listUnanswered(sessionId: string): Promise<UnansweredQuestion[]> {
    return this.unanswered.filter((q) => q.sessionId === sessionId).map(({ sessionId: _sessionId, ...question }) => question);
  }

  async countQuestionsSince(sessionId: string, since: Date): Promise<number> {
    return this.messages.filter(
      (m) => m.sessionId === sessionId && m.role === 'user' && Date.parse(m.createdAt) >= since.getTime(),
    ).length;
  }

  async templateIsCurrent(corpus: Corpus, slug: string, contentHash: string): Promise<boolean> {
    return this.templates.get(`${corpus}/${slug}`)?.contentHash === contentHash;
  }

  async writeTemplateDocument(document: TemplateDocument): Promise<void> {
    this.templates.set(`${document.corpus}/${document.slug}`, document);
  }

  async countTemplateDocuments(corpus: Corpus): Promise<number> {
    return [...this.templates.values()].filter((template) => template.corpus === corpus).length;
  }
}
