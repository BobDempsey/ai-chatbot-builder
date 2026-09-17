# Proposal

## Why

The portfolio needs a project that shows a working RAG pipeline, and recruiters evaluating it will not create an account, upload their own documents or read a README to get started. The app has to answer a real question from real documents within a minute of landing, or the evaluation ends before the interesting part.

## What Changes

- Create the repository as a pnpm monorepo: a Hono API on Vercel functions, a React admin dashboard, an embeddable chat widget, and a shared shadcn/ui package the dashboard and widget both consume.
- Add anonymous sessions in place of accounts. The first request mints a session id in an httpOnly cookie and a workspace that belongs to it alone. There is no sign-up, no login screen and no password.
- Seed every new workspace from a read-only template: one bot, a demo document set, prior conversations, ratings and analytics, so no dashboard screen is ever empty on first view.
- Ship three fictional document sets (a SaaS help center, a recipe collection, an employee handbook) and a picker that swaps between them. All three are fictional so that answers must come from retrieval rather than from the model's own knowledge.
- Add document ingestion: PDF upload, pasted Markdown and help-center URLs, chunked and embedded with OpenAI `text-embedding-3-small` into Supabase pgvector, with indexing progress reported to the dashboard.
- Add retrieval and answering: top-k vector search over the session's chunks, answers written by OpenAI `gpt-5.6-luna` and streamed to the client with numbered citations that link to the source section. Below a confidence threshold the bot says it does not know and offers to collect an email address instead.
- Add the admin dashboard: bot name, colors, greeting and tone; a preview chat beside the settings; conversation logs, thumbs ratings, and a list of questions the bot could not answer.
- Add the embeddable widget and the one-line `<script>` tag that mounts it into a shadow root on any third-party page, and a chat-first landing page that runs that widget against the demo bot.
- Add abuse control in place of auth: Vercel Firewall rate-limits and bot-filters at the edge, and the API caps upload size, document count and chat volume per session.
- Add a Vercel cron job that deletes expired session workspaces.

## Capabilities

### New Capabilities

- `anonymous-session`: minting, carrying and expiring a visitor session, and the workspace isolation that every other capability depends on.
- `demo-workspace`: seeding a new workspace from the read-only template, the three fictional document sets, the set picker, and the sweep of expired workspaces.
- `document-ingestion`: accepting PDFs, Markdown and URLs, chunking them, embedding them and reporting indexing progress.
- `retrieval-answering`: vector search over a session's chunks, model-written streamed answers, numbered citations, and the low-confidence handoff to a human.
- `admin-dashboard`: bot settings, the preview chat, conversation logs, ratings, and the unanswered-question list.
- `embeddable-widget`: the hosted script tag, shadow-root mounting, theming from bot settings, and the visitor-facing chat.
- `abuse-limits`: per-session caps on uploads, documents and chat volume, and the edge rules that sit in front of them.

### Modified Capabilities

<!-- None. This is the first change in a new repository. -->

## Impact

- New repository with no existing code to break. No migration path and no backwards compatibility to preserve.
- New external dependencies: Supabase (Postgres with pgvector), the OpenAI API for both embeddings and answers, and Vercel for hosting, cron and firewall rules.
- New secrets, all PLACEHOLDER until set in `.env`: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. One provider key covers embedding and answering.
- Running cost scales with public traffic, which is why the caps and edge rules are in this change rather than a later one.
- Downstream edits outside this repository once it deploys: the portfolio entry in `content/portfolio/`, `resumeProjects` in `app/utils/portfolio-data.ts`, and the GitHub profile README.
