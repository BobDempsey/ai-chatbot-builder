/**
 * The one door every route uses to reach data.
 *
 * Routes never write SQL. They take a {@link WorkspaceStore}, which is why the
 * whole request path runs in unit tests against the in-memory implementation
 * with no database, no key and no network. The Postgres implementation is the
 * same interface over the session-scoped tables, and both are held to one rule:
 * every method takes the asking session and reaches only that session's rows.
 */
import type {
  BotSettings,
  Citation,
  Conversation,
  Corpus,
  Doc,
  DocumentSource,
  DocumentState,
  Rating,
  RatingSummary,
  UnansweredQuestion,
} from '@acb/schemas';

/** The bot as the API holds it: settings plus the ids and the chosen corpus. */
export interface BotRecord extends BotSettings {
  id: string;
  publicId: string;
  corpus: Corpus;
}

/** A chunk ready to be stored. The embedding is null until it is computed. */
export interface ChunkRow {
  ordinal: number;
  section: string;
  content: string;
  embedding: number[] | null;
}

/** What retrieval hands back, before citation numbers are assigned. */
export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  section: string;
  content: string;
  distance: number;
}

/** One template document, as the loader writes it and seeding copies it. */
export interface TemplateDocument {
  corpus: Corpus;
  slug: string;
  title: string;
  reference: string;
  /** Hash of the source Markdown. Re-running the loader over the same text writes nothing. */
  contentHash: string;
  chunks: ChunkRow[];
}

export interface NewDocument {
  title: string;
  source: DocumentSource;
  reference: string;
}

export interface RecordedExchange {
  question: string;
  answer: string;
  citations: Citation[];
  surface: 'preview' | 'widget';
  conversationId?: string;
}

export interface WorkspaceStore {
  /** Seeds a brand-new session: one bot, the corpus, and prior conversations and ratings. */
  seedWorkspace(sessionId: string, corpus: Corpus): Promise<void>;

  getBot(sessionId: string): Promise<BotRecord | null>;
  /** The bot a cross-origin widget names by public id. That id grants asking, nothing else. */
  getBotByPublicId(publicId: string): Promise<{ bot: BotRecord; sessionId: string } | null>;
  updateBot(sessionId: string, settings: BotSettings): Promise<BotRecord>;
  /** Replaces every seeded document with the chosen corpus, leaving uploads alone. */
  setCorpus(sessionId: string, corpus: Corpus): Promise<void>;

  listDocuments(sessionId: string): Promise<Doc[]>;
  getDocument(sessionId: string, documentId: string): Promise<Doc | null>;
  countDocuments(sessionId: string): Promise<number>;
  createDocument(sessionId: string, document: NewDocument): Promise<Doc>;
  setDocumentState(sessionId: string, documentId: string, state: DocumentState, failure?: string): Promise<void>;
  /** Writes the finished chunk set and the count together, replacing anything earlier. */
  replaceChunks(sessionId: string, documentId: string, chunks: ChunkRow[]): Promise<void>;
  /** Drops a half-indexed document's chunks so retrieval can never find them. */
  clearChunks(sessionId: string, documentId: string): Promise<void>;

  /** Top-k over this session's ready documents, nearest first. */
  matchChunks(sessionId: string, embedding: number[], limit: number, maxDistance: number): Promise<RetrievedChunk[]>;

  recordExchange(sessionId: string, exchange: RecordedExchange): Promise<{ conversationId: string; messageId: string }>;
  rateMessage(sessionId: string, messageId: string, rating: Rating): Promise<boolean>;
  listConversations(sessionId: string): Promise<Conversation[]>;
  ratingSummary(sessionId: string): Promise<RatingSummary>;

  recordUnanswered(sessionId: string, question: string): Promise<{ id: string }>;
  /** Attaches the address a visitor left. False when the question belongs elsewhere. */
  attachHandoffEmail(sessionId: string, questionId: string, email: string): Promise<boolean>;
  listUnanswered(sessionId: string): Promise<UnansweredQuestion[]>;

  /** Questions asked since a moment, which is how the per-session chat cap counts. */
  countQuestionsSince(sessionId: string, since: Date): Promise<number>;

  /** True when the stored template already carries this hash, so nothing needs embedding. */
  templateIsCurrent(corpus: Corpus, slug: string, contentHash: string): Promise<boolean>;
  /** Writes a template document and its chunks, replacing any earlier version. */
  writeTemplateDocument(document: TemplateDocument): Promise<void>;
  countTemplateDocuments(corpus: Corpus): Promise<number>;
}
