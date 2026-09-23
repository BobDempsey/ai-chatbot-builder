/**
 * The {@link WorkspaceStore} over Supabase Postgres.
 *
 * Every session-scoped call runs in a transaction that first drops to the
 * `authenticated` role and sets `request.acb_session`, which is the claim the
 * row-level policies compare against. Isolation is therefore the database's
 * job, not this file's: a query here that forgot its `where session_id` clause
 * would still return nothing belonging to anyone else.
 *
 * Three calls deliberately run as the owner instead. Resolving a public bot id
 * happens before any session is known, because it is how a widget on someone
 * else's page names the bot it is embedded for. Writing template rows is the
 * loader's job and no session may do it. Minting a session precedes its own
 * claim.
 *
 * It reads `SUPABASE_DB_URL`, a pooled Postgres connection string, rather than
 * going through PostgREST: PostgREST cannot carry a custom session setting into
 * the transaction, and the service role key would bypass the policies entirely,
 * which would move isolation back into application code.
 *
 * This implementation has not been exercised against the live project: there
 * are no credentials in this environment yet. The schema it targets is the one
 * in `supabase/migrations/`, and the in-memory store is what the tests run.
 */
import type {
  BotSettings,
  Citation,
  Conversation,
  Corpus,
  Doc,
  DocumentState,
  Message,
  Rating,
  RatingSummary,
  UnansweredQuestion,
} from '@acb/schemas';
import postgres, { type Sql, type TransactionSql } from 'postgres';
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

/** pgvector reads its literal form, which is a bracketed comma-separated list. */
function toVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

interface BotColumns {
  id: string;
  public_id: string;
  name: string;
  accent_color: string;
  greeting: string;
  tone: BotRecord['tone'];
  corpus: Corpus;
}

interface DocumentColumns {
  id: string;
  title: string;
  source: Doc['source'];
  reference: string;
  state: DocumentState;
  chunk_count: number;
  failure: string | null;
  seeded: boolean;
  created_at: Date;
}

function toBot(row: BotColumns): BotRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    name: row.name,
    accentColor: row.accent_color,
    greeting: row.greeting,
    tone: row.tone,
    corpus: row.corpus,
  };
}

function toDoc(row: DocumentColumns): Doc {
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    reference: row.reference,
    state: row.state,
    chunkCount: row.chunk_count,
    seeded: row.seeded,
    createdAt: row.created_at.toISOString(),
    ...(row.failure ? { failure: row.failure } : {}),
  };
}

export function createDatabase(url = process.env.SUPABASE_DB_URL): Sql {
  if (!url) throw new Error('SUPABASE_DB_URL is not set. The API cannot reach the database.');
  return postgres(url, { prepare: false });
}

export class PostgresWorkspaceStore implements WorkspaceStore {
  constructor(private readonly sql: Sql) {}

