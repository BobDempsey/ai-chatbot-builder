/**
 * The About page at `/about`: what RAG means here, the five steps an answer
 * goes through, and the stack. It is a second Vite entry
 * (`about/index.html`) rather than a client-side route, so it loads without
 * the landing page's widget and its session request.
 *
 * It carries the landing page's shapes on purpose: the same column, the same
 * numbered cards and the same closing band, so the two pages read as one site
 * rather than as a page and its appendix.
 *
 * The numbers in `RAG_STEPS` match the README's "How an answer is made";
 * change both together.
 */
import { Badge, Card, SiteFooter } from '@acb/ui';
import { ArrowRight, Sparkles } from 'lucide-react';
import { SiteNav } from './site-nav';

/** The RAG pipeline, with the real numbers. The README's "How an answer is made" says the same at length. */
export const RAG_STEPS = [
  {
    title: 'Ingest',
    body: 'A PDF, a web page or pasted Markdown becomes text, split on its headings into chunks of about 900 characters with 150 characters of overlap. Each chunk keeps its heading, which becomes the section a citation names.',
  },
  {
    title: 'Embed',
    body: 'OpenAI text-embedding-3-small turns each chunk into 1,536 numbers, stored in Postgres with pgvector.',
  },
  {
    title: 'Retrieve',
    body: 'A question is embedded the same way, and an HNSW index finds the six nearest chunks by cosine distance, from your workspace only. Anything too far away (0.62 or more) is dropped.',
  },
  {
    title: 'Answer',
    body: 'OpenAI gpt-5.6-luna answers from those chunks alone and numbers what it used. The numbers become citations linking to the document and section, and the reply streams in as it is written.',
  },
  {
    title: 'Decline',
    body: 'When the chunks do not hold the answer, the model says so instead of guessing, and the bot offers to pass the question to a person.',
  },
];

/** What the app is built with, one line per layer. */
export const STACK = [
  { area: 'Front end', detail: 'React 19, TypeScript, Vite, Tailwind CSS 4 and shadcn/ui components on Radix' },
  {
    area: 'Widget',
    detail: 'A shadow-DOM embed: a script tag of about 2 KB, with the chat downloaded on first hover, focus or click',
  },
  { area: 'API', detail: 'Hono on Vercel Functions, with Zod validating every request and response' },
  { area: 'Data', detail: 'Supabase Postgres with pgvector, and row-level security keeping each session to its own rows' },
  { area: 'AI', detail: 'OpenAI text-embedding-3-small for vectors and gpt-5.6-luna for answers' },
  {
    area: 'Hosting',
    detail: 'Vercel, with a firewall rate limit, Web Analytics and a daily cron that sweeps expired workspaces',
  },
  { area: 'Tooling', detail: 'A pnpm monorepo, Vitest, Biome, GitHub Actions and OpenSpec change proposals' },
];

export function About() {
  return (
    <div className="acb:flex acb:min-h-screen acb:flex-col acb:bg-surface acb:text-ink">
      <SiteNav current="about" />
      <main className="acb:mx-auto acb:w-full acb:max-w-4xl acb:px-4 acb:pb-16 acb:pt-8 acb:sm:pb-24 acb:sm:pt-12">
        <section aria-labelledby="about-heading" className="acb:space-y-14">
          {/* The same glow as the landing hero, so arriving here is not arriving somewhere else. */}
          <div className="acb:relative">
            <div
              aria-hidden="true"
              className="acb:pointer-events-none acb:absolute acb:inset-x-0 acb:-top-28 acb:-z-10 acb:mx-auto acb:h-56 acb:max-w-2xl acb:rounded-full acb:bg-accent/20 acb:blur-3xl"
            />
            <header className="acb:space-y-4 acb:text-center">
              <Badge className="acb:gap-1.5 acb:border-accent/30 acb:bg-accent/10 acb:px-3 acb:py-1 acb:text-accent">
                <Sparkles aria-hidden="true" className="acb:size-3.5" />
                Retrieval-augmented generation
              </Badge>
              <h1
                id="about-heading"
                className="acb:text-4xl acb:font-semibold acb:tracking-tight acb:text-balance acb:text-ink acb:sm:text-5xl"
              >
                About this app
              </h1>
              <p className="acb:mx-auto acb:max-w-2xl acb:text-base acb:text-pretty acb:text-ink-muted">
                This is a retrieval-augmented generation (RAG) app: the bot finds the passages in your documents that match a
                question, then answers from those passages alone and cites them. No account, no login. Every visitor gets a
                workspace of their own that is deleted after 24 hours.
              </p>
            </header>
          </div>

          <div data-acb-rise className="acb:space-y-6">
            <div className="acb:space-y-2">
              <h2 className="acb:text-2xl acb:font-semibold acb:tracking-tight acb:text-ink">How an answer is made</h2>
              <p className="acb:max-w-2xl acb:text-sm acb:text-ink-muted">
                Five steps, with the numbers the running app actually uses.
              </p>
            </div>
            {/* Five steps in two columns leaves an odd one at the end, which takes the full width. */}
            <ol className="acb:grid acb:gap-4 acb:sm:grid-cols-2">
              {RAG_STEPS.map((step, index) => (
                <li key={step.title} className="acb:sm:last:col-span-2">
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
          </div>

          <div data-acb-rise className="acb:space-y-6">
            <h2 className="acb:text-2xl acb:font-semibold acb:tracking-tight acb:text-ink">Tech stack</h2>
            <dl className="acb:grid acb:gap-4 acb:sm:grid-cols-2">
              {STACK.map((item) => (
                <div key={item.area} className="acb:rounded-panel acb:bg-surface-muted acb:p-4">
                  <dt className="acb:text-xs acb:font-semibold acb:uppercase acb:tracking-wide acb:text-accent">{item.area}</dt>
                  <dd className="acb:m-0 acb:mt-1 acb:text-sm acb:text-ink-muted">{item.detail}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div data-acb-rise>
            <Card className="acb:flex acb:flex-col acb:gap-4 acb:bg-surface-muted acb:p-6 acb:sm:flex-row acb:sm:items-center acb:sm:justify-between">
              <div className="acb:space-y-1">
                <h2 className="acb:text-lg acb:font-semibold acb:text-ink">Try it on your own documents.</h2>
                <p className="acb:text-sm acb:text-ink-muted">
                  The dashboard is where you upload them and copy the one-line script tag.
                </p>
              </div>
              <a
                href="/dashboard"
                className="acb:inline-flex acb:h-10 acb:shrink-0 acb:items-center acb:gap-2 acb:rounded-md acb:bg-accent acb:px-4 acb:text-sm acb:font-medium acb:text-accent-ink acb:no-underline acb:transition-opacity acb:hover:opacity-90 acb:focus-visible:outline-2 acb:focus-visible:outline-offset-2 acb:focus-visible:outline-accent"
              >
                Open the dashboard
                <ArrowRight aria-hidden="true" className="acb:size-4" />
              </a>
            </Card>
          </div>
        </section>
      </main>
      <SiteFooter aboutHref="/about" contentClassName="acb:max-w-4xl" />
    </div>
  );
}
