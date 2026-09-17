/**
 * The answer path, as a function of its dependencies.
 *
 * Retrieval, prompt building and the answering model all arrive as arguments,
 * which is the one decision that makes this testable: the tests drive the whole
 * request path with a fake model and no API key. ai-frontend-advisor's
 * `api/_lib/handler.ts` is the same shape and the same reason.
 *
 * The order below is deliberate. Everything free happens before anything paid:
 * the body size check runs before parsing, the per-session cap before the
 * embedding call, and the relevance floor before the answering model. A request
 * that is going to be refused costs nothing at the provider.
 */
import {
  chatRequestSchema,
  MAX_BODY_BYTES,
  MAX_MESSAGE_CHARS,
  MAX_QUESTIONS_PER_WINDOW,
  RATE_WINDOW_MS,
  type ChatEvent,
  type Citation,
} from '@acb/schemas';
import type { AnswerModel } from '../models/answer';
import type { EmbeddingClient } from '../models/embedding';
import { failureSentence } from '../models/failures';
import { CitationFilter } from '../retrieval/citations';
import { boundHistory, buildSystemPrompt, NO_ANSWER } from '../retrieval/prompt';
import { retrieveChunks, type RetrievalOptions } from '../retrieval/retrieve';
import type { BotRecord, WorkspaceStore } from '../store/store';

export interface ChatDeps {
  store: WorkspaceStore;
  embeddings: EmbeddingClient;
  model: AnswerModel;
  retrieval?: RetrievalOptions;
  now?: () => number;
}

export interface ChatContext {
  sessionId: string;
  bot: BotRecord;
  surface: 'preview' | 'widget';
  /** The raw body, unparsed, so its size is checked first. */
  rawBody: string;
}

/** What a refusal looks like: a status and one plain sentence. */
export interface ChatRefusal {
  status: 413 | 400 | 429;
  error: string;
}

export const DECLINE_SENTENCE =
  'The documents I have do not cover that. I can pass the question to a person if you leave an email address.';

const encoder = new TextEncoder();
const line = (event: ChatEvent) => encoder.encode(`${JSON.stringify(event)}\n`);

/** Header the widget reads to show how many questions are left before the cap. */
export const REMAINING_HEADER = 'x-acb-questions-remaining';

export async function handleChat(deps: ChatDeps, context: ChatContext): Promise<Response> {
  const now = deps.now ?? Date.now;

  if (context.rawBody.length > MAX_BODY_BYTES) {
    return refuse({ status: 413, error: 'That conversation is too long to send. Start a new one and ask again.' });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(context.rawBody);
  } catch {
    return refuse({ status: 400, error: 'The question could not be read. Try sending it again.' });
  }

  const request = chatRequestSchema.safeParse(parsedBody);
  if (!request.success) {
    return refuse({ status: 400, error: `Type a question first, up to ${MAX_MESSAGE_CHARS} characters.` });
  }

  const asked = await deps.store.countQuestionsSince(context.sessionId, new Date(now() - RATE_WINDOW_MS));
  if (asked >= MAX_QUESTIONS_PER_WINDOW) {
    return refuse({
      status: 429,
      error: `This demo allows ${MAX_QUESTIONS_PER_WINDOW} questions every ${RATE_WINDOW_MS / 60_000} minutes. Try again in a few minutes.`,
    });
  }
  const remaining = String(MAX_QUESTIONS_PER_WINDOW - asked - 1);

  const { message, history } = request.data;

  let chunks: Awaited<ReturnType<typeof retrieveChunks>>;
  try {
    chunks = await retrieveChunks(deps.store, deps.embeddings, context.sessionId, message, deps.retrieval);
  } catch (error) {
    return streamOnce({ type: 'failure', message: failureSentence(error) }, remaining);
  }

  if (chunks.length === 0) {
    const { id } = await deps.store.recordUnanswered(context.sessionId, message);
    return streamOnce({ type: 'declined', message: DECLINE_SENTENCE, questionId: id }, remaining);
  }

  const prompt = {
    system: buildSystemPrompt(context.bot, chunks),
    history: boundHistory(history),
    question: message,
  };

  const filter = new CitationFilter(chunks);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = '';
      // Nothing is sent until the reply has ruled out the decline token. The
      // model only knows the sources do not answer the question once it has
      // read them, and a reader must never see half an answer that turns into
      // "I cannot answer that".
      let held = '';
      let releasing = false;
      const release = (text: string) => {
        if (!text) return;
        answer += text;
        controller.enqueue(line({ type: 'delta', text }));
      };
      const consider = (text: string): 'declined' | 'answering' | 'undecided' => {
        held += text;
        const trimmed = held.trimStart();
        if (NO_ANSWER.startsWith(trimmed.slice(0, NO_ANSWER.length))) {
          return trimmed.length >= NO_ANSWER.length ? 'declined' : 'undecided';
        }
        return 'answering';
      };

      try {
        for await (const delta of deps.model.stream(prompt)) {
          const text = filter.push(delta);
          if (!text) continue;
          if (releasing) {
            release(text);
            continue;
          }
          const verdict = consider(text);
          if (verdict === 'declined') {
            const { id } = await deps.store.recordUnanswered(context.sessionId, message);
            controller.enqueue(line({ type: 'declined', message: DECLINE_SENTENCE, questionId: id }));
            controller.close();
            return;
          }
          if (verdict === 'answering') {
            releasing = true;
            release(held);
            held = '';
          }
        }
        const tail = filter.flush();
        if (!releasing) {
          // The whole reply fitted inside the held buffer, which is what a bare
          // decline token looks like.
          if (`${held}${tail}`.trim() === NO_ANSWER) {
            const { id } = await deps.store.recordUnanswered(context.sessionId, message);
            controller.enqueue(line({ type: 'declined', message: DECLINE_SENTENCE, questionId: id }));
            controller.close();
            return;
          }
          release(held);
        }
        release(tail);
      } catch (error) {
        // The failure sentence is sent but never recorded, so it can never be
        // replayed to the model as history.
        controller.enqueue(line({ type: 'failure', message: failureSentence(error) }));
        controller.close();
        return;
      }

      const citations: Citation[] = filter.citations();
      controller.enqueue(line({ type: 'citations', citations }));
      const { messageId } = await deps.store.recordExchange(context.sessionId, {
        question: message,
        answer,
        citations,
        surface: context.surface,
      });
      controller.enqueue(line({ type: 'done', messageId }));
      controller.close();
    },
  });

  return new Response(stream, { headers: streamHeaders(remaining) });
}

function streamHeaders(remaining: string): Record<string, string> {
  return {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-store',
    [REMAINING_HEADER]: remaining,
  };
}

function streamOnce(event: ChatEvent, remaining: string): Response {
  return new Response(line(event), { headers: streamHeaders(remaining) });
}

function refuse(refusal: ChatRefusal): Response {
  return new Response(JSON.stringify({ error: refusal.error }), {
    status: refusal.status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
