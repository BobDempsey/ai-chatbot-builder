/**
 * The landing page, led by the chat rather than by a tour of the dashboard.
 *
 * It copies ai-frontend-advisor's shape, for the reason that worked there: a
 * visitor who asks a question and gets a cited answer has already seen the
 * product, so nothing has to be explained first. The box and the prompts both
 * open the same embedded widget with the question already sent, which is also
 * the widget a customer would paste onto their own site.
 *
 * The page talks to the widget through the `acb:ask` event rather than by
 * holding a reference to it, because that is the same contract a customer's
 * page gets.
 */
import { DEMO_DATA_LABEL } from '@acb/schemas';
import { Button, Card, Textarea } from '@acb/ui';
import { askWidget, createWidget, type WidgetOptions } from '@acb/widget';
import { type FormEvent, type KeyboardEvent, useEffect, useState } from 'react';

/**
 * The demo bot every visitor talks to. Integration swaps this for the public id
 * of the seeded demo bot; until then it is the id the phase 0 fake answers for.
 */
export const DEMO_BOT_ID = '00000000-0000-4000-8000-000000000041';

/** Questions the seeded SaaS help center actually covers, so the first answer lands. */
export const PROMPTS = ['How do refunds work?', 'How do I change my plan?', 'Can I cancel partway through a year?'];

export interface LandingProps {
  botId?: string;
  /** Swapped in tests so the chat bundle can be watched and stubbed. */
  loadChat?: WidgetOptions['loadChat'];
}

export function Landing({ botId = DEMO_BOT_ID, loadChat }: LandingProps) {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const widget = createWidget({ botId, loadChat });
    return () => widget.destroy();
  }, [botId, loadChat]);

  const ask = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;
    askWidget(trimmed);
    setDraft('');
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    ask(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      ask(draft);
    }
  };

  return (
    <div className="acb:min-h-screen acb:bg-surface acb:text-ink">
      <main className="acb:mx-auto acb:max-w-2xl acb:space-y-8 acb:px-4 acb:py-16 acb:sm:py-24">
        <header className="acb:space-y-3">
          <h1 className="acb:text-3xl acb:font-semibold acb:text-ink acb:sm:text-4xl">Your docs, answering for themselves.</h1>
          <p className="acb:text-base acb:text-ink-muted">
            Upload a help center and get a chat bubble for your site that answers from it and cites the section it used. Ask the
            demo bot something now. Its documents are a made-up SaaS help center, labelled {DEMO_DATA_LABEL.toLowerCase()}.
          </p>
        </header>

        <Card className="acb:space-y-3">
          <form onSubmit={onSubmit} className="acb:space-y-2">
            <label htmlFor="landing-question" className="acb:block acb:text-sm acb:font-medium acb:text-ink">
              Ask the demo bot
            </label>
            <Textarea
              id="landing-question"
              rows={2}
              value={draft}
              placeholder="How do refunds work?"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className="acb:flex acb:justify-end">
              <Button type="submit" disabled={draft.trim().length === 0}>
                Ask
              </Button>
            </div>
          </form>

          <div className="acb:space-y-2 acb:border-t acb:border-line acb:pt-3">
            <p className="acb:text-xs acb:font-semibold acb:text-ink-muted">Or start with one of these</p>
            <ul className="acb:flex acb:flex-wrap acb:gap-2">
              {PROMPTS.map((prompt) => (
                <li key={prompt}>
                  <Button variant="outline" size="sm" onClick={() => ask(prompt)}>
                    {prompt}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <section className="acb:space-y-2">
          <h2 className="acb:text-lg acb:font-semibold acb:text-ink">What happens behind the answer</h2>
          <p className="acb:text-sm acb:text-ink-muted">
            Each document is split into sections and indexed. A question retrieves the closest sections, and the model answers
            from those alone, numbering what it used. When nothing relevant comes back, the bot says so and offers to pass the
            question to a person instead of guessing.
          </p>
          <p className="acb:text-sm acb:text-ink-muted">
            No account, no login. Open the dashboard whenever you want to upload your own documents and copy the script tag.
          </p>
          <a
            href="/dashboard"
            className="acb:inline-block acb:text-sm acb:font-medium acb:text-accent acb:underline acb:underline-offset-4"
          >
            Open the dashboard
          </a>
        </section>
      </main>
    </div>
  );
}
