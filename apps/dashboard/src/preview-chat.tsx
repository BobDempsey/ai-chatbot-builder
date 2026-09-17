/**
 * The chat that sits beside the settings, so a question can be asked without
 * embedding anything.
 *
 * It renders answers through the shared `Answer` component and themes itself
 * from the saved bot, which is what makes it a preview rather than a lookalike:
 * the embedded widget draws the same component from the same settings. Both
 * also live-update here. A saved color or greeting arrives as a prop, and a
 * document that finishes indexing changes the line above the composer, with no
 * reload in either case.
 *
 * The decline branch is deliberately not a failure. Retrieval found nothing, no
 * model was called, and the reader is offered a person instead.
 */
import {
  type BotSettings,
  type Citation,
  type Doc,
  MAX_HISTORY_ANSWER_CHARS,
  MAX_HISTORY_TURNS,
  MAX_MESSAGE_CHARS,
  type Rating,
  type Turn,
  handoffRequestSchema,
} from '@acb/schemas';
import { Answer, Button, Card, Input, themeStyle } from '@acb/ui';
import { useId, useRef, useState } from 'react';
import { ApiError, requestHandoff, streamChat } from './api';
import { RatingControls } from './rating-controls';

/**
 * What one exchange looks like on screen. This is view state rather than a wire
 * shape: a turn exists here before the server has given it an id, and a failure
 * sentence is shown but never sent back as history.
 */
interface Exchange {
  key: string;
  question: string;
  text: string;
  citations: Citation[];
  messageId?: string;
  rating?: Rating;
  declinedQuestionId?: string;
  failure?: string;
  streaming: boolean;
}

export interface PreviewChatProps {
  settings: BotSettings;
  documents: Doc[];
  onRate: (messageId: string, rating: Rating) => Promise<void>;
  /** A decline is a new row in the unanswered list, so the dashboard refetches it. */
  onDeclined?: () => void;
}

export function PreviewChat({ settings, documents, onRate, onDeclined }: PreviewChatProps) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const counter = useRef(0);

  const ready = documents.filter((document) => document.state === 'ready');
  const indexing = documents.filter((document) => document.state !== 'ready' && document.state !== 'failed');

  function update(key: string, change: (exchange: Exchange) => Exchange) {
    setExchanges((current) => current.map((exchange) => (exchange.key === key ? change(exchange) : exchange)));
  }

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const asked = question.trim();
    if (!asked || busy) return;

    counter.current += 1;
    const key = `exchange-${counter.current}`;
    setExchanges((current) => [...current, { key, question: asked, text: '', citations: [], streaming: true }]);
    setQuestion('');
    setBusy(true);
    let declined = false;

    try {
      await streamChat({ message: asked, history: historyFrom(exchanges) }, (event) => {
        if (event.type === 'delta') update(key, (exchange) => ({ ...exchange, text: exchange.text + event.text }));
        if (event.type === 'citations') update(key, (exchange) => ({ ...exchange, citations: event.citations }));
        if (event.type === 'declined') {
          declined = true;
          update(key, (exchange) => ({ ...exchange, text: event.message, declinedQuestionId: event.questionId }));
        }
        if (event.type === 'done') update(key, (exchange) => ({ ...exchange, messageId: event.messageId }));
        if (event.type === 'failure') update(key, (exchange) => ({ ...exchange, failure: event.message }));
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'The assistant could not be reached. Try again.';
      update(key, (exchange) => ({ ...exchange, failure: message }));
    } finally {
      update(key, (exchange) => ({ ...exchange, streaming: false }));
      setBusy(false);
      if (declined) onDeclined?.();
    }
  }

  return (
    <Card style={themeStyle(settings)} className="acb:flex acb:flex-col acb:gap-3">
      <div>
        <h2 className="acb:text-base acb:font-semibold acb:text-ink">Preview: {settings.name}</h2>
        <p className="acb:mt-1 acb:text-xs acb:text-ink-muted">{settings.greeting}</p>
      </div>

      <p className="acb:text-xs acb:text-ink-muted" role="status">
        Answering from {ready.length} ready {ready.length === 1 ? 'document' : 'documents'}
        {indexing.length > 0 ? `, ${indexing.length} still indexing` : ''}.
      </p>

      <div className="acb:flex acb:min-h-40 acb:flex-col acb:gap-4" aria-live="polite">
        {exchanges.length === 0 ? (
          <p className="acb:text-sm acb:text-ink-muted">Ask something the documents cover, such as how refunds work.</p>
        ) : null}
        {exchanges.map((exchange) => (
          <ExchangeView key={exchange.key} exchange={exchange} onRate={onRate} />
        ))}
      </div>

      <form onSubmit={ask} className="acb:flex acb:flex-col acb:gap-2 acb:sm:flex-row">
        <label htmlFor={inputId} className="acb:sr-only">
          Ask the bot a question
        </label>
        <Input
          id={inputId}
          value={question}
          maxLength={MAX_MESSAGE_CHARS}
          placeholder="Ask a question"
          onChange={(event) => setQuestion(event.target.value)}
        />
        <Button type="submit" disabled={busy || question.trim().length === 0}>
          {busy ? 'Answering' : 'Ask'}
        </Button>
      </form>
    </Card>
  );
}

