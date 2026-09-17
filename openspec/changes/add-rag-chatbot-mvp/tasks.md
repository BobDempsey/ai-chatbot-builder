# Tasks

## 1. Repository and toolchain

- [ ] 1.1 Create the pnpm workspace with `apps/api`, `apps/dashboard`, `apps/widget` and `packages/ui`, and verify `pnpm install` succeeds and `pnpm -r build` runs in every workspace
- [ ] 1.2 Add TypeScript, Biome and Vitest at the root with shared configs, matching ai-frontend-advisor's toolchain, and verify `pnpm lint`, `pnpm format:check` and `pnpm -r test` pass on empty suites
- [ ] 1.3 Add Zod and a shared `packages/schemas` workspace for request and response types, and verify the API and dashboard both import one schema and typecheck
- [ ] 1.4 Add `.env.example` naming `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and verify the API refuses to boot with a clear message when one is missing
- [ ] 1.5 Add `.gitattributes` enforcing LF and a CI workflow on Node 22 running typecheck, lint, unit tests and a build, and verify it passes on the empty scaffold

## 2. Design system

- [ ] 2.1 Set up Tailwind in `packages/ui` with a class prefix and no global preflight leak, and verify a built stylesheet contains only prefixed classes
- [ ] 2.2 Install the shadcn components the dashboard and widget share (button, input, card, dialog, badge, scroll area) into `packages/ui`, and verify both apps render one shared component
- [ ] 2.3 Wrap every shared component that takes a ref in `forwardRef` if the apps run React 18, and verify focus moves into a dialog and returns to its trigger
- [ ] 2.4 Render answers with `react-markdown` plus `remark-gfm` and `skipHtml`, tables inside a focusable scrollable region, and verify a wide table scrolls on its own and axe reports no violations
- [ ] 2.5 Add a theme layer that takes bot name, colors and greeting as props, and verify a component renders with two different themes in a unit test

## 3. Database and isolation

- [ ] 3.1 Create the Supabase project and enable pgvector, and verify `select * from pg_extension` lists `vector`
- [ ] 3.2 Write the first migration: `sessions`, `bots`, `documents`, `chunks` with a vector column, `conversations`, `messages`, `ratings`, `unanswered_questions`, each carrying `session_id`, and verify the migration applies to a clean database
- [ ] 3.3 Add row-level security policies keyed on the session claim for every table, and verify a query made under session A returns nothing belonging to session B
- [ ] 3.4 Add the vector index and a retrieval query function, and verify a seeded query returns chunks ordered by distance

## 4. Sessions

- [ ] 4.1 Implement session minting in the Hono API with an httpOnly, Secure, SameSite=Lax cookie and a 24-hour expiry, and verify a first request sets the cookie and a second reuses it
- [ ] 4.2 Add middleware that resolves the session and sets the database claim on every request, and verify a request with no cookie mints one and a request with an expired cookie starts fresh
- [ ] 4.3 Add an integration test proving cross-session access returns 404 for documents, bots, conversations and ratings

## 5. Demo content and seeding

- [ ] 5.1 Write the three fictional doc sets (SaaS help center, recipe collection, employee handbook) as source Markdown labelled demo data, and verify each set covers the questions listed in its own fixture file
- [ ] 5.2 Build the template loader that indexes each set once into read-only template rows, and verify re-running it is idempotent
- [ ] 5.3 Implement seeding a new session by copying template documents, chunks, embeddings, conversations and ratings, and verify a brand-new session can answer a seeded question with no uploads
- [ ] 5.4 Add the doc-set picker endpoint and UI, and verify switching sets replaces the workspace's documents and changes the bot's answers
- [ ] 5.5 Verify template immutability: deleting seeded documents in one session leaves the next new session fully seeded

## 6. Ingestion

- [ ] 6.1 Implement PDF text extraction behind an upload endpoint with the size cap, and verify a sample PDF yields text and an oversized file is rejected with the limit named
- [ ] 6.2 Implement the Markdown and URL sources, and verify a pasted document indexes and an unfetchable URL is rejected without creating a partial document
- [ ] 6.3 Implement chunking that keeps document, ordinal and nearest heading, and verify chunk boundaries and heading capture in unit tests
- [ ] 6.4 Implement embedding with OpenAI `text-embedding-3-small` and store vectors, and verify a document reaches `ready` with a chunk count matching the chunker
- [ ] 6.5 Make ingestion a background job with `queued`, `extracting`, `embedding`, `ready` and `failed` states, and verify a mid-run embedding failure marks the document failed with no chunks left for retrieval
- [ ] 6.6 Add the dashboard progress view polling that state, and verify an upload advances to ready without a page reload

## 7. Retrieval and answering

- [ ] 7.0 Shape the answer route as a thin handler with retrieval, prompt building and the model client injected, as ai-frontend-advisor's `api/_lib/handler.ts` does, and verify the whole request path is unit-testable with a fake model and no API key
- [ ] 7.1 Implement top-k retrieval over the session's ready chunks with a relevance floor, and verify chunks from other sessions and unfinished documents are never returned
- [ ] 7.2 Implement the Claude answer call constrained to the retrieved text, streamed to the client, and verify text arrives before the answer completes
- [ ] 7.3 Map model citation indices to document and section server-side, and verify every rendered citation resolves to a retrieved chunk and no citation can be fabricated
- [ ] 7.4 Implement the low-confidence path: no model call, a stated inability to answer, and the human-handoff email capture, and verify a malformed email is rejected and records nothing
- [ ] 7.5 Record conversations, messages, citations, ratings and unanswered questions, and verify a declined question appears in the unanswered list
- [ ] 7.6 Cap message length, history turns, per-turn length and body size on the server, refusing an oversized body before parsing it, and verify no paid call is made on a refusal
- [ ] 7.7 Map every provider failure (timeout, rate limit, empty reply, missing key) to one plain sentence, and verify a failure sentence is never replayed to the model as history
- [ ] 7.8 Calibrate chunk size, overlap and the relevance floor against the three seeded corpora, and verify a fixture of should-answer and should-decline questions passes
- [ ] 7.9 Build an eval script modelled on `pnpm advisor:eval` that asks the live model a fixed question set per corpus, and verify it fails a reply that cites an unretrieved chunk, invents a figure, or answers a question the corpus does not cover

## 8. Dashboard

- [ ] 8.1 Build the settings screen for name, colors, greeting and tone with Zod validation, and verify an invalid color is rejected and previous values survive
- [ ] 8.2 Build the preview chat beside the settings against the session's own bot, and verify a settings change and a newly indexed document both reflect without a reload
- [ ] 8.3 Build the conversation log with citations, and verify an exchange opens and shows its sources
- [ ] 8.4 Build the ratings summary and thumbs controls, and verify a rating persists and appears in the summary
- [ ] 8.5 Build the unanswered-question list, and verify declined questions land there with their captured emails

## 9. Widget

- [ ] 9.1 Build the widget as a standalone bundle that mounts into a shadow root, and verify it renders on a test page with hostile global styles applied
- [ ] 9.1a Split the embed into a tiny entry script plus a lazily imported chat bundle that downloads on first hover, focus or click, and verify a page nobody interacts with never requests the chat bundle and a failed download leaves the bubble retryable
- [ ] 9.2 Verify the host page is unchanged: no global styles introduced and no host element restyled
- [ ] 9.3 Implement the widget chat against the public bot id, streaming with citations and the human handoff, and verify its answers match the preview chat for the same question
- [ ] 9.3a Authorize the chat route by public bot id across origins while keeping every dashboard route same-origin and cookie-bound, and verify a bot id alone cannot read logs, change settings or upload
- [ ] 9.3b Keep the widget conversation in `sessionStorage` with every access guarded, and verify it survives a reload and degrades to memory when storage throws
- [ ] 9.3c Run an automated accessibility check on the open widget with an answer, citations and a table on screen, and verify keyboard open, focus trap, Escape close and focus return
- [ ] 9.4 Generate the one-line script tag in the dashboard carrying the bot id, and verify pasting it into a blank page produces a working chat
- [ ] 9.5 Embed the widget on the product's own landing page, and verify a visitor can chat before opening the dashboard

## 10. Limits and cleanup

- [ ] 10.1 Enforce per-session caps on upload size, document count and questions per window, and verify each refusal names its limit and skips the paid API call
- [ ] 10.2 Configure Vercel Firewall rate limits and bot filtering on the chat, upload and URL-fetch routes, record the rule in the handoff since it lives in the dashboard not the repo, and verify a burst is rejected at the edge while human-paced use is not
- [ ] 10.2a Show the remaining question count in the chat once part of the allowance is used, counted client-side over the same window and marked spent on a 429, and verify sending is disabled at zero
- [ ] 10.3 Implement the daily sweep as a Vercel cron route deleting expired workspaces, and verify expired data is gone and live sessions are untouched
- [ ] 10.4 Enforce expiry on read as well, and verify an expired session is unreachable before the sweep runs

## 11. Ship

- [ ] 11.1 Deploy to the Vercel subdomain with migrations applied and env vars set as Sensitive, list any runtime-read file under `includeFiles`, and verify the deployed app answers a seeded question end to end
- [ ] 11.1a Confirm the client posts to the trailing-slash path if `trailingSlash` is on, and verify no request takes a 308 before reaching the function
- [ ] 11.2 Run the full flow on the deployed site as a first-time visitor with no account, and verify seeding, upload, answer with citations, rating and the widget all work
- [ ] 11.3 Write the README linking the live site and explaining the RAG pipeline, and verify a reader can follow it from upload to citation
- [ ] 11.4 Add the project to `content/portfolio/`, `resumeProjects` in `app/utils/portfolio-data.ts`, and the GitHub profile README, leading with the AI feature per `docs/resume-spec.md`
