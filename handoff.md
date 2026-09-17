# Handoff: AI Chatbot Builder

Updated 2026-09-17.

## AI Chatbot Builder brief

Build a new portfolio project in its own repo, named `ai-chatbot-builder` (the working folder is `Desktop/ai-chatbot-builder`; git is not initialized yet): a web app where a business uploads its docs and gets an embeddable AI support chatbot that answers from those docs with citations. It will be added to this site's portfolio, so recruiters are the main audience, and a recruiter must be able to try every feature in a few minutes without creating an account.

### Stack

React for the admin dashboard and the chat widget, and Node.js with TypeScript for the API. Styling is shadcn/ui on Radix with Tailwind, for both the dashboard and the widget. Chakra UI v3 was considered and rejected: it is fine for the dashboard, but the widget ships into third-party pages, where Chakra's provider, global reset and Emotion-injected styles cost 35-45KB gzipped and risk style bleed both ways. shadcn is copy-in components over about 10KB of shared deps, and Tailwind can be prefixed and scoped, so the widget renders inside a shadow root and the preview chat reuses the same components as the embedded one. The repo is one pnpm monorepo with `api`, `dashboard` and `widget` workspaces, plus a shared UI package, so the preview chat and the embedded widget render the same components. The API workspace runs Hono on Vercel functions, and the apps run React 19: Radix, react-markdown and lucide-react all support it, and the shadcn CLI emits 19-style components, so the `forwardRef` patching ai-frontend-advisor needs on React 18 does not apply here. Supabase Postgres with pgvector stores document chunks and embeddings, OpenAI `text-embedding-3-small` produces the vectors, and OpenAI `gpt-5.6-luna` writes the answers, the same model the advisor uses, so one `OPENAI_API_KEY` covers both (PLACEHOLDER until set in `.env`). Zod validates input on both sides. Host it on Vercel under a `bobdempsey83.com` subdomain, matching AI Storefront and AI Frontend Advisor. Write a spec first and tests before code, as in the owner's other projects. Spec work goes through OpenSpec: run `openspec init` in this repo and drive every change through an OpenSpec change proposal rather than hand-written spec files.

### What the admin user sees

The user creates a bot by uploading PDFs, pasting help-center URLs or adding Markdown. A progress bar shows the documents being split into chunks and indexed. A preview chat sits beside the settings so the user can test questions right away.

Settings cover the bot's name, colors, greeting and tone. The user copies a one-line `<script>` tag that embeds the widget on any website.

The dashboard shows conversation logs, thumbs-up and thumbs-down ratings, and a list of questions the bot could not answer. That list tells the owner which docs to write next. A newly uploaded doc is used in the bot's next answer.

### What a website visitor sees

A chat bubble sits in the corner of the page. Answers stream in with numbered citations that link to the exact doc section. When retrieval confidence is low, the bot says so and offers a "talk to a human" button that collects an email address.

The landing page is chat-first, copying ai-frontend-advisor's: a headline, a question box and a few starting prompts, with the live widget answering from the demo bot. The dashboard sits behind it rather than being the first thing a visitor meets.

### Recruiter-friendly demo requirements

- There are no accounts and no login at all. The first request mints an anonymous session and a workspace of its own.
- Each session's workspace is seeded from a template: a sample bot, a demo doc set, past conversations, ratings and analytics, so every dashboard screen has data on first view.
- Three demo doc sets ship with the app, and a picker swaps between them. The SaaS help center is the default.
  - A fictional SaaS help center: billing, refunds, password reset. The shape every visitor recognizes, and the product this app is built for.
  - A recipe collection: questions come naturally and the answers are obviously checkable.
  - A fictional employee handbook: PTO, expenses, remote work. Shows the tool in a second market.
