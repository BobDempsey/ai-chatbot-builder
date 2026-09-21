# Tasks

Ordered as `docs/parallel-slices.md` describes: phase 0 lands on `main` first, then three slices run in parallel, each agent in its own worktree, then integration and ship happen back on `main`. Nothing in a slice may edit a file another slice owns; anything two slices need belongs in phase 0.

## 1. Phase 0: scaffold and toolchain (on `main`, nobody else starts until this lands)

- [x] 1.1 Create the pnpm workspace with `apps/api`, `apps/dashboard`, `apps/widget`, `apps/landing`, `packages/ui` and `packages/schemas`, and verify `pnpm install` succeeds and `pnpm -r build` runs in every workspace
- [x] 1.2 Add TypeScript, Biome and Vitest at the root with shared configs, matching ai-frontend-advisor's toolchain, and verify `pnpm lint`, `pnpm format:check` and `pnpm -r test` pass on empty suites
- [x] 1.3 Pin React 19 across the apps and verify a shadcn dialog moves focus in and returns it to its trigger with no `forwardRef` patching
- [x] 1.4 Add `.env.example` naming `OPENAI_API_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and verify the API refuses to boot with a clear message when one is missing
- [x] 1.5 Add `.gitattributes` enforcing LF and a CI workflow on Node 22 running typecheck, lint, unit tests and a build, and verify it passes on the empty scaffold
- [x] 1.6 Assign each slice its dev and check ports in `docs/parallel-slices.md`, and verify three dev servers run at once without a port collision

## 2. Phase 0: shared contracts (on `main`, frozen once the slices start)

- [x] 2.1 Define every request and response shape in `packages/schemas` with Zod: chat, upload, document status, settings, ratings, handoff, and verify the API and both front ends import them and typecheck
- [x] 2.2 Set up Tailwind in `packages/ui` with a class prefix and no global preflight leak, and verify a built stylesheet contains only prefixed classes
- [x] 2.3 Install the shadcn components the dashboard and widget share (button, input, card, dialog, badge, scroll area) into `packages/ui`, and verify both apps render one shared component
- [x] 2.4 Build the shared answer renderer in `packages/ui`: `react-markdown` with `remark-gfm` and `skipHtml`, citations, tables in a focusable scrollable region, and verify a wide table scrolls on its own and axe reports no violations
- [x] 2.5 Add a theme layer that takes bot name, colors and greeting as props, and verify a component renders with two different themes in a unit test
- [x] 2.6 Ship a fake answer route that satisfies the schemas and streams canned replies with citations, so slices B and C build without slice A, and verify both front ends run against it with no database

## 3. Phase 0: database, sessions and workspaces (on `main`)

- [x] 3.1 Create the Supabase project and enable pgvector, and verify `select * from pg_extension` lists `vector`
- [x] 3.2 Write the first migration: `sessions`, `bots`, `documents`, `chunks` with a vector column, `conversations`, `messages`, `ratings`, `unanswered_questions`, each carrying `session_id`, and verify the migration applies to a clean database
- [x] 3.3 Add row-level security policies keyed on the session claim for every table, and verify a query made under session A returns nothing belonging to session B
- [x] 3.4 Add the vector index and a retrieval query function, and verify a seeded query returns chunks ordered by distance
- [x] 3.5 Implement session minting in the Hono API with an httpOnly, Secure, SameSite=Lax cookie and a 24-hour expiry, and verify a first request sets the cookie and a second reuses it
- [x] 3.6 Add middleware that resolves the session and sets the database claim on every request, and verify a request with no cookie mints one and a request with an expired cookie starts fresh
- [x] 3.7 Add an integration test proving cross-session access returns 404 for documents, bots, conversations and ratings
- [x] 3.8 Confirm only slice A queries a database, so the project is used directly and no per-slice branch is bought; slices B and C run against the phase 0 fake

## 4. Slice A: ingestion, retrieval and answering

Owns `apps/api` (except the session middleware from phase 0), the demo corpora and the eval script. Does not touch `apps/dashboard`, `apps/widget` or `apps/landing`.

- [x] 4.1 Implement PDF text extraction behind an upload endpoint with the size cap, and verify a sample PDF yields text and an oversized file is rejected with the limit named
- [x] 4.2 Implement the Markdown and URL sources, and verify a pasted document indexes and an unfetchable URL is rejected without creating a partial document
- [x] 4.3 Implement chunking that keeps document, ordinal and nearest heading, and verify chunk boundaries and heading capture in unit tests
- [x] 4.4 Implement embedding with OpenAI `text-embedding-3-small` and store vectors, and verify a document reaches `ready` with a chunk count matching the chunker
- [x] 4.5 Make ingestion a background job with `queued`, `extracting`, `embedding`, `ready` and `failed` states behind a status endpoint, and verify a mid-run embedding failure marks the document failed with no chunks left for retrieval
- [x] 4.6 Write the three fictional doc sets (SaaS help center, recipe collection, employee handbook) as source Markdown labelled demo data, and verify each set covers the questions listed in its own fixture file
- [x] 4.7 Build the template loader that indexes each set once into read-only template rows, and verify re-running it is idempotent
- [x] 4.8 Implement seeding a new session by copying template documents, chunks, embeddings, conversations and ratings, and verify a brand-new session can answer a seeded question with no uploads
- [x] 4.9 Add the doc-set picker endpoint, and verify switching sets replaces the workspace's documents and changes the bot's answers
- [x] 4.10 Verify template immutability: deleting seeded documents in one session leaves the next new session fully seeded
- [x] 4.11 Shape the answer route as a thin handler with retrieval, prompt building and the model client injected, as ai-frontend-advisor's `api/_lib/handler.ts` does, and verify the whole request path is unit-testable with a fake model and no API key
- [x] 4.12 Implement top-k retrieval over the session's ready chunks with a relevance floor, and verify chunks from other sessions and unfinished documents are never returned
- [x] 4.13 Implement the `gpt-5.6-luna` answer call constrained to the retrieved text, streamed to the client, and verify text arrives before the answer completes
- [x] 4.14 Map model citation indices to document and section server-side, and verify every rendered citation resolves to a retrieved chunk and no citation can be fabricated
- [x] 4.15 Implement the low-confidence path: no model call, a stated inability to answer, and the human-handoff email capture, and verify a malformed email is rejected and records nothing
- [x] 4.16 Record conversations, messages, citations, ratings and unanswered questions, and verify a declined question appears in the unanswered list
- [x] 4.17 Cap message length, history turns, per-turn length and body size on the server, refusing an oversized body before parsing it, and verify no paid call is made on a refusal
- [x] 4.18 Map every provider failure (timeout, rate limit, empty reply, missing key) to one plain sentence, and verify a failure sentence is never replayed to the model as history
- [x] 4.19 Authorize the chat route by public bot id across origins while keeping every other route same-origin and cookie-bound, and verify a bot id alone cannot read logs, change settings or upload
- [x] 4.20 Enforce per-session caps on upload size, document count and questions per window, and verify each refusal names its limit and skips the paid API call
- [x] 4.21 Calibrate chunk size, overlap and the relevance floor against the three seeded corpora, and verify a fixture of should-answer and should-decline questions passes
- [x] 4.22 Build an eval script modelled on `pnpm advisor:eval` that asks the live model a fixed question set per corpus, and verify it fails a reply that cites an unretrieved chunk, invents a figure, or answers a question the corpus does not cover

## 5. Slice B: admin dashboard

Owns `apps/dashboard`. Builds against the phase 0 fake route until slice A merges. Does not touch `apps/api`, `apps/widget` or `apps/landing`.

- [x] 5.1 Build the settings screen for name, colors, greeting and tone with Zod validation, and verify an invalid color is rejected and previous values survive
- [x] 5.2 Build the preview chat beside the settings using the shared answer renderer, and verify a settings change and a newly indexed document both reflect without a reload
- [x] 5.3 Build the upload and doc-set picker UI with the indexing progress view polling the status endpoint, and verify an upload advances to ready without a page reload
- [x] 5.4 Build the conversation log with citations, and verify an exchange opens and shows its sources
- [x] 5.5 Build the ratings summary and thumbs controls, and verify a rating persists and appears in the summary
- [x] 5.6 Build the unanswered-question list, and verify declined questions land there with their captured emails
- [x] 5.7 Show the copyable one-line script tag carrying the bot id, and verify the copied text matches what the widget slice expects
- [x] 5.8 Run an accessibility check over every dashboard screen, and verify axe reports no violations at 1440 and 375

## 6. Slice C: widget and landing page

Owns `apps/widget` and `apps/landing`. Builds against the phase 0 fake route until slice A merges. Does not touch `apps/api` or `apps/dashboard`.

- [x] 6.1 Build the widget as a standalone bundle that mounts into a shadow root, and verify it renders on a test page with hostile global styles applied
- [x] 6.2 Verify the host page is unchanged: no global styles introduced and no host element restyled
- [x] 6.3 Split the embed into a tiny entry script plus a lazily imported chat bundle that downloads on first hover, focus or click, and verify a page nobody interacts with never requests the chat bundle and a failed download leaves the bubble retryable
- [x] 6.4 Implement the widget chat against the public bot id using the shared answer renderer, streaming with citations and the human handoff, and verify its answers match the preview chat for the same question
- [x] 6.5 Keep the widget conversation in `sessionStorage` with every access guarded, and verify it survives a reload and degrades to memory when storage throws
- [x] 6.6 Show the remaining question count once part of the allowance is used, counted client-side over the same window and marked spent on a 429, and verify sending is disabled at zero
- [x] 6.7 Run an automated accessibility check on the open widget with an answer, citations and a table on screen, and verify keyboard open, focus trap, Escape close and focus return
- [x] 6.8 Build the chat-first landing page (headline, question box, starting prompts) modelled on ai-frontend-advisor's, and verify a prompt opens the chat with that question already sent
- [x] 6.9 Embed the widget on that landing page against the demo bot, and verify a visitor gets a cited answer before opening the dashboard

## 7. Integration (back on `main`, one slice merged at a time)

- [x] 7.1 Merge slice A, then B, then C, keeping both sides of any shared check file rather than picking one, and verify the full suite passes after each merge
- [x] 7.2 Point the dashboard and widget at the real answer route and delete the phase 0 fake, and verify no front end still imports it
- [x] 7.3 Verify the preview chat and the embedded widget return the same answer and citations for the same question against the same bot
- [x] 7.4 Paste the generated script tag into a blank page and verify it produces a working chat end to end

## 8. Limits and cleanup (on `main`)

- [ ] 8.1 Configure Vercel Firewall rate limits and bot filtering on the chat, upload and URL-fetch routes, record the rule in the handoff since it lives in the dashboard not the repo, and verify a burst is rejected at the edge while human-paced use is not
- [x] 8.2 Implement the daily sweep as a Vercel cron route deleting expired workspaces, and verify expired data is gone and live sessions are untouched
- [x] 8.3 Enforce expiry on read as well, and verify an expired session is unreachable before the sweep runs
- [x] 8.4 Label every seeded document and the set picker as fictional demo data, and verify the label appears on each corpus

## 9. Ship

- [ ] 9.1 Deploy to the Vercel subdomain with migrations applied and `OPENAI_API_KEY` plus the Supabase keys set as Sensitive, list any runtime-read file under `includeFiles`, and verify the deployed app answers a seeded question end to end
- [ ] 9.2 Confirm the client posts to the trailing-slash path if `trailingSlash` is on, and verify no request takes a 308 before reaching the function
- [ ] 9.3 Run the full flow on the deployed site as a first-time visitor with no account, and verify seeding, upload, answer with citations, rating and the widget all work
- [ ] 9.4 Write the README linking the live site and explaining the RAG pipeline, and verify a reader can follow it from upload to citation
- [ ] 9.5 Add the project to `content/portfolio/`, `resumeProjects` in `app/utils/portfolio-data.ts`, and the GitHub profile README, leading with the AI feature per `docs/resume-spec.md`
