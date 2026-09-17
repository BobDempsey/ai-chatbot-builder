/**
 * The session store the phase 0 middleware asks for, backed by a workspace.
 *
 * Minting a session and seeding its workspace are one act: a visitor never sees
 * an empty dashboard, so the seed happens here rather than on the first read of
 * each screen.
 *
 * Two implementations live here. `MemorySessionStore` is what the tests and a
 * keyless dev server use. `PostgresSessionStore` is what a deployment uses, and
 * the difference matters more than it looks: the policies read the `sessions`
 * table, so the row has to exist before a workspace can be seeded.
 */
import { DEFAULT_CORPUS, SESSION_TTL_MS, type Corpus } from '@acb/schemas';
import type { Sql } from 'postgres';
import type { SessionRecord, SessionStore } from '../session';
import type { WorkspaceStore } from './store';

/** A malformed id would otherwise reach Postgres and raise instead of missing. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(
    private readonly workspace: WorkspaceStore,
    private readonly corpus: Corpus = DEFAULT_CORPUS,
    private readonly now: () => number = Date.now,
  ) {}

  async find(id: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(id);
    if (!session) return null;
    return session.expiresAt.getTime() > this.now() ? session : null;
  }

  async create(): Promise<SessionRecord> {
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      expiresAt: new Date(this.now() + SESSION_TTL_MS),
    };
    this.sessions.set(session.id, session);
    await this.workspace.seedWorkspace(session.id, this.corpus);
    return session;
  }

  /** No claim to set without a database, so the work simply runs. */
  async withSession<T>(_id: string, work: () => Promise<T>): Promise<T> {
    return work();
  }

  /** Used by the expiry tests to age a session out without waiting a day. */
  expire(id: string): void {
    const session = this.sessions.get(id);
    if (session) this.sessions.set(id, { ...session, expiresAt: new Date(this.now() - 1) });
  }
}

/**
 * Sessions as rows, which is what a deployment needs and what the in-memory
 * store above cannot be.
 *
 * The row has to exist before anything else in the workspace does. Every policy
 * checks `session_is_live(session_id)`, and that reads the `sessions` table, so
 * seeding a workspace whose session was only ever a string in a process refuses
 * its own first insert. That is exactly how it failed the first time this ran
 * against Postgres.
 *
 * The insert itself runs as the connection's own role rather than under a
 * claim, because there is no session to claim yet. Everything after it goes
 * through the workspace store's transaction, where the claim is set and the
 * policies are in force.
 */
export class PostgresSessionStore implements SessionStore {
  constructor(
    private readonly sql: Sql,
    private readonly workspace: WorkspaceStore,
    private readonly corpus: Corpus = DEFAULT_CORPUS,
  ) {}

  async find(id: string): Promise<SessionRecord | null> {
    if (!UUID.test(id)) return null;
    const rows = await this.sql<{ id: string; expires_at: Date }[]>`
      select id, expires_at from sessions where id = ${id} and expires_at > now() limit 1`;
    const row = rows[0];
    return row ? { id: row.id, expiresAt: row.expires_at } : null;
  }

  async create(): Promise<SessionRecord> {
    const rows = await this.sql<{ id: string; expires_at: Date }[]>`
      insert into sessions (expires_at) values (now() + ${`${SESSION_TTL_MS} milliseconds`}::interval)
      returning id, expires_at`;
    const row = rows[0];
    if (!row) throw new Error('The session could not be created.');
    await this.workspace.seedWorkspace(row.id, this.corpus);
    return { id: row.id, expiresAt: row.expires_at };
  }

  /**
   * The claim is set per statement by the workspace store, inside its own
   * transaction, because a pooled connection is not held between them.
   */
  async withSession<T>(_id: string, work: () => Promise<T>): Promise<T> {
    return work();
  }
}
