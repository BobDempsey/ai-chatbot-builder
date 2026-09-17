/**
 * Every call the dashboard makes, collected here so a route change is one edit
 * and so no screen invents its own idea of a response.
 *
 * Two rules hold throughout. Shapes come from `@acb/schemas` and nothing is
 * redeclared locally, because the API validates against those same schemas. And
 * every response is parsed rather than cast: a field the server stopped sending
 * should fail loudly at the boundary instead of rendering as `undefined` three
 * components deep.
 *
 * Dashboard routes are same-origin and ride the session cookie, so every
 * request sends credentials and none carries a bot id. Only the widget names a
 * bot, and the widget is another slice.
 */
import {
  type Bot,
  botSchema,
  type BotSettings,
  type ChatEvent,
  chatEventSchema,
  type ChatRequest,
  type Conversation,
  conversationSchema,
  type Corpus,
  type Doc,
  documentSchema,
  errorResponseSchema,
  type MarkdownUpload,
  type RateRequest,
  type RatingSummary,
  ratingSummarySchema,
  type UnansweredQuestion,
  unansweredQuestionSchema,
  type UrlUpload,
} from '@acb/schemas';
import { z } from 'zod';

/**
 * A refusal the server explained. The message is already one plain sentence
 * written for a reader, so screens show it as it arrived rather than rewording
 * it or appending a status code.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const GENERIC_FAILURE = 'Something went wrong. Try that again in a moment.';

const documentListSchema = z.object({ documents: z.array(documentSchema) });
const conversationListSchema = z.object({ conversations: z.array(conversationSchema) });
const unansweredListSchema = z.object({ questions: z.array(unansweredQuestionSchema) });

async function failureOf(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const parsed = errorResponseSchema.safeParse(body);
  return new ApiError(parsed.success ? parsed.data.error : GENERIC_FAILURE, response.status);
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin', ...init });
  } catch {
    // A dropped connection reads the same to a person as a server that refused.
    throw new ApiError('The dashboard could not reach the server. Check your connection and try again.', 0);
  }
  if (!response.ok) throw await failureOf(response);
  return response;
}

async function json<T>(schema: z.ZodType<T>, path: string, init?: RequestInit): Promise<T> {
  const response = await send(path, init);
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new ApiError(GENERIC_FAILURE, response.status);
  return parsed.data;
}

function asJson(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

export function getBot(): Promise<Bot> {
  return json(botSchema, '/api/bot');
}

export function saveBot(settings: BotSettings): Promise<Bot> {
  return json(botSchema, '/api/bot', { ...asJson(settings), method: 'PUT' });
}

export function getDocuments(): Promise<Doc[]> {
  return json(documentListSchema, '/api/documents').then((body) => body.documents);
}

export function uploadMarkdown(upload: MarkdownUpload): Promise<Doc> {
  return json(documentSchema, '/api/documents/markdown', asJson(upload));
}

export function uploadUrl(upload: UrlUpload): Promise<Doc> {
  return json(documentSchema, '/api/documents/url', asJson(upload));
}

/** A PDF goes as multipart, so the browser sets the boundary and no base64 doubles the body. */
export function uploadFile(file: File): Promise<Doc> {
  const form = new FormData();
  form.append('file', file);
  return json(documentSchema, '/api/documents/pdf', { method: 'POST', body: form });
}

/** Swapping corpora replaces the workspace's seeded documents, so the list comes back whole. */
export function chooseCorpus(corpus: Corpus): Promise<Doc[]> {
  return json(documentListSchema, '/api/corpus', asJson({ corpus })).then((body) => body.documents);
}

export function getConversations(): Promise<Conversation[]> {
  return json(conversationListSchema, '/api/conversations').then((body) => body.conversations);
}

export function getUnanswered(): Promise<UnansweredQuestion[]> {
  return json(unansweredListSchema, '/api/unanswered').then((body) => body.questions);
}

export function getRatings(): Promise<RatingSummary> {
  return json(ratingSummarySchema, '/api/ratings');
}

export async function rate(request: RateRequest): Promise<void> {
  await send('/api/rate', asJson(request));
}

export async function requestHandoff(questionId: string, email: string): Promise<void> {
  await send('/api/handoff', asJson({ questionId, email }));
}

/**
 * The answer stream, newline-delimited JSON, handed to the caller one event at
 * a time. A line that does not parse is dropped rather than thrown: half an
 * answer on screen beats an exception over the top of it, and the stream still
 * ends with `done` or `failure`.
 */
export async function streamChat(request: ChatRequest, onEvent: (event: ChatEvent) => void, signal?: AbortSignal): Promise<void> {
  const response = await send('/api/chat', { ...asJson(request), signal });
  const body = response.body;
  if (!body) throw new ApiError(GENERIC_FAILURE, response.status);

  // Decoded by hand rather than through `TextDecoderStream`, which jsdom does
  // not provide, so the same code path runs in the browser and in the tests.
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      emit(buffer.slice(0, newline), onEvent);
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  emit(buffer, onEvent);
}

function emit(line: string, onEvent: (event: ChatEvent) => void): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const parsed = chatEventSchema.safeParse(JSON.parse(trimmed));
    if (parsed.success) onEvent(parsed.data);
  } catch {
    // Not JSON. Nothing to show, and the stream carries on.
  }
}
