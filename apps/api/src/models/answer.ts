/**
 * The answering model, behind one streaming method.
 *
 * The handler takes an {@link AnswerModel} as an argument, so the request path
 * runs in tests against a fake that yields fixed text. That is the single
 * decision that lets this route be tested without spending tokens, and it is
 * copied from ai-frontend-advisor's `api/_lib/handler.ts`.
 *
 * The OpenAI implementation reads the streaming chat-completions response and
 * yields text as it arrives, so the client sees words before the answer ends.
 */
import type { Turn } from '@acb/schemas';
import { ProviderError } from './failures';

export const ANSWER_MODEL = 'gpt-5.6-luna';

export interface AnswerPrompt {
  system: string;
  /** Earlier turns, already bounded and stripped of failure sentences. */
  history: Turn[];
  question: string;
}

export interface AnswerModel {
  stream(prompt: AnswerPrompt): AsyncIterable<string>;
}

export interface OpenAiAnswerOptions {
  apiKey: string | undefined;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Reads `data:` lines out of a server-sent-events body. */
async function* sseLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
      newline = buffer.indexOf('\n');
    }
  }
}

interface StreamChunk {
  choices?: { delta?: { content?: string } }[];
}

export function createOpenAiAnswerModel(options: OpenAiAnswerOptions): AnswerModel {
  const { apiKey, model = ANSWER_MODEL, baseUrl = 'https://api.openai.com/v1', timeoutMs = 45_000, fetchImpl = fetch } = options;

  return {
    async *stream(prompt) {
      if (!apiKey) throw new ProviderError('not-configured');
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: true,
            messages: [
              { role: 'system', content: prompt.system },
              ...prompt.history.map((turn) => ({ role: turn.role, content: turn.content })),
              { role: 'user', content: prompt.question },
            ],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new ProviderError(error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unreachable');
      }
      if (response.status === 429) throw new ProviderError('rate-limit');
      if (!response.ok || !response.body) throw new ProviderError('unreachable');

      let produced = false;
      for await (const data of sseLines(response.body)) {
        if (data === '[DONE]') break;
        let parsed: StreamChunk;
        try {
          parsed = JSON.parse(data) as StreamChunk;
        } catch {
          continue;
        }
        const text = parsed.choices?.[0]?.delta?.content;
        if (text) {
          produced = true;
          yield text;
        }
      }
      if (!produced) throw new ProviderError('empty');
    },
  };
}
