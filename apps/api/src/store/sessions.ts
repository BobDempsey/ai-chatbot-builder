/**
 * The session store the phase 0 middleware asks for, backed by a workspace.
 *
 * Minting a session and seeding its workspace are one act: a visitor never sees
 * an empty dashboard, so the seed happens here rather than on the first read of
 * each screen.
 *
 * Sessions live in memory in this implementation, which is enough for tests and
 * for `pnpm dev:api:real`. A deployment pairs the Postgres workspace store with
 * a session row instead.
 */
import { DEFAULT_CORPUS, SESSION_TTL_MS, type Corpus } from '@acb/schemas';
import type { SessionRecord, SessionStore } from '../session';
import type { WorkspaceStore } from './store';

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
