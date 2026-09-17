/**
 * What the model is told, and what it is allowed to see.
 *
 * The retrieved chunks are numbered here, and those numbers are the only
 * citation vocabulary the model has. Anything it writes outside that range is
 * dropped by `citations.ts`, so the prompt and the resolver agree on one set.
 *
 * History is bounded here rather than trusted from the client: the most recent
 * turns only, each truncated, and never a failure sentence.
 *
 * The prompt also carries the one word that turns an answer into a decline.
 * Retrieval alone cannot decide this: "what wine goes with fish pie" pulls the
 * fish pie chunk at a close distance, because it is about fish pie, and no
 * distance floor separates a relevant source from one that happens not to hold
 * the answer. The model is the only thing that can see that difference, so it
 * says so in a form the route can act on.
 */
import { MAX_HISTORY_ANSWER_CHARS, MAX_HISTORY_TURNS, type Turn } from '@acb/schemas';
import { isFailureSentence } from '../models/failures';
import type { BotRecord } from '../store/store';
import type { RetrievedChunk } from '../store/store';

const TONE_LINES: Record<BotRecord['tone'], string> = {
  friendly: 'Write warmly and plainly, as a helpful colleague would.',
  neutral: 'Write plainly and directly, with no small talk.',
  formal: 'Write formally and precisely, in complete sentences.',
};

/**
 * Trims replayed history to what the server is willing to pay for, and drops
 * any failure sentence so the model never learns to imitate one.
 */
export function boundHistory(history: Turn[]): Turn[] {
  return history
    .filter((turn) => !(turn.role === 'assistant' && isFailureSentence(turn.content)))
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, MAX_HISTORY_ANSWER_CHARS) }));
}

/**
 * The model's way of saying the sources do not answer the question. The route
 * turns it into the decline event and the offer of a human, so a reader never
 * sees the token itself.
 */
export const NO_ANSWER = 'NO_ANSWER';

export function buildSystemPrompt(bot: BotRecord, chunks: RetrievedChunk[]): string {
  const sources = chunks
    .map((chunk, index) => `[${index + 1}] ${chunk.documentTitle} — ${chunk.section || 'Introduction'}\n${chunk.content}`)
    .join('\n\n');

  return [
    `You are ${bot.name}, a support assistant answering only from the sources below.`,
    TONE_LINES[bot.tone],
    '',
    'Rules:',
    `- Use only the sources. Never answer from your own knowledge, even when you are confident.`,
    `- If the sources do not contain the answer, reply with exactly ${NO_ANSWER} and nothing else.`,
    `- A source about the same subject is not enough. It has to state the answer.`,
    `- Cite every claim with the bracketed number of the source it came from, such as [1].`,
    `- Never cite a number that is not listed below, and never invent a figure, date or policy.`,
    `- Keep the answer short. Two or three sentences is usually enough.`,
    '',
    'Sources:',
    sources,
  ].join('\n');
}
