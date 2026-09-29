# Design

## Context

Greenfield repository, no existing code. See proposal.md for motivation. The constraints that shape everything below are in handoff.md: it deploys to a Vercel subdomain, it is evaluated by recruiters rather than operated by customers, and it carries a public API cost with no login in front of it.

Two consequences drive the design. Vercel functions keep no state between requests, so "nothing is saved" cannot mean "held in memory"; and the widget executes on pages this project does not control, so it cannot assume anything about the CSS or JavaScript already there.

## Goals / Non-Goals

**Goals:**

- One retrieval path serving the preview chat and the embedded widget, so what the owner tests is what a visitor gets.
- Session isolation enforced in the database, not in application code that a missing `where` clause can bypass.
- A widget bundle small enough and isolated enough to drop onto an arbitrary page.
- Cost bounded per session, since the app is open to the internet.

**Non-Goals:**

- Multi-tenancy, teams, roles or billing. There are no accounts, so there is nothing to scope beyond a session.
- Durable customer data. Every workspace is expected to die within a day.
- Model or provider abstraction. One provider answers and embeds: OpenAI, `gpt-5.6-luna` for answers and `text-embedding-3-small` for vectors, matching ai-frontend-advisor. Swapping either is a later change.
- Horizontal scale. Portfolio traffic, not production traffic.

## Decisions

**Ephemeral rows in Postgres rather than no database.** The alternatives were an in-memory store and a KV store with a TTL. In-memory fails outright on serverless functions, which do not share a process between requests. A KV store with TTL would work and would expire rows for free, but it removes pgvector from the project, and demonstrating vector search in Postgres is a large part of why this project exists. Session rows are therefore ordinary rows with a `session_id` and an `expires_at`, deleted by a sweep. Temporary data, not absent data.

**Isolation through row-level security keyed by session, from the first migration.** Every table carries `session_id` and a policy that compares it to a claim on the request. Doing this in application code would work until one query forgets the predicate, and the failure mode is showing one visitor another's documents. Retrofitting RLS after the schema exists is worse than starting with it.

**Session id in an httpOnly cookie, workspace seeded on first request.** A client-generated id would let a visitor read another workspace by guessing or editing it, so the server mints it. httpOnly keeps it away from page scripts, and the widget on a third-party page uses the bot's public id rather than the cookie, since the cookie will not be sent cross-site.

**Seeding by copying the template, not by referencing it.** Each new session gets its own copy of the template's documents, chunks, embeddings, conversations and ratings. Sharing rows would mean a visitor editing a document mutates what everyone else sees, and copy-on-write adds branching to every read. The copy costs storage for a day and buys a single, uniform code path: everything a session reads belongs to that session. The embeddings are copied rather than recomputed, so seeding costs nothing at the embeddings API.

**Chunking with heading context preserved.** Chunks are split on document structure with overlap, and each stores its document, its ordinal position and its nearest heading. Citations need a section to link to, so the heading is part of the chunk record rather than something reconstructed at answer time.

**Ingestion runs as a background job with polled status, not inside the upload request.** Embedding a PDF exceeds a comfortable request budget on serverless. The upload request stores the document as `queued` and returns; a worker route processes it and advances the state. The dashboard polls that state, which is also what makes the progress bar honest rather than animated.

**Retrieval scored by cosine distance with a relevance floor.** Top-k over the session's ready chunks, and if the best match sits below the floor the system does not call the answering model at all: it returns the "I cannot answer that" path. This is both the honest answer and the cheaper one. The floor is a tunable constant, and it wants calibrating against the three seeded document sets rather than guessing once.

**Answers streamed from the API, citations resolved server-side.** The model is asked to cite retrieved chunks by index, and the API maps those indices to document and section before they reach the client. Letting the model emit URLs invites fabricated ones; mapping from the retrieval set means a citation cannot point at something that was not retrieved.

**React 19 and a chat-first landing page.** Radix, react-markdown and lucide-react all support 19, and the shadcn CLI emits 19-style components, so none of the advisor's `forwardRef` patching is needed. The landing page copies the advisor's shape: a headline, a question box and starting prompts, with the live widget answering from the demo bot. A visitor gets a cited answer before meeting the dashboard, which is the whole point of the demo.

**Widget in a shadow root with its own bundle.** Tailwind is prefixed and its styles are injected into the shadow root, so nothing leaks either direction. The widget builds as a standalone IIFE and shares components with the dashboard through the UI package, which is why shadcn was chosen over Chakra: copy-in components with no provider or global reset can live inside a shadow root without dragging a runtime along.

**Two request classes with different origin rules.** Dashboard endpoints are same-origin and carry the session cookie. The widget chat endpoint is cross-origin by nature and carries a public bot id instead, which grants asking questions and nothing else: no settings, no uploads, no logs. Splitting them this way means the permissive surface is one route with one capability, rather than a cookie policy loosened everywhere.

