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
 *
 * The layout is a bento of cards rather than a stack of prose: a hero with the
 * ask box in it, four numbered step cards, the two screenshots side by side,
 * and a closing band. Motion is decoration only, it is all CSS, and every
 * animated rule sits behind `prefers-reduced-motion` in `styles.css`.
 */
import { DEMO_DATA_LABEL } from '@acb/schemas';
import { Badge, Button, Card, cn, Lightbox, SiteFooter, Textarea } from '@acb/ui';
import { askWidget, createWidget, type WidgetOptions } from '@acb/widget';
import { ArrowRight, FileText, MessageSquareQuote, ShieldCheck, Zap } from 'lucide-react';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { SiteNav } from './site-nav';

/**
 * The id the page opens with before the session answers. Every visitor gets
 * their own seeded bot, so the real public id arrives from `/api/bot` a moment
 * after the page does; this stands in until then, and stays the id the tests
 * mount against.
 */
export const DEMO_BOT_ID = '00000000-0000-4000-8000-000000000041';

/** The four steps a business goes through, in the order the dashboard offers them. */
export const STEPS = [
  {
    title: 'Add your docs',
    body: 'Upload PDFs, paste Markdown or point at help-center pages. A progress bar shows each one being split into sections and indexed.',
  },
  {
    title: 'Make it yours',
    body: 'Set the name, accent color, greeting and tone, and try questions in the preview chat beside the settings.',
  },
  {
    title: 'Paste one line',
    body: 'Copy the script tag onto any site. The bubble costs about 2 KB, and the chat downloads only when a visitor reaches for it.',
  },
  {
    title: 'Read what people asked',
    body: 'Conversation logs, thumbs up and down, and a list of questions the bot could not answer, which is the list of docs to write next.',
  },
];

/** Questions the seeded SaaS help center actually covers, so the first answer lands. */
export const PROMPTS = ['How do refunds work?', 'How do I change my plan?', 'Can I cancel partway through a year?'];

/**
 * What the hero promises, each one a fact the page or the API can be held to
 * rather than an adjective. The numbers match the README's pipeline section
 * and the About page, so change all three together.
 */
export const PROOF = [
  { icon: MessageSquareQuote, label: 'Every answer cites the section it came from' },
  { icon: Zap, label: 'A 2 KB bubble; the chat loads on first reach' },
  { icon: ShieldCheck, label: 'No account, no login, your own workspace' },
];

/** The measured numbers behind an answer, shown as proof rather than prose. */
export const STATS = [
  { value: '900', label: 'characters a chunk, 150 of overlap' },
  { value: '1536', label: 'dimensions an embedding' },
  { value: '6', label: 'nearest chunks behind an answer' },
  { value: '0.62', label: 'relevance floor before it declines' },
];

export interface LandingProps {
  botId?: string;
  /** Swapped in tests so the chat bundle can be watched and stubbed. */
  loadChat?: WidgetOptions['loadChat'];
}