  /** Runs `work` under the session's claim, with the policies in force. */
  private async asSession<T>(sessionId: string, work: (tx: TransactionSql) => Promise<T>): Promise<T> {
    return this.sql.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.acb_session', ${sessionId}, true)`;
      return work(tx);
    }) as Promise<T>;
  }

  async seedWorkspace(sessionId: string, corpus: Corpus): Promise<void> {
    await this.asSession(sessionId, async (tx) => {
      const [bot] = await tx<{ id: string }[]>`
        insert into bots (session_id, name, accent_color, greeting, tone, corpus)
        values (${sessionId}, 'Northwind Support', '#2563eb',
                'Hi. Ask me anything about the docs I have been given.', 'friendly', ${corpus})
        returning id`;
      if (!bot) return;
      await tx`select seed_corpus(${bot.id}::uuid, ${corpus}::corpus)`;
      await this.seedHistory(tx, sessionId, bot.id, corpus);
    });
  }

  /**
   * Writes the set's past conversations, ratings and unanswered questions in
   * the seeding transaction, so a workspace never exists half seeded. The
   * policies still apply: every row carries the session the claim names.
   */
  private async seedHistory(tx: TransactionSql, sessionId: string, botId: string, corpus: Corpus): Promise<void> {
    const rows = await tx<{ document_id: string; title: string; chunk_id: string; section: string }[]>`
      select d.id as document_id, d.title, c.id as chunk_id, c.section
      from documents d join chunks c on c.document_id = d.id
      where d.seeded
      order by d.title, c.ordinal`;
    const sources = new Map<string, SeededSource>();
    for (const row of rows) {
      const source = sources.get(row.document_id) ?? { documentId: row.document_id, documentTitle: row.title, chunks: [] };
      source.chunks.push({ chunkId: row.chunk_id, section: row.section });
      sources.set(row.document_id, source);
    }
    const history = SEED_HISTORY[corpus];
    const now = Date.now();

    for (const conversation of history.conversations) {
      const startedAt = now - conversation.hoursAgo * HOUR_MS;
      const [created] = await tx<{ id: string }[]>`
        insert into conversations (session_id, bot_id, surface, started_at)
        values (${sessionId}, ${botId}, ${conversation.surface}::chat_surface, ${new Date(startedAt)})
        returning id`;
      if (!created) throw new Error('the seeded conversation was not recorded');
      for (const [turn, exchange] of conversation.exchanges.entries()) {
        const asked = startedAt + turn * 2 * MESSAGE_GAP_MS;
        const citations = resolveCitations(exchange.cites, [...sources.values()]);
        await tx`
          insert into messages (session_id, conversation_id, role, content, created_at)
          values (${sessionId}, ${created.id}, 'user', ${exchange.question}, ${new Date(asked)})`;
        const [answer] = await tx<{ id: string }[]>`
          insert into messages (session_id, conversation_id, role, content, citations, created_at)
          values (${sessionId}, ${created.id}, 'assistant', ${exchange.answer},
                  ${JSON.stringify(citations)}::jsonb, ${new Date(asked + MESSAGE_GAP_MS)})
          returning id`;
        if (answer && exchange.rating) {
          await tx`
            insert into ratings (session_id, message_id, value)
            values (${sessionId}, ${answer.id}, ${exchange.rating}::rating)`;
        }
      }
    }

    for (const gap of history.unanswered) {
      await tx`
        insert into unanswered_questions (session_id, bot_id, question, email, asked_at)
        values (${sessionId}, ${botId}, ${gap.question}, ${gap.email ?? null}, ${new Date(now - gap.hoursAgo * HOUR_MS)})`;
    }
  }

  async getBot(sessionId: string): Promise<BotRecord | null> {
    const rows = await this.asSession(
      sessionId,
      (tx) => tx<BotColumns[]>`select id, public_id, name, accent_color, greeting, tone, corpus from bots limit 1`,
    );
    return rows[0] ? toBot(rows[0]) : null;
  }

  /**
   * Resolved before any session is known, so it runs as the owner. The public
   * id grants asking a question and nothing else; every route that can read or
   * write a workspace goes through {@link asSession} instead.
   */
  async getBotByPublicId(publicId: string): Promise<{ bot: BotRecord; sessionId: string } | null> {
    const rows = await this.sql<(BotColumns & { session_id: string })[]>`
      select b.id, b.public_id, b.name, b.accent_color, b.greeting, b.tone, b.corpus, b.session_id
      from bots b
      join sessions s on s.id = b.session_id
      where b.public_id = ${publicId} and s.expires_at > now()
      limit 1`;
    const row = rows[0];
    return row ? { bot: toBot(row), sessionId: row.session_id } : null;
  }

  async updateBot(sessionId: string, settings: BotSettings): Promise<BotRecord> {
    const rows = await this.asSession(
      sessionId,
      (tx) => tx<BotColumns[]>`
        update bots set name = ${settings.name}, accent_color = ${settings.accentColor},
          greeting = ${settings.greeting}, tone = ${settings.tone}
        returning id, public_id, name, accent_color, greeting, tone, corpus`,
    );
    const row = rows[0];
    if (!row) throw new Error('no bot for this session');
    return toBot(row);
  }

  async setCorpus(sessionId: string, corpus: Corpus): Promise<void> {
    await this.asSession(sessionId, async (tx) => {
      const [bot] = await tx<{ id: string }[]>`select id from bots limit 1`;
      if (bot) await tx`select replace_seeded_corpus(${bot.id}::uuid, ${corpus}::corpus)`;
    });
  }

  async listDocuments(sessionId: string): Promise<Doc[]> {
    const rows = await this.asSession(
      sessionId,
      (tx) => tx<DocumentColumns[]>`
        select id, title, source, reference, state, chunk_count, failure, seeded, created_at
        from documents order by created_at`,
    );
    return rows.map(toDoc);
  }

  async getDocument(sessionId: string, documentId: string): Promise<Doc | null> {
    const rows = await this.asSession(
      sessionId,
      (tx) => tx<DocumentColumns[]>`
        select id, title, source, reference, state, chunk_count, failure, seeded, created_at
        from documents where id = ${documentId}`,
    );
    return rows[0] ? toDoc(rows[0]) : null;
  }

  async countDocuments(sessionId: string): Promise<number> {
    const rows = await this.asSession(sessionId, (tx) => tx<{ count: string }[]>`select count(*) from documents`);
    return Number(rows[0]?.count ?? 0);
  }

  async createDocument(sessionId: string, document: NewDocument): Promise<Doc> {
    const rows = await this.asSession(
      sessionId,
      (tx) => tx<DocumentColumns[]>`
        insert into documents (session_id, bot_id, title, source, reference)
        select ${sessionId}, b.id, ${document.title}, ${document.source}::document_source, ${document.reference}
        from bots b limit 1
        returning id, title, source, reference, state, chunk_count, failure, seeded, created_at`,
    );
    const row = rows[0];
    if (!row) throw new Error('no bot for this session');
    return toDoc(row);
  }

  async setDocumentState(sessionId: string, documentId: string, state: DocumentState, failure?: string): Promise<void> {
    await this.asSession(
      sessionId,
      (tx) => tx`
        update documents set state = ${state}::document_state, failure = ${failure ?? null}
        where id = ${documentId}`,
    );
  }

  async replaceChunks(sessionId: string, documentId: string, chunks: ChunkRow[]): Promise<void> {
    await this.asSession(sessionId, async (tx) => {
      await tx`delete from chunks where document_id = ${documentId}`;
      for (const chunk of chunks) {
        await tx`
          insert into chunks (session_id, document_id, ordinal, section, content, embedding)
          values (${sessionId}, ${documentId}, ${chunk.ordinal}, ${chunk.section}, ${chunk.content},
                  ${chunk.embedding ? toVector(chunk.embedding) : null})`;
      }
      await tx`update documents set chunk_count = ${chunks.length} where id = ${documentId}`;
    });
  }

  async clearChunks(sessionId: string, documentId: string): Promise<void> {
    await this.asSession(sessionId, async (tx) => {
      await tx`delete from chunks where document_id = ${documentId}`;
      await tx`update documents set chunk_count = 0 where id = ${documentId}`;
    });
  }

  async matchChunks(sessionId: string, embedding: number[], limit: number, maxDistance: number): Promise<RetrievedChunk[]> {
    const rows = await this.asSession(
      sessionId,
      (tx) => tx<
        { chunk_id: string; document_id: string; document_title: string; section: string; content: string; distance: number }[]
      >`
        select * from match_chunks(${toVector(embedding)}::extensions.vector, ${limit}, ${maxDistance})`,
    );
    return rows.map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentTitle: row.document_title,
      section: row.section,
      content: row.content,
      distance: Number(row.distance),
    }));
  }

  async recordExchange(sessionId: string, exchange: RecordedExchange): Promise<{ conversationId: string; messageId: string }> {
    return this.asSession(sessionId, async (tx) => {
      let conversationId = exchange.conversationId;
      if (conversationId) {
        const [found] = await tx<{ id: string }[]>`select id from conversations where id = ${conversationId}`;
        if (!found) conversationId = undefined;
      }
      if (!conversationId) {
        const [created] = await tx<{ id: string }[]>`
          insert into conversations (session_id, bot_id, surface)
          select ${sessionId}, b.id, ${exchange.surface}::chat_surface from bots b limit 1
          returning id`;
        if (!created) throw new Error('no bot for this session');
        conversationId = created.id;
      }
      await tx`
        insert into messages (session_id, conversation_id, role, content)
        values (${sessionId}, ${conversationId}, 'user', ${exchange.question})`;
      const [answer] = await tx<{ id: string }[]>`
        insert into messages (session_id, conversation_id, role, content, citations)
        values (${sessionId}, ${conversationId}, 'assistant', ${exchange.answer}, ${JSON.stringify(exchange.citations)}::jsonb)
        returning id`;
      if (!answer) throw new Error('the answer was not recorded');
      return { conversationId, messageId: answer.id };
    });
  }

  async rateMessage(sessionId: string, messageId: string, rating: Rating): Promise<boolean> {
    return this.asSession(sessionId, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        insert into ratings (session_id, message_id, value)
        select ${sessionId}, m.id, ${rating}::rating from messages m where m.id = ${messageId}
        on conflict (message_id) do update set value = excluded.value
        returning id`;
      return rows.length > 0;
    });
  }

  async listConversations(sessionId: string): Promise<Conversation[]> {
    return this.asSession(sessionId, async (tx) => {
      const conversations = await tx<{ id: string; surface: Conversation['surface']; started_at: Date }[]>`
        select id, surface, started_at from conversations order by started_at`;
      const messages = await tx<
        {
          id: string;
          conversation_id: string;
          role: Message['role'];
          content: string;
          citations: Citation[];
          created_at: Date;
          rating: Rating | null;
        }[]
      >`
        select m.id, m.conversation_id, m.role, m.content, m.citations, m.created_at, r.value as rating
        from messages m
        left join ratings r on r.message_id = m.id
        order by m.created_at`;
      return conversations.map((conversation) => ({
        id: conversation.id,
        surface: conversation.surface,
        startedAt: conversation.started_at.toISOString(),
        messages: messages
          .filter((message) => message.conversation_id === conversation.id)
          .map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            citations: message.citations,
            createdAt: message.created_at.toISOString(),
            ...(message.rating ? { rating: message.rating } : {}),
          })),
      }));
    });
  }

  async ratingSummary(sessionId: string): Promise<RatingSummary> {
    const rows = await this.asSession(
      sessionId,
      (tx) => tx<{ up: string; down: string }[]>`
        select count(*) filter (where value = 'up') as up, count(*) filter (where value = 'down') as down
        from ratings`,
    );
    return { up: Number(rows[0]?.up ?? 0), down: Number(rows[0]?.down ?? 0) };
  }

  async recordUnanswered(sessionId: string, question: string): Promise<{ id: string }> {
    const rows = await this.asSession(
      sessionId,
      (tx) => tx<{ id: string }[]>`
        insert into unanswered_questions (session_id, bot_id, question)
        select ${sessionId}, b.id, ${question} from bots b limit 1
        returning id`,
    );
    const row = rows[0];
    if (!row) throw new Error('no bot for this session');
    return { id: row.id };
  }

  async attachHandoffEmail(sessionId: string, questionId: string, email: string): Promise<boolean> {
    const rows = await this.asSession(
      sessionId,
      (tx) => tx<{ id: string }[]>`update unanswered_questions set email = ${email} where id = ${questionId} returning id`,
    );
    return rows.length > 0;
  }

  async listUnanswered(sessionId: string): Promise<UnansweredQuestion[]> {
    const rows = await this.asSession(
      sessionId,
      (tx) => tx<{ id: string; question: string; email: string | null; asked_at: Date }[]>`
        select id, question, email, asked_at from unanswered_questions order by asked_at desc`,
    );
    return rows.map((row) => ({
      id: row.id,
      question: row.question,
      askedAt: row.asked_at.toISOString(),
      ...(row.email ? { email: row.email } : {}),
    }));
  }

  async countQuestionsSince(sessionId: string, since: Date): Promise<number> {
    const rows = await this.asSession(
      sessionId,
      (tx) => tx<{ count: string }[]>`select count(*) from messages where role = 'user' and created_at >= ${since}`,
    );
    return Number(rows[0]?.count ?? 0);
  }

  async templateIsCurrent(corpus: Corpus, slug: string, contentHash: string): Promise<boolean> {
    const rows = await this.sql<{ id: string }[]>`
      select id from template_documents
      where corpus = ${corpus}::corpus and slug = ${slug} and content_hash = ${contentHash}`;
    return rows.length > 0;
  }

  /** Runs as the owner: no session may write a template, which is what keeps the demo intact. */
  async writeTemplateDocument(document: TemplateDocument): Promise<void> {
    await this.sql.begin(async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        insert into template_documents (corpus, slug, title, reference, content_hash, chunk_count)
        values (${document.corpus}::corpus, ${document.slug}, ${document.title}, ${document.reference},
                ${document.contentHash}, ${document.chunks.length})
        on conflict (corpus, slug) do update set
          title = excluded.title, reference = excluded.reference,
          content_hash = excluded.content_hash, chunk_count = excluded.chunk_count
        returning id`;
      if (!row) throw new Error('the template document was not written');
      await tx`delete from template_chunks where template_document_id = ${row.id}`;
      for (const chunk of document.chunks) {
        await tx`
          insert into template_chunks (template_document_id, ordinal, section, content, embedding)
          values (${row.id}, ${chunk.ordinal}, ${chunk.section}, ${chunk.content},
                  ${chunk.embedding ? toVector(chunk.embedding) : null})`;
      }
    });
  }

  async countTemplateDocuments(corpus: Corpus): Promise<number> {
    const rows = await this.sql<{ count: string }[]>`
      select count(*) from template_documents where corpus = ${corpus}::corpus`;
    return Number(rows[0]?.count ?? 0);
  }
}