**Two layers of abuse control.** Vercel Firewall rate-limits at the edge, which is cheap and keeps floods off the functions entirely. Per-session caps live in the API, because the edge cannot see that a session already holds ten documents. Edge rules alone would not bound a patient attacker; API caps alone would still pay for the requests.

## Prior art: ai-frontend-advisor

`C:\code\ai-frontend-advisor` is the owner's deployed chat project on the same host and the same account. It is worth copying from, and worth knowing where it does not fit.

**Copy the function shape.** Its `api/chat.ts` is a thin Vercel Function; the work lives in `api/_lib/` with the handler taking its model, prompt and rate limiter as arguments. That one decision is why it has 36 unit tests that run in CI with a fake model and no API key. The answer endpoint here takes the same shape: retrieval, prompt building and the model client injected, so the request path is testable without spending tokens.

**Copy the failure vocabulary.** Every provider failure there is mapped to one plain sentence for the reader: too long, busy, not configured, unreachable. No status codes reach the UI. That is now a requirement in `retrieval-answering`.

**Copy the server-side caps.** Message length, per-turn history length, turn count and a body-size check that runs before `JSON.parse`. The client is treated as a suggestion. Also now a requirement.

**Copy the lazy chat loader.** Its pages ship a 2.4 KB entry and download the 124 KB gzipped chat island on first hover, focus or click, with a failed download leaving the button retryable. The embed script needs exactly this, since it lands on pages that are not ours.

**Copy the eval harness.** `pnpm advisor:eval` asks the live model a fixed set of questions and fails a reply that quotes a figure absent from the grounding or breaks a stated rule. The same technique is how "cites only retrieved chunks" and "declines when coverage is missing" get checked here, against the three seeded corpora.

**Copy the client-side quota hint.** The edge rule does not report what is left, so the advisor counts questions in `localStorage` over the same window and treats a 429 as spent. It is a hint that keeps the visitor informed, not the limit.

**Do not copy the same-origin check.** Its `isSameOrigin` refuses any request whose `Origin` does not match the host, which is correct for a chat that only ever runs on its own site. The widget here is embedded on other people's pages by design, so the chat endpoint is cross-origin and authorizes by public bot id instead. The dashboard endpoints keep the session cookie and stay same-origin.

**It does not stream.** The advisor returns `{ reply }` as one JSON body. The specs here require streamed answers, so that part is new work rather than a port.

**Toolchain to match.** pnpm 10.15.1, Node 22 in CI, Biome rather than ESLint and Prettier, Vitest, LF newlines enforced by `.gitattributes`. Matching the sibling repo costs nothing and makes both easier to work in.

**Gotchas already paid for there.** `trailingSlash: true` means the client must post to `/api/chat/` or take a 308. Files a function reads at runtime must be listed in `vercel.json` under `includeFiles`, and are read from `process.cwd()`. The shadcn CLI emits React 19 components where `ref` is a plain prop, so on React 18 anything needing a ref must be wrapped in `forwardRef` or focus management breaks. `react-markdown` needs `remark-gfm` for tables and `skipHtml` to refuse raw HTML, and a table belongs in a focusable scrollable region or axe fails it. Firewall rules live in the Vercel dashboard, not in the repo. Moving the repo folder requires `CI=1 pnpm install --frozen-lockfile`.

## Risks / Trade-offs

- Copying every template document per session multiplies storage by the number of live sessions → the sweep runs daily, the caps bound document count, and a demo corpus is measured in kilobytes.
- A cron sweep leaves expired data sitting until the job runs → `expires_at` is also enforced on read, so an expired workspace is unreachable before it is deleted.
- Public, unauthenticated API keys behind the demo are the main cost exposure → edge rate limits, per-session caps, and the cheap embedding model; if it is still abused, the caps tighten before the demo closes.
- Polling for indexing status is more requests than streaming would be → the poll is short-lived and stops when the document reaches a terminal state.
- Shadow DOM breaks anything relying on global CSS or portals to `document.body` → the widget uses no portals, and its components are checked inside the shadow root rather than only in the dashboard.
- The relevance floor is a guess until it is measured → calibrate it against seeded questions that should and should not be answerable, and treat those as tests.
- One change covering the whole MVP is large → tasks are ordered so the pipeline works end to end on the seeded corpus early, and the widget, analytics and polish follow.

## Migration Plan

No migration. New repository, no users, no data to preserve. Deployment is the first push to the Vercel project, with `OPENAI_API_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set as Sensitive environment variables and the database migrations applied before the first request. Rollback is redeploying the previous build; since no data outlives a day, there is nothing to restore.

## Open Questions

- The exact relevance floor, and the chunk size and overlap. All three are constants to tune against the seeded corpora during implementation; none changes the specs or the task breakdown.
- Whether the sweep also needs an on-read delete for sessions that expire between runs, or whether unreachability is enough.
