/**
 * An in-memory stand-in for the Supabase-backed session store, enforcing the
 * same two rules the row-level policies do: a row belongs to one session, and
 * an expired session reaches nothing.
 *
 * It exists so the session rules can be tested without a database. Slice A
 * replaces the resource methods with real queries; the interface is what both
 * sides agree on.
 */
import { SESSION_TTL_MS } from '@acb/schemas';
import type { SessionRecord, SessionStore } from './session';

interface Row {
  id: string;
  sessionId: string;
  kind: 'document' | 'bot' | 'conversation' | 'rating';
}

export class MemoryStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly rows: Row[] = [];
  /** Whose claim is in force. Null means a query that set none. */
  private claim: string | null = null;

  constructor(private readonly now: () => number = Date.now) {}

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
    // Seeding in miniature: a new workspace is never empty.
    this.rows.push({ id: crypto.randomUUID(), sessionId: session.id, kind: 'bot' });
    this.rows.push({ id: crypto.randomUUID(), sessionId: session.id, kind: 'document' });
    return session;
  }

  async withSession<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = this.claim;
    this.claim = id;
    try {
      return await work();
    } finally {
      this.claim = previous;
    }
  }

  /** What the current claim can see. No claim, or an expired one, sees nothing. */
  visible(kind?: Row['kind']): Row[] {
    if (!this.claim) return [];
    const session = this.sessions.get(this.claim);
    if (!session || session.expiresAt.getTime() <= this.now()) return [];
    return this.rows.filter((row) => row.sessionId === this.claim && (!kind || row.kind === kind));
  }

  /** A row id belonging to another session, for the cross-session tests. */
  rowOf(sessionId: string, kind: Row['kind']): string | undefined {
    return this.rows.find((row) => row.sessionId === sessionId && row.kind === kind)?.id;
  }

  expire(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) this.sessions.set(sessionId, { ...session, expiresAt: new Date(this.now() - 1) });
  }
}
