/**
 * The chat itself: the bubble, the panel, the conversation and the composer.
 * This is the half that downloads on first use, so React, the shared components
 * and the prefixed stylesheet all arrive with it.
 *
 * Answers render through `Answer` from `@acb/ui`, the same component the
 * dashboard's preview chat uses, so the owner tests what a visitor gets rather
 * than something that resembles it.
 *
 * The panel is a dialog the widget builds itself. The shared `Dialog` locks
 * scroll by styling `document.body`, and the widget may not change a page it
 * does not own, so focus containment lives in `focus-trap.ts` instead.
 */
import {
  type Bot,
  type BotSettings,
  type Citation,
  DEFAULT_BOT_SETTINGS,
  MAX_MESSAGE_CHARS,
  MAX_QUESTIONS_PER_WINDOW,
} from '@acb/schemas';
import { Answer, Button, Input, readableInk, Textarea, themeStyle } from '@acb/ui';
import { LoaderCircle, MessageCircle, RotateCcw, Send, X } from 'lucide-react';
import { type CSSProperties, type FormEvent, type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { ASK_EVENT, questionOf } from '../ask-event';
import { BUBBLE_CLASS, BUBBLE_LABEL } from '../bubble';
import { askBot, fetchBot, sendHandoff } from './client';
import { useFocusTrap } from './focus-trap';
import { allowanceNotice, questionsLeft, recordQuestion } from './quota';
import { asHistory, clearConversation, entry, type Entry, readConversation, writeConversation } from './store';

/** How often the used questions age out of the window while the panel is open. */
const RECOUNT_MS = 30_000;

export interface ChatPanelProps {
  botId: string;
  apiBase: string;
  initialOpen?: boolean;
  initialQuestion?: string;
}

/** The answer being streamed, before it becomes an entry in the conversation. */
interface Stream {
  text: string;
  citations: Citation[];
}

export function ChatPanel({ botId, apiBase, initialOpen = false, initialQuestion = '' }: ChatPanelProps) {
  const [open, setOpen] = useState(initialOpen);
  const [settings, setSettings] = useState<BotSettings>(DEFAULT_BOT_SETTINGS);
  const [entries, setEntries] = useState<Entry[]>(() => readConversation());
  const [stream, setStream] = useState<Stream | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [left, setLeft] = useState(() => questionsLeft());

  const bubble = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const endOfLog = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const remember = (next: Entry[]) => {
    setEntries(next);
    writeConversation(next);
  };

  useEffect(() => {
    let live = true;
    void fetchBot(apiBase, botId).then((bot: Bot | null) => {
      if (live && bot) setSettings({ name: bot.name, accentColor: bot.accentColor, greeting: bot.greeting, tone: bot.tone });
    });
    return () => {
      live = false;
    };
  }, [apiBase, botId]);

  // Focus goes into the composer on opening and back to the bubble on closing,
  // which is the pair the spec asks for and the pair keyboard readers notice.
  // It is skipped on the first render, or a widget that mounts shut would pull
  // focus off whatever the host page had it on.
  const settled = useRef(false);
  useEffect(() => {
    if (open) composer.current?.focus();
    else if (settled.current) bubble.current?.focus();
    settled.current = true;
  }, [open]);

  // The newest message stays in view as it arrives. The optional call is for
  // jsdom, which has no scrolling at all.
  useEffect(() => {
    if (entries.length === 0 && !stream) return;
    endOfLog.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
  }, [entries, stream]);

  // Questions age out of the window while the panel sits open, so the count
  // recovers without a reload.
  useEffect(() => {
    if (!open) return undefined;
    setLeft(questionsLeft());
    const timer = window.setInterval(() => setLeft(questionsLeft()), RECOUNT_MS);
    return () => window.clearInterval(timer);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);
  useFocusTrap(open, panel, close);

  const send = async (text: string) => {
    const message = text.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!message || pending || questionsLeft() === 0) return;

    const before = entries;
    recordQuestion();
    setLeft(questionsLeft());
    const said: Entry[] = [...before, entry({ role: 'user', content: message })];
    remember(said);
    setDraft('');
    setPending(true);
    setStream({ text: '', citations: [] });

    let answer = '';
    let citations: Citation[] = [];
    await askBot(
      { apiBase, botId, message, history: asHistory(before) },
      {
        onDelta: (piece) => {
          answer += piece;
          setStream({ text: answer, citations });
        },
        onCitations: (next) => {
          citations = next;
          setStream({ text: answer, citations: next });
        },
        onDeclined: (sentence, questionId) => {
          remember([...said, entry({ role: 'assistant', content: sentence, questionId })]);
        },
        onDone: () => {
          remember([...said, entry({ role: 'assistant', content: answer, citations })]);
        },
        onFailure: (sentence) => {
          remember([...said, entry({ role: 'assistant', content: sentence, failed: true })]);
        },
      },
    );

    setStream(null);
    setPending(false);
    setLeft(questionsLeft());
    composer.current?.focus();
  };

  // A question handed in by the page goes out once. One that cannot go yet, with
  // a reply in flight or the allowance spent, waits in the field rather than
  // being dropped.
  const sendRef = useRef(send);
  sendRef.current = send;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const offer = useCallback((question: string) => {
    if (!question) return;
    if (pendingRef.current || questionsLeft() === 0) setDraft(question.slice(0, MAX_MESSAGE_CHARS));
    else void sendRef.current(question);
  }, []);

  const askedInitial = useRef(false);
  useEffect(() => {
    if (askedInitial.current) return;
    askedInitial.current = true;
    offer(initialQuestion);
  }, [initialQuestion, offer]);

  useEffect(() => {
    const onAsk = (event: Event) => {
      setOpen(true);
      offer(questionOf(event));
    };
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, [offer]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  };

  const startAgain = () => {
    clearConversation();
    setEntries([]);
    setDraft('');
    composer.current?.focus();
  };

  const onHandoff = (id: string, email: string) => {
    remember(entries.map((said) => (said.id === id ? { ...said, handoffEmail: email } : said)));
  };

  const accent: CSSProperties = {
    ...themeStyle(settings),
    ['--acb-bubble-accent' as string]: settings.accentColor,
    ['--acb-bubble-ink' as string]: readableInk(settings.accentColor),
  };
  const notice = allowanceNotice(left);
  const spent = left === 0;

  return (
    <div style={accent}>
      <button
        ref={bubble}
        type="button"
        className={BUBBLE_CLASS}
        aria-label={open ? 'Close the chat' : BUBBLE_LABEL}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={open ? 'Close the chat' : BUBBLE_LABEL}
        hidden={open}
        onClick={() => setOpen(!open)}
      >
        <MessageCircle aria-hidden="true" size={26} />
      </button>

      {open ? (
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={[
            'acb:pointer-events-auto acb:absolute acb:inset-x-0 acb:bottom-0 acb:flex acb:max-h-full acb:flex-col',
            'acb:overflow-hidden acb:border acb:border-line acb:bg-surface acb:text-ink acb:shadow-2xl',
            'acb:sm:inset-x-auto acb:sm:right-4 acb:sm:bottom-4 acb:sm:h-[min(36rem,calc(100vh-2rem))] acb:sm:w-96 acb:sm:rounded-panel',
          ].join(' ')}
        >
          <header className="acb:flex acb:items-center acb:justify-between acb:gap-2 acb:border-b acb:border-line acb:px-4 acb:py-3">
            <h2 id={titleId} className="acb:text-sm acb:font-semibold acb:text-ink">
              {settings.name}
            </h2>
            <Button variant="ghost" size="sm" aria-label="Close the chat" onClick={close}>
              <X aria-hidden="true" size={16} />
            </Button>
          </header>

          <div
            className="acb:flex-1 acb:space-y-3 acb:overflow-y-auto acb:p-4"
            role="log"
            aria-live="polite"
            aria-label="Conversation"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling log has to be reachable by keyboard, which is axe's scrollable-region-focusable rule.
            tabIndex={0}
          >
            <p className="acb:rounded-panel acb:bg-surface-muted acb:px-3 acb:py-2 acb:text-sm acb:text-ink">
              {settings.greeting}
            </p>

            {entries.map((said) =>
              said.role === 'user' ? (
                <p
                  key={said.id}
                  className="acb:ml-8 acb:rounded-panel acb:bg-surface-muted acb:px-3 acb:py-2 acb:text-sm acb:whitespace-pre-wrap acb:text-ink"
                >
                  <span className="acb:sr-only">You said: </span>
                  {said.content}
                </p>
              ) : (
                <div
                  key={said.id}
                  className={[
                    'acb:mr-8 acb:rounded-panel acb:border acb:px-3 acb:py-2',
                    said.failed ? 'acb:border-dashed acb:border-ink-muted' : 'acb:border-line',
                  ].join(' ')}
                >
                  <span className="acb:sr-only">{settings.name} said: </span>
                  {said.failed ? (
                    <p className="acb:text-sm acb:text-ink">{said.content}</p>
                  ) : (
                    <Answer text={said.content} citations={said.citations ?? []} />
                  )}
                  {said.questionId ? (
                    <Handoff
                      apiBase={apiBase}
                      questionId={said.questionId}
                      email={said.handoffEmail}
                      onAccepted={(address) => onHandoff(said.id, address)}
                    />
                  ) : null}
                </div>
              ),
            )}

            {stream ? (
              <div className="acb:mr-8 acb:rounded-panel acb:border acb:border-line acb:px-3 acb:py-2">
                <span className="acb:sr-only">{settings.name} said: </span>
                <Answer text={stream.text} citations={stream.citations} pending />
              </div>
            ) : null}

            {pending && !stream?.text ? (
              <p className="acb:flex acb:items-center acb:gap-2 acb:text-sm acb:text-ink-muted">
                <LoaderCircle aria-hidden="true" size={14} className="acb:animate-spin" />
                Reading the documents
              </p>
            ) : null}
            <div ref={endOfLog} />
          </div>

          <form onSubmit={onSubmit} className="acb:space-y-2 acb:border-t acb:border-line acb:p-4">
            <div className="acb:flex acb:items-center acb:justify-between acb:gap-2">
              <label htmlFor="acb-composer" className="acb:text-xs acb:font-medium acb:text-ink">
                Your question
              </label>
              {entries.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={startAgain} disabled={pending}>
                  <RotateCcw aria-hidden="true" size={14} /> Start again
                </Button>
              ) : null}
            </div>
            <div className="acb:flex acb:items-end acb:gap-2">
              <Textarea
                id="acb-composer"
                ref={composer}
                rows={2}
                value={draft}
                maxLength={MAX_MESSAGE_CHARS}
                disabled={spent}
                aria-describedby="acb-allowance"
                placeholder="Ask about the documents"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                className="acb:max-h-40 acb:min-h-16"
              />
              <Button type="submit" size="icon" aria-label="Send" disabled={pending || spent || draft.trim().length === 0}>
                {pending ? (
                  <LoaderCircle aria-hidden="true" size={16} className="acb:animate-spin" />
                ) : (
                  <Send aria-hidden="true" size={16} />
                )}
              </Button>
            </div>
            <p id="acb-allowance" className="acb:text-xs acb:text-ink-muted" role="status">
              {notice ?? `Enter sends, Shift and Enter adds a line. ${MAX_QUESTIONS_PER_WINDOW} questions per ten minutes.`}
            </p>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The offer made when the bot declines. The address is validated against the
 * shared schema before a request goes out, so a malformed one records nothing.
 */
function Handoff({
  apiBase,
  questionId,
  email,
  onAccepted,
}: {
  apiBase: string;
  questionId: string;
  email?: string;
  onAccepted: (email: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fieldId = useId();

  if (email) {
    return (
      <p className="acb:mt-3 acb:border-t acb:border-line acb:pt-2 acb:text-xs acb:text-ink-muted" role="status">
        Thanks. A person will follow up at {email}.
      </p>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    const failure = await sendHandoff(apiBase, questionId, draft.trim());
    setSending(false);
    if (failure) setError(failure);
    else onAccepted(draft.trim());
  };

  return (
    // `noValidate`, because the address is checked against the shared schema
    // and refused with a sentence the reader can read, rather than with the
    // browser's own bubble.
    <form onSubmit={submit} noValidate className="acb:mt-3 acb:space-y-2 acb:border-t acb:border-line acb:pt-2">
      <label htmlFor={fieldId} className="acb:block acb:text-xs acb:font-medium acb:text-ink">
        Talk to a human
      </label>
      <div className="acb:flex acb:items-center acb:gap-2">
        <Input
          id={fieldId}
          type="email"
          value={draft}
          placeholder="you@example.com"
          aria-describedby={error ? `${fieldId}-error` : undefined}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
        />
        <Button type="submit" size="sm" disabled={sending || draft.trim().length === 0}>
          Ask a person
        </Button>
      </div>
      {error ? (
        <p id={`${fieldId}-error`} className="acb:text-xs acb:text-ink" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