export function Landing({ botId, loadChat }: LandingProps) {
  const [draft, setDraft] = useState('');
  const [liveBotId, setLiveBotId] = useState(botId ?? DEMO_BOT_ID);
  /** Re-sent when the real id lands mid-question, so nothing typed is dropped. */
  const lastQuestion = useRef('');
  const mountedId = useRef<string | null>(null);

  // A caller that names a bot means it: only the unattended page asks the
  // session which bot it was seeded with.
  useEffect(() => {
    if (botId) return;
    let live = true;
    fetch('/api/bot')
      .then((response) => (response.ok ? response.json() : null))
      .then((bot) => {
        if (live && typeof bot?.publicId === 'string') setLiveBotId(bot.publicId);
      })
      .catch(() => {
        // The bubble still opens and the chat reports the failure itself.
      });
    return () => {
      live = false;
    };
  }, [botId]);

  useEffect(() => {
    const remounting = mountedId.current !== null && mountedId.current !== liveBotId;
    mountedId.current = liveBotId;
    const widget = createWidget({ botId: liveBotId, loadChat });
    if (remounting && lastQuestion.current) askWidget(lastQuestion.current);
    return () => widget.destroy();
  }, [liveBotId, loadChat]);

  const ask = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;
    lastQuestion.current = trimmed;
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
    <div className="acb:flex acb:min-h-screen acb:flex-col acb:bg-surface acb:text-ink">
      <SiteNav />
      <main className="acb:mx-auto acb:w-full acb:max-w-4xl acb:space-y-16 acb:px-4 acb:pb-16 acb:pt-8 acb:sm:pb-24 acb:sm:pt-12">
        {/*
         * The hero is the product: the headline, the ask box and the prompts
         * are one panel, so the first thing on the page is the thing to do.
         * The glow behind it is a blurred accent disc, which picks up a bot's
         * saved color anywhere the token is overridden.
         *
         * It is the one section that never animates in: it is the first paint,
         * and a fade there is a blank page.
         */}
        <section className="acb:relative">
          <div
            aria-hidden="true"
            className="acb:pointer-events-none acb:absolute acb:inset-x-0 acb:-top-28 acb:-z-10 acb:mx-auto acb:h-56 acb:max-w-2xl acb:rounded-full acb:bg-accent/20 acb:blur-3xl"
          />
          <header className="acb:space-y-4 acb:text-center">
            <Badge className="acb:gap-1.5 acb:border-accent/30 acb:bg-accent/10 acb:px-3 acb:py-1 acb:text-accent-text">
              <FileText aria-hidden="true" className="acb:size-3.5" />
              Answers from your docs, with citations
            </Badge>
            <h1 className="acb:text-4xl acb:font-semibold acb:tracking-tight acb:text-balance acb:text-ink acb:sm:text-5xl">
              Your docs, answering for themselves.
            </h1>
            <p className="acb:mx-auto acb:max-w-2xl acb:text-base acb:text-pretty acb:text-ink-muted acb:sm:text-lg">
              Upload a help center and get a chat bubble for your site that answers from it and cites the section it used. Ask the
              demo bot something now. Its documents are a made-up SaaS help center, labelled {DEMO_DATA_LABEL.toLowerCase()}.
            </p>
          </header>

          <Card className="acb:mt-8 acb:space-y-4 acb:p-5 acb:shadow-lg acb:shadow-accent/5 acb:ring-1 acb:ring-line acb:sm:p-6">
            <form onSubmit={onSubmit} className="acb:space-y-3">
              <label htmlFor="landing-question" className="acb:block acb:text-sm acb:font-medium acb:text-ink">
                Ask the demo bot
              </label>
              <Textarea
                id="landing-question"
                rows={3}
                value={draft}
                placeholder="How do refunds work?"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                className="acb:text-base"
              />
              <div className="acb:flex acb:items-center acb:justify-between acb:gap-3">
                <p className="acb:text-xs acb:text-ink-muted">Enter to ask, Shift and Enter for a new line.</p>
                <Button type="submit" disabled={draft.trim().length === 0} className="acb:gap-2">
                  Ask
                  <ArrowRight aria-hidden="true" className="acb:size-4" />
                </Button>
              </div>
            </form>

            <div className="acb:space-y-2 acb:border-t acb:border-line acb:pt-4">
              <p className="acb:text-xs acb:font-semibold acb:text-ink-muted">Or start with one of these</p>
              <ul className="acb:flex acb:flex-wrap acb:gap-2">
                {PROMPTS.map((prompt) => (
                  <li key={prompt}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => ask(prompt)}
                      className="acb:rounded-full acb:transition-transform acb:hover:-translate-y-0.5 acb:hover:border-accent/40"
                    >
                      {prompt}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <ul className="acb:mt-6 acb:grid acb:gap-3 acb:text-sm acb:text-ink-muted acb:sm:grid-cols-3">
            {PROOF.map(({ icon: Icon, label }) => (
              <li key={label} className="acb:flex acb:items-start acb:gap-2">
                <Icon aria-hidden="true" className="acb:mt-0.5 acb:size-4 acb:shrink-0 acb:text-accent" />
                {label}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how-it-works" data-acb-rise className="acb:space-y-6">
          <div className="acb:space-y-2">
            <h2 id="how-it-works" className="acb:text-2xl acb:font-semibold acb:tracking-tight acb:text-ink">
              How it works
            </h2>
            <p className="acb:max-w-2xl acb:text-sm acb:text-ink-muted">
              Four steps from a folder of documents to a bubble on your site.
            </p>
          </div>
          <ol className="acb:grid acb:gap-4 acb:sm:grid-cols-2">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <Card className="acb:h-full acb:space-y-3 acb:p-5 acb:transition acb:hover:-translate-y-0.5 acb:hover:border-accent/40 acb:hover:shadow-md">
                  <span
                    aria-hidden="true"
                    className="acb:flex acb:h-8 acb:w-8 acb:items-center acb:justify-center acb:rounded-full acb:bg-accent acb:text-sm acb:font-semibold acb:text-accent-ink"
                  >
                    {index + 1}
                  </span>
                  <div className="acb:space-y-1">
                    <h3 className="acb:text-base acb:font-semibold acb:text-ink">{step.title}</h3>
                    <p className="acb:text-sm acb:text-ink-muted">{step.body}</p>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        {/* The measured numbers, which say more about the retrieval than a paragraph would. */}
        <section aria-labelledby="numbers" data-acb-rise className="acb:space-y-6">
          <h2 id="numbers" className="acb:text-2xl acb:font-semibold acb:tracking-tight acb:text-ink">
            What is behind an answer
          </h2>
          <dl className="acb:grid acb:gap-4 acb:sm:grid-cols-2 acb:lg:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="acb:rounded-panel acb:bg-surface-muted acb:p-4">
                <dt className="acb:text-2xl acb:font-semibold acb:tabular-nums acb:text-ink">{stat.value}</dt>
                <dd className="acb:mt-1 acb:text-xs acb:text-ink-muted">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="screens" data-acb-rise className="acb:space-y-6">
          <div className="acb:space-y-2">
            <h2 id="screens" className="acb:text-2xl acb:font-semibold acb:tracking-tight acb:text-ink">
              What you get
            </h2>
            <p className="acb:max-w-2xl acb:text-sm acb:text-ink-muted">
              The real screens, not a mockup. Click either one to read it full size.
            </p>
          </div>
          <div className="acb:grid acb:gap-4 acb:lg:grid-cols-5">
            <Screenshot
              name="dashboard"
              width={1280}
              height={800}
              alt="The dashboard: bot settings, a preview chat, the seeded documents, ratings, conversations and unanswered questions."
              caption="The dashboard every visitor gets, seeded with a bot, documents and history."
              className="acb:lg:col-span-3"
            />
            <Screenshot
              name="widget"
              width={384}
              height={747}
              alt="The chat widget answering how refunds work, with two numbered sources naming the document and section."
              caption="The widget on a page, answering with numbered sources."
              className="acb:mx-auto acb:max-w-xs acb:lg:col-span-2 acb:lg:mx-0"
            />
          </div>
        </section>

        {/* The closing band: the two things left to do, once the demo has been seen. */}
        <section data-acb-rise>
          <Card className="acb:flex acb:flex-col acb:gap-4 acb:bg-surface-muted acb:p-6 acb:sm:flex-row acb:sm:items-center acb:sm:justify-between">
            <div className="acb:space-y-1">
              <h2 className="acb:text-lg acb:font-semibold acb:text-ink">Seen enough? Go and break it.</h2>
              <p className="acb:text-sm acb:text-ink-muted">
                Your workspace is already seeded, so every dashboard screen has something in it.
              </p>
            </div>
            <div className="acb:flex acb:shrink-0 acb:flex-wrap acb:gap-2">
              <a
                href="/dashboard"
                className="acb:inline-flex acb:h-10 acb:items-center acb:gap-2 acb:rounded-md acb:bg-accent acb:px-4 acb:text-sm acb:font-medium acb:text-accent-ink acb:no-underline acb:transition-opacity acb:hover:opacity-90 acb:focus-visible:outline-2 acb:focus-visible:outline-offset-2 acb:focus-visible:outline-accent"
              >
                Open the dashboard
                <ArrowRight aria-hidden="true" className="acb:size-4" />
              </a>
              <a
                href="/about"
                className="acb:inline-flex acb:h-10 acb:items-center acb:rounded-md acb:border acb:border-line acb:bg-surface acb:px-4 acb:text-sm acb:font-medium acb:text-ink acb:no-underline acb:hover:bg-surface-muted acb:focus-visible:outline-2 acb:focus-visible:outline-offset-2 acb:focus-visible:outline-accent"
              >
                How the answers are made
              </a>
            </div>
          </Card>
        </section>
      </main>
      <SiteFooter aboutHref="/about" contentClassName="acb:max-w-4xl" />
    </div>
  );
}

interface ScreenshotProps {
  name: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  className?: string;
}

/**
 * One screenshot in the theme the page is in. Both are in the markup and CSS
 * shows one, keyed on the toggle's attribute, so switching needs no re-render.
 * The images were taken from the live site at 1280 by 800.
 *
 * The thumbnail is a button that opens the same image full size in a
 * lightbox, since the dashboard shot is unreadable at the page's width.
 */
function Screenshot({ name, width, height, alt, caption, className }: ScreenshotProps) {
  const themed = (base: string) => (
    <>
      <img
        src={`/screens/${name}-light.webp`}
        width={width}
        height={height}
        alt={alt}
        loading="lazy"
        className={cn(base, 'acb:dark:hidden')}
      />
      <img
        src={`/screens/${name}-dark.webp`}
        width={width}
        height={height}
        alt={alt}
        loading="lazy"
        className={cn(base, 'acb:hidden acb:dark:block')}
      />
    </>
  );

  return (
    <figure className={cn('acb:space-y-2', className)}>
      <Lightbox
        title={alt}
        trigger={
          <button
            type="button"
            aria-label={`View full size: ${caption}`}
            className="acb:block acb:w-full acb:cursor-zoom-in acb:rounded-panel acb:transition acb:hover:-translate-y-0.5 acb:focus-visible:outline-2 acb:focus-visible:outline-offset-2 acb:focus-visible:outline-accent"
          >
            {themed(
              'acb:h-auto acb:w-full acb:rounded-panel acb:border acb:border-line acb:shadow-sm acb:transition acb:hover:shadow-lg',
            )}
          </button>
        }
      >
        {themed('acb:max-h-full acb:max-w-full acb:w-auto acb:h-auto acb:rounded-panel acb:object-contain')}
      </Lightbox>
      <figcaption className="acb:text-xs acb:text-ink-muted">{caption} Click to enlarge.</figcaption>
    </figure>
  );
}
