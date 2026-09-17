/**
 * Everything the widget sends over the wire: the streamed question, the bot's
 * appearance, and the handoff email.
 *
 * The answer arrives as newline-delimited JSON, one `ChatEvent` per line, so
 * text is handed to the caller as it lands rather than after the answer is
 * finished. Every line is parsed against the shared schema and an unrecognised
 * one is dropped, because a stream is not a place to throw.
 *
 * Every failure, whatever its cause, comes back as one plain sentence. The
 * reader never sees a status code, and the sentence is marked failed so it is
 * not replayed as history.
 */
import {
  type Bot,
  botSchema,
  type ChatEvent,
  chatEventSchema,
  type Citation,
  errorResponseSchema,
  handoffRequestSchema,
  type Turn,
} from '@acb/schemas';
import { markSpent } from './quota';

const UNREACHABLE = 'The assistant could not be reached. Check your connection and try again.';
const UNAVAILABLE = 'The assistant could not answer just now. Try again in a moment.';
const SPENT = 'You have reached the demo limit for now. Try again in a few minutes.';
const EMPTY = 'The assistant did not send an answer. Try asking again.';

export interface AskHandlers {
  onDelta: (text: string) => void;
  onCitations: (citations: Citation[]) => void;
  onDeclined: (message: string, questionId: string) => void;
  onDone: (messageId: string) => void;
  /** One sentence for the reader, from any cause. */
  onFailure: (message: string) => void;
}

export interface AskRequest {
  apiBase: string;
  botId: string;
  message: string;
  history: Turn[];
  signal?: AbortSignal;
}

const endpoint = (apiBase: string, path: string) => `${apiBase.replace(/\/$/, '')}${path}`;

/** The refusal sentence a non-streaming response carries, or a stand-in. */
async function refusalOf(response: Response): Promise<string> {
  if (response.status === 429) {
    markSpent();
    return SPENT;
  }
  const parsed = errorResponseSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data.error : UNAVAILABLE;
}

export async function askBot(request: AskRequest, handlers: AskHandlers): Promise<void> {
  const { apiBase, botId, message, history, signal } = request;
  let response: Response;
  try {
    response = await fetch(endpoint(apiBase, '/api/chat'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, history, botId }),
      signal,
    });
  } catch {
    handlers.onFailure(UNREACHABLE);
    return;
  }

  if (!response.ok || !response.body) {
    handlers.onFailure(await refusalOf(response));
    return;
  }

  let closed = false;
  const apply = (event: ChatEvent) => {
    switch (event.type) {
      case 'delta':
        handlers.onDelta(event.text);
        break;
      case 'citations':
        handlers.onCitations(event.citations);
        break;
      case 'declined':
        closed = true;
        handlers.onDeclined(event.message, event.questionId);
        break;
      case 'done':
        closed = true;
        handlers.onDone(event.messageId);
        break;
      case 'failure':
        closed = true;
        handlers.onFailure(event.message);
        break;
    }
  };

  const take = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed = chatEventSchema.safeParse(JSON.parse(trimmed));
      if (parsed.success) apply(parsed.data);
    } catch {
      // A half-written or unknown line is skipped rather than ending the stream.
    }
  };

  try {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        take(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    }
    take(buffer);
  } catch {
    if (!closed) handlers.onFailure(UNREACHABLE);
    return;
  }

  // The connection ended without the server saying it was finished.
  if (!closed) handlers.onFailure(EMPTY);
}

/** The bot's name, colors and greeting. Null means the caller keeps its defaults. */
export async function fetchBot(apiBase: string, botId: string): Promise<Bot | null> {
  try {
    const response = await fetch(`${endpoint(apiBase, '/api/bot')}?botId=${encodeURIComponent(botId)}`);
    if (!response.ok) return null;
    const parsed = botSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Null when the address was recorded, otherwise the sentence to show. */
export async function sendHandoff(apiBase: string, questionId: string, email: string): Promise<string | null> {
  const body = handoffRequestSchema.safeParse({ questionId, email });
  if (!body.success) return 'That email address does not look right.';
  try {
    const response = await fetch(endpoint(apiBase, '/api/handoff'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body.data),
    });
    if (response.ok) return null;
    return await refusalOf(response);
  } catch {
    return UNREACHABLE;
  }
}
