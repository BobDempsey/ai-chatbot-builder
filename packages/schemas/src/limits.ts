/**
 * What one request may carry, and what a session may accumulate. Every limit
 * here is applied on the server: the client is a suggestion.
 *
 * The numbers live beside the schemas because both the API and the front ends
 * need them, the API to refuse and the front ends to say what the limit was
 * before a request is even sent.
 */

/** The longest question a visitor can send in one turn. */
export const MAX_MESSAGE_CHARS = 1000;

/** An earlier answer replayed as history. Answers run longer than questions. */
export const MAX_HISTORY_ANSWER_CHARS = 4000;

/** How many earlier messages go back to the model, counting each side as one. */
export const MAX_HISTORY_TURNS = 10;

/** A request body larger than this is refused before it is parsed. */
export const MAX_BODY_BYTES = 32_000;

/** The largest single upload, in bytes. */
export const MAX_UPLOAD_BYTES = 5_000_000;

/** How many documents one session may hold, seeded ones included. */
export const MAX_DOCUMENTS_PER_SESSION = 10;

/** Questions one session may ask inside {@link RATE_WINDOW_MS}. */
export const MAX_QUESTIONS_PER_WINDOW = 20;

/** The rate-limit window, matched to the Vercel Firewall rule. */
export const RATE_WINDOW_MS = 10 * 60_000;

/** Show the remaining count once this many questions are used. */
export const WARN_AFTER_QUESTIONS = 5;

/** How long a session and its workspace live. */
export const SESSION_TTL_MS = 24 * 60 * 60_000;

/** The cookie the session id rides in. */
export const SESSION_COOKIE = 'acb_session';
