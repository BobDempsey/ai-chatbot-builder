/**
 * The About page at `/about`: what RAG means here, the five steps an answer
 * goes through, and the stack. It is a second Vite entry
 * (`about/index.html`) rather than a client-side route, so it loads without
 * the landing page's widget and its session request.
 *
 * The numbers in `RAG_STEPS` match the README's "How an answer is made";
 * change both together.
 */
import { SiteFooter } from '@acb/ui';
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
    <div className="acb:min-h-screen acb:bg-surface acb:text-ink">
      <SiteNav current="about" />
      <main className="acb:mx-auto acb:max-w-2xl acb:px-4 acb:pb-16 acb:pt-8 acb:sm:pb-24 acb:sm:pt-12">
        <section aria-labelledby="about-heading" className="acb:space-y-6">
          <div className="acb:space-y-2">
            <h1 id="about-heading" className="acb:text-3xl acb:font-semibold acb:text-ink acb:sm:text-4xl">
              About this app
            </h1>
            <p className="acb:text-sm acb:text-ink-muted">
              This is a retrieval-augmented generation (RAG) app: the bot finds the passages in your documents that match a
              question, then answers from those passages alone and cites them. No account, no login. Every visitor gets a
              workspace of their own that is deleted after 24 hours.
            </p>
          </div>

          <div className="acb:space-y-3">
            <h2 className="acb:text-lg acb:font-semibold acb:text-ink">How an answer is made</h2>
            <ol className="acb:space-y-3">
              {RAG_STEPS.map((step, index) => (
                <li key={step.title} className="acb:text-sm acb:text-ink-muted">
                  <span className="acb:font-semibold acb:text-ink">
                    {index + 1}. {step.title}.
                  </span>{' '}
                  {step.body}
                </li>
              ))}
            </ol>
          </div>

          <div className="acb:space-y-3">
            <h2 className="acb:text-lg acb:font-semibold acb:text-ink">Tech stack</h2>
            <dl className="acb:grid acb:gap-x-6 acb:gap-y-3 acb:text-sm acb:sm:grid-cols-[9rem_1fr]">
              {STACK.map((item) => (
                <div key={item.area} className="acb:contents">
                  <dt className="acb:font-semibold acb:text-ink">{item.area}</dt>
                  <dd className="acb:m-0 acb:text-ink-muted">{item.detail}</dd>
                </div>
              ))}
            </dl>
          </div>

          <p className="acb:text-sm acb:text-ink-muted">
            Open the dashboard whenever you want to upload your own documents and copy the script tag.{' '}
            <a href="/dashboard" className="acb:font-medium acb:text-accent acb:underline acb:underline-offset-4">
              Open the dashboard
            </a>
          </p>
        </section>
      </main>
      <SiteFooter aboutHref="/about" />
    </div>
  );
}
