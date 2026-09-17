/**
 * What the dashboard reads back: conversations, the ratings left on answers,
 * and the questions the bot could not answer. The last of those is the list
 * that tells an owner which document to write next.
 */
import { z } from 'zod';
import { citationSchema } from './chat';

export const ratingSchema = z.enum(['up', 'down']);
export type Rating = z.infer<typeof ratingSchema>;

export const messageSchema = z.object({
  id: z.uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  citations: z.array(citationSchema).default([]),
  rating: ratingSchema.optional(),
  createdAt: z.iso.datetime(),
});
export type Message = z.infer<typeof messageSchema>;

export const conversationSchema = z.object({
  id: z.uuid(),
  /** Where it happened, so the log can tell the preview from the embed. */
  surface: z.enum(['preview', 'widget']),
  messages: z.array(messageSchema),
  startedAt: z.iso.datetime(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const rateRequestSchema = z.object({
  messageId: z.uuid(),
  rating: ratingSchema,
});
export type RateRequest = z.infer<typeof rateRequestSchema>;

export const unansweredQuestionSchema = z.object({
  id: z.uuid(),
  question: z.string(),
  /** Present when the visitor left an address for a human to follow up. */
  email: z.email().optional(),
  askedAt: z.iso.datetime(),
});
export type UnansweredQuestion = z.infer<typeof unansweredQuestionSchema>;

export const ratingSummarySchema = z.object({
  up: z.number().int().nonnegative(),
  down: z.number().int().nonnegative(),
});
export type RatingSummary = z.infer<typeof ratingSummarySchema>;