- Every set is fictional on purpose. Docs about real products let the model answer from its own training data, and the demo would prove nothing about retrieval. Uploading is still offered, but no visitor has to upload anything to see the bot work.
- Session data is written to Postgres keyed by session id, never to a shared record, and is purged when the session expires. A visitor's edits are invisible to everyone else, and the app reopens seeded and clean. Nothing a visitor uploads is meant to outlive them, but it cannot live in memory either: Vercel functions keep no state between requests, so the rows are ephemeral rather than absent. The session id rides in an httpOnly cookie and the workspace lives 24 hours.
- The landing page runs the live widget on itself, so a visitor can chat with the demo bot before logging in.
- A Vercel cron job sweeps expired session workspaces, so abandoned data does not accumulate. The seed template itself is read-only, so one visitor can never break the demo for the next.
- With no login, abuse control is the whole defense: Vercel Firewall rate-limits and bot-filters at the edge, and the API caps uploads, chat volume and documents per session to control answering and embedding cost.
- Label all seeded content as fictional demo data.

### Done when

The app is deployed, the demo works end to end without an account, the README links the live site and explains the RAG pipeline, and the project is added to this site's portfolio (`content/portfolio/`), `resumeProjects` in `app/utils/portfolio-data.ts`, and the GitHub profile README. Portfolio and resume text must lead with the AI feature, following the AI-first rule in `docs/resume-spec.md`.

### Open decisions

Nothing is blocking. Auth is settled and out of scope: no accounts, no Supabase Auth, no login screen. Anonymous sessions plus Vercel Firewall replace it. Every table is keyed by session id, so plan row-level isolation on that from the first migration rather than retrofitting it.

### Prior art: ai-frontend-advisor

`C:\codei-frontend-advisor` is the owner's other deployed AI project, on the same Vercel account and the same domain. Reviewed on 2026-09-17; what it settles is folded into the change's design and tasks. Read it before building the API or the widget, rather than solving these again.

Worth copying: the thin Vercel Function with its work in `api/_lib/` and the handler taking model, prompt and limiter as arguments, which is why 36 unit tests run in CI with a fake model and no key; the mapping of every provider failure to one plain sentence for the reader; server-side caps on message length, history turns and body size, with the body checked before it is parsed; the lazy chat loader, a 2.4 KB entry that pulls a 124 KB gzipped island on first hover, focus or click; the `advisor:eval` harness that asks the live model fixed questions and fails a reply quoting a figure absent from its grounding; and the `localStorage` quota hint that tells a reader what is left, since the firewall reports nothing.

Deliberately not copied: its `isSameOrigin` check, which refuses any request whose Origin does not match the host. That is right for a chat that only runs on its own site and wrong here, because the widget is embedded on other people's pages. The chat route authorizes by public bot id across origins; every dashboard route stays same-origin and cookie-bound. The advisor also does not stream, returning `{ reply }` as one body, so streaming is new work.

Toolchain to match: pnpm 10.15.1, Node 22 in CI, Biome rather than ESLint and Prettier, Vitest, LF newlines enforced by `.gitattributes`.

Gotchas already paid for there: `trailingSlash: true` means posting to `/api/chat/` or taking a 308; files a function reads at runtime must be listed under `includeFiles` in `vercel.json` and are read from `process.cwd()`; the shadcn CLI writes React 19 components where `ref` is a plain prop, so on React 18 anything needing a ref must be wrapped in `forwardRef` or focus management breaks; `react-markdown` needs `remark-gfm` for tables and `skipHtml` for safety, and a table belongs in a focusable scrollable region or axe fails it; firewall rules live in the Vercel dashboard, not in the repo; and moving the repo folder needs `CI=1 pnpm install --frozen-lockfile`.

### Building in parallel

`docs/parallel-slices.md` records how work is split between agents: vertical slices cut along the spec's capability boundaries, each agent in its own git worktree, with the scaffold, schema, sessions, seeding and the shared UI and schema packages landed on `main` as phase 0 first. It also names the three candidate slices and the traps the advisor build hit, including two worktrees competing for one dev port.
