/**
 * The chat exchange: what a visitor sends, and what streams back.
 *
 * The answer is streamed as newline-delimited JSON events rather than one body,
 * so the client can show text as it arrives. `citations` and `done` close the
 * stream; a `failure` event replaces them when something went wrong, carrying
 * one plain sentence the UI shows as is.
 */
import { z } from 'zod';
import { MAX_HISTORY_ANSWER_CHARS, MAX_HISTORY_TURNS, MAX_MESSAGE_CHARS } from './limits';

export const turnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(MAX_HISTORY_ANSWER_CHARS),
});
export type Turn = z.infer<typeof turnSchema>;

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  history: z.array(turnSchema).max(MAX_HISTORY_TURNS).default([]),
  /**
   * The bot a widget on someone else's page is asking. Omitted by the
   * dashboard, whose session cookie names the bot instead.
   */
  botId: z.uuid().optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** A source the answer drew on, numbered as the answer text cites it. */
export const citationSchema = z.object({
  index: z.number().int().positive(),
  documentId: z.uuid(),
  documentTitle: z.string(),
  /** The chunk's nearest heading, which is what the citation link opens. */
  section: z.string(),
  chunkId: z.uuid(),
});
export type Citation = z.infer<typeof citationSchema>;

export const chatEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('citations'), citations: z.array(citationSchema) }),
  /** Retrieval found nothing above the floor. No model was called. */
  z.object({ type: z.literal('declined'), message: z.string(), questionId: z.uuid() }),
  z.object({ type: z.literal('done'), messageId: z.uuid() }),
  /** One plain sentence for the reader. Never a status code or a stack. */
  z.object({ type: z.literal('failure'), message: z.string() }),
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;

/** The email capture offered when the bot declines. */
export const handoffRequestSchema = z.object({
  questionId: z.uuid(),
  email: z.email(),
  /** Sent by the widget, which has no cookie to say which bot it belongs to. */
  botId: z.uuid().optional(),
});
export type HandoffRequest = z.infer<typeof handoffRequestSchema>;

/** Every refusal the API sends, as one plain sentence. */
export const errorResponseSchema = z.object({ error: z.string() });
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