function ExchangeView({ exchange, onRate }: { exchange: Exchange; onRate: PreviewChatProps['onRate'] }) {
  return (
    <div className="acb:space-y-2">
      <p className="acb:text-sm acb:font-medium acb:text-ink">{exchange.question}</p>
      {exchange.failure ? (
        <p className="acb:rounded-md acb:bg-surface-muted acb:p-2 acb:text-sm acb:text-ink">{exchange.failure}</p>
      ) : (
        <Answer text={exchange.text} citations={exchange.citations} pending={exchange.streaming} />
      )}
      {exchange.declinedQuestionId ? <HandoffForm questionId={exchange.declinedQuestionId} /> : null}
      {exchange.messageId && !exchange.streaming ? (
        <RatingControls messageId={exchange.messageId} rating={exchange.rating} onRate={onRate} />
      ) : null}
    </div>
  );
}

/**
 * The "talk to a human" capture. The address is checked against the same schema
 * the API validates with, so a malformed one never leaves the page and nothing
 * is recorded for it.
 */
function HandoffForm({ questionId }: { questionId: string }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const inputId = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = handoffRequestSchema.safeParse({ questionId, email });
    if (!parsed.success) {
      setMessage('That email address does not look right. Nothing was sent.');
      return;
    }
    try {
      await requestHandoff(questionId, parsed.data.email);
      setSent(true);
      setMessage('Got it. Someone will follow up at that address.');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'That address could not be sent. Try again.');
    }
  }

  if (sent) {
    return (
      <p role="status" className="acb:text-xs acb:text-ink-muted">
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="acb:space-y-2 acb:rounded-md acb:bg-surface-muted acb:p-2">
      <label htmlFor={inputId} className="acb:text-xs acb:font-medium acb:text-ink">
        Talk to a human
      </label>
      <div className="acb:flex acb:gap-2">
        <Input id={inputId} value={email} placeholder="you@example.com" onChange={(event) => setEmail(event.target.value)} />
        <Button type="submit" size="sm">
          Send
        </Button>
      </div>
      {message ? (
        <p role="status" className="acb:text-xs acb:text-ink-muted">
          {message}
        </p>
      ) : null}
    </form>
  );
}

/**
 * The turns replayed to the model. Declines and failure sentences are left out:
 * neither is something the bot said from the documents, and replaying a failure
 * teaches it to repeat one.
 */
function historyFrom(exchanges: Exchange[]): Turn[] {
  const turns: Turn[] = [];
  for (const exchange of exchanges) {
    if (exchange.failure || exchange.declinedQuestionId) continue;
    turns.push({ role: 'user', content: exchange.question.slice(0, MAX_HISTORY_ANSWER_CHARS) });
    turns.push({ role: 'assistant', content: exchange.text.slice(0, MAX_HISTORY_ANSWER_CHARS) });
  }
  return turns.slice(-MAX_HISTORY_TURNS);
}
