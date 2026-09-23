# Handoff: AI Chatbot Builder

Updated 2026-09-23. Earlier revisions: 2026-09-21, 2026-09-17.

## AI Chatbot Builder brief

Build a new portfolio project in its own repo, named `ai-chatbot-builder` (the working folder is `Desktop/ai-chatbot-builder`; the git repo is initialized and its branch is `master`, not `main`): a web app where a business uploads its docs and gets an embeddable AI support chatbot that answers from those docs with citations. It will be added to this site's portfolio, so recruiters are the main audience, and a recruiter must be able to try every feature in a few minutes without creating an account.

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

`docs/parallel-slices.md` records how work is split between agents: vertical slices cut along the spec's capability boundaries, each agent in its own git worktree, with the foundations landed on the default branch as phase 0 first. It also names the traps the advisor build hit, including two worktrees competing for one dev port.

The change's task list is now ordered that way. Phase 0 is three groups on the default branch, `master` here: the monorepo and toolchain, the shared contracts (Zod schemas, the `packages/ui` components and answer renderer, and a fake answer route that streams canned replies), and the database with RLS, session middleware and a Supabase branch per slice. Then three slices run in parallel:

- Slice A owns `apps/api`, the demo corpora and the eval: ingestion, seeding, retrieval, answers, citations and the caps.
- Slice B owns `apps/dashboard`.
- Slice C owns `apps/widget` and `apps/landing`.

B and C build against the phase 0 fake route, so neither waits on A. Integration merges A, then B, then C on `master`, deletes the fake, and checks that the preview chat and the embedded widget answer identically. The rule that makes this work: a slice never writes a file another slice owns, and anything two slices need is phase 0 work.

### Supabase project

`ai-chatbot-builder`, ref `qyxkspdsgllklsibgyvb`, us-east-2, in BobDempsey's org. Created 2026-09-17 at no monthly cost. The free tier allows two active projects and both slots were full, so `forged in filament` was paused to make room; it restores from the dashboard whenever it is wanted back.

Six migrations are applied and kept in `supabase/migrations/`, so the schema is reproducible from the repo rather than only from the dashboard. They create pgvector, the eight session-keyed tables, row-level security, the HNSW index and `match_chunks`, pin the search path on the two policy helpers after the Supabase linter flagged them, and add the demo corpus template tables.

Isolation was checked against real rows rather than assumed: under the `anon` role, session A saw its own two documents and none of session B's, `match_chunks` returned only A's ready chunks in distance order and skipped a document still indexing, a query with no `request.acb_session` claim saw nothing at all, and an expired session became unreachable before any sweep ran. Probe rows were deleted afterwards. The security advisor reports no findings.

Branching costs $0.01344 an hour per branch, so the plan's per-slice database copies were dropped: only slice A queries a database, and slices B and C run against the phase 0 fake route. Slice A uses the project directly, and takes a local stack with `supabase start` if it needs to wipe and reseed often.

### The live stack, verified 2026-09-17

`.env` holds `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL`, all SET, all gitignored. `pnpm dev:api` reads them and degrades rather than refusing to start: without a key it uses fake clients and a looser floor, without a database URL it uses an in-memory workspace. With both it is the deployment, running locally.

The API talks to Postgres directly rather than through PostgREST, because a policy needs `request.acb_session` set inside the transaction and the service role key would bypass the policies entirely. `pnpm --filter @acb/api templates:load` indexed the three corpora into the template rows: 9 documents, 51 chunks, real vectors.

Two things only showed up once it ran against the real project. Sessions existed only in memory, so seeding a workspace inserted a bot whose session row did not exist, and every policy calls `session_is_live`, so the insert was refused by its own RETURNING read. `PostgresSessionStore` fixes that: the row comes first, then the seed. And the relevance floor cannot separate a source about the right subject from one that holds the answer: "what wine goes with fish pie" retrieves the fish pie chunk at 0.51 because it is about fish pie. The model catches that instead, replying with `NO_ANSWER`, which the route turns into the decline and the offer of a human. Nothing streams to the reader until that token is ruled out.

The floor is now measured rather than guessed: answerable questions land between 0.35 and 0.51, off-subject ones at 0.66 and above, so 0.62 sits between them.

`pnpm --filter @acb/api eval` asks all 31 fixture questions against the live model and currently passes every one. It spends credit, so run it by hand, never in CI.

~~The fake route itself is gone, but two files still name it: `apps/landing/vite.config.ts` proxies `/api` to port 5180 in development, and a comment in `apps/landing/src/app.tsx` says the bot id is the one the fake answers for.~~ **Fixed 2026-09-21.** The proxy was already right, because the real API took over the fake's port. The bot id was not: the landing page opened the widget on the fake's hardcoded id and every question came back "That chatbot could not be found." The page now fetches `/api/bot` on mount and re-creates the widget on the `publicId` that call returns, since each session is seeded with a bot of its own and no id can be compiled in. A question typed before that call lands is re-sent afterwards rather than dropped. `DEMO_BOT_ID` survives as the placeholder the widget mounts on first paint and the id the tests assert against.

~~Outstanding work is task 8.1 and 9.1 to 9.5 in `openspec/changes/add-rag-chatbot-mvp/tasks.md`: the Vercel Firewall rules, the cron expiry sweep, expiry enforced on read, the fictional-data labels, then the deploy, the README and the portfolio entry.~~ **Updated 2026-09-23.** Only task 8.1, the Vercel Firewall rules, and task 9.5, the portfolio entry, are still open in `openspec/changes/add-rag-chatbot-mvp/tasks.md`; 9.1 to 9.4 are ticked. One gap sits outside the task list: the site has no `bobdempsey83.com` subdomain yet, described under "Live, verified" below. The owner added six items to `tasks.md` on 2026-09-23: Vercel Web Analytics (neither `@vercel/analytics` nor `@vercel/speed-insights` is installed), dark mode, how-it-works content and screenshots on the landing page, README screenshots (the README has none), the Vercel project icon, and the subdomain. The app starts on the landing page at `/`, so that page is where the new content goes. `tasks.md` orders the work so each step feeds the next: abuse controls and analytics before the site is promoted, dark mode before any screenshot is taken, the landing content and subdomain before the README, and the portfolio, `resumeProjects` and profile README last, because they link the subdomain and reuse the screenshots.

### Running it locally, 2026-09-21

`pnpm dev:api` serves on 5180 and the three Vite apps pin their own ports: dashboard 5181, widget 5182, landing 5183. Each app proxies `/api` to 5180, overridable with `ACB_API`. Started against the real `.env` the API reports `store: postgres, model: openai`, which is the deployment running locally and spends credit on every question asked.

Two dev servers from an abandoned agent worktree were still holding 5182 and 5183 when this session started, so the landing page on 5183 was the worktree's copy rather than the repo's and edits appeared to do nothing. Check what a port is actually serving before debugging the page on it: `netstat -ano | findstr :5183`, then match the PID's command line. The worktrees live under `.claude/worktrees/` and are gitignored.

`Open the dashboard` on the landing page links to `/dashboard`, which nothing serves. In development the dashboard is its own app on 5181, and Vite answers `/dashboard` with the landing's own `index.html`, so the link looks alive and reloads the same page. The deploy has to rewrite `/dashboard` to the dashboard build, which is part of task 9.1 and the reason `vercel.json` cannot be a copy of the advisor's.

### The sweep and the labels, 2026-09-21

`GET /api/cron/sweep` deletes every session whose `expires_at` has passed and answers `{ swept: n }`. It is mounted above the session middleware, because a sweep that minted a workspace of its own would replace the row it had just deleted. One delete does the whole job: every session-keyed table references `sessions` with `on delete cascade`, and the template tables carry no session id, so the read-only seed template is never touched. It runs as the connection role rather than under a claim, since a claim names one session and the sweep reaches all the dead ones.

Vercel Cron proves itself with `Authorization: Bearer $CRON_SECRET`, so that header is the whole gate. `CRON_SECRET` is named in `.env.example` and is PLACEHOLDER until set. With no secret configured the route refuses every request rather than running open: a deployment that forgets the variable loses its sweep, which is a storage bill, where an unauthenticated delete would lose workspaces. The schedule entry sits in the `crons` array that `scripts/build-vercel.mjs` writes into `.vercel/output/config.json`, not in `vercel.json`: `0 4 * * *`, once a day, which is all the free plan allows.

Expiry on read and the fictional-data labels were already built and are now ticked rather than implemented again. `find` filters on `expires_at > now()` and every policy calls `session_is_live`, so an expired workspace is unreachable before any sweep runs, which the session tests cover from the middleware down. The label sits on every seeded document's reference, on each option in the dashboard's set picker, and as a badge on seeded rows in the document list, with tests over all three corpora.

### The deploy shape, 2026-09-21

`vercel.json` builds every workspace, checks the embed entry is still under 4 KB gzipped, then runs `scripts/build-function.mjs` and `scripts/build-vercel.mjs`, which write `.vercel/output` between them. ~~It assembles one `dist/`~~ **Changed 2026-09-21**, see "Live, verified" below: the output goes through the Build Output API instead, so `vercel.json` carries only the build and install commands, `framework: null` and `trailingSlash: false`, and the routing table lives in the `config.json` that build writes. The layout is decided by the embed tag: a customer pastes `<script src="https://host/embed.js">`, so the widget's output goes to the site root and the dashboard moves under `/dashboard/` instead. Each app still builds to its own `apps/*/dist` and the assembly copies, because the size check reads `apps/widget/dist/embed.js` and per-app previews still work.

The dashboard's Vite config carries `base: '/dashboard/'`, without which every asset URL would point at the root and load the landing page. That applies in development too: `pnpm dev:dashboard` now serves at `http://localhost:5181/dashboard/` rather than at the root. A route below the filesystem handler sends `/dashboard` and anything under it to `static/dashboard/index.html`, which is what makes the landing page's `Open the dashboard` link work in production. It sits below that handler so it cannot swallow a real asset under `/dashboard/assets`. It still does not work in development, where the two are separate servers.

~~`api/[[...route]].ts` is the one function, re-exporting a handler from `apps/api/src/vercel.ts`.~~ **Replaced 2026-09-21.** There is no `api/` directory now; the function is written into `.vercel/output/functions/api.func` by the build, and a route above it sends `/api` and everything under it there. `createProductionApi` reads the environment through the guard and throws on anything missing, the opposite of `dev-real.ts`, which degrades: a function answering with fake clients would look like it worked.

`SUPABASE_DB_URL` is now required by the env guard. It was always what the API queried through, and the guard checking the other three but not that one would have let a deployment boot and fail at its first query.

Nothing is read from disk at request time, so nothing has to be carried alongside the function. The corpora are indexed into template rows by `pnpm --filter @acb/api templates:load` before a deploy, and seeding copies those rows. `trailingSlash` is false, so the advisor's 308 trap does not apply here, and the client posts to `/api/chat` with no slash.

~~Set the five variables as Sensitive in the Vercel project before the first deploy.~~ **Done 2026-09-21**, see "GitHub and Vercel" below. All five are SET.

### The README, 2026-09-21

`README.md` covers what a visitor can try, the five stages of the pipeline with the real numbers (900 character chunks, 150 of overlap, 1536 dimensions, six nearest chunks, the 0.62 floor), how row-level security isolates a session, the caps, how to run it locally and how it deploys. ~~The one thing it cannot carry yet is the live link, which reads "not deployed yet" until the Vercel project is up. Task 9.4 stays open for that line alone.~~ **Fixed 2026-09-21.** The README links `https://ai-chatbot-builder-pi.vercel.app` and task 9.4 is ticked. The link changes once the subdomain is attached.

### The Vercel account, checked 2026-09-21

The Vercel MCP is connected and authenticated as `bobdempsey`, team `team_jqLK1IhQBH8oIYVE11zPHSGO`, on the **hobby** plan with one concurrent build. The CLI is not installed and the repo has no `.vercel` link and no git remote, so the first deploy either pushes to GitHub and creates a git-linked project, or uploads files through `create_deployment` without a remote.

Two things about the plan bear on the plan. Hobby allows one cron run a day, which the `0 4 * * *` sweep already matches, so nothing has to change there. Firewall rate-limiting rules are a paid feature, which puts task 8.1 in doubt: confirm what the plan actually allows before promising edge rate limits, and remember the API's own caps (20 questions per ten minutes, 10 documents, 5 MB uploads) already run server-side and do not depend on the firewall.

### GitHub and Vercel, set up 2026-09-21

The repo is public at `https://github.com/BobDempsey/ai-chatbot-builder`, pushed from `master`, which is also the Vercel production branch. The Vercel project is `ai-chatbot-builder`, id `prj_Elgx2YgzOUruxGJEcnRChvU1a4NM`, linked to that repo in team `team_jqLK1IhQBH8oIYVE11zPHSGO`.

All five variables are set as Sensitive for production, preview and development: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` and `CRON_SECRET`. The cron secret was generated for this project and written to the local `.env` as well, so the sweep can be called by hand against a dev server.

~~No deployment has run yet. The project was created with `deploy: false` so the variables could be set first, and the push to `master` happened before the project existed, so nothing triggered a build. The next push to `master` deploys, or a deployment can be created from the current commit.~~ **Deployed 2026-09-21**, see "Live, verified" below. The project was created with `deploy: false` so the variables could be set first; pushes to `master` now deploy to production.

### Live, verified 2026-09-21

`https://ai-chatbot-builder-pi.vercel.app` is the production deployment. It took three builds, and the two failures are worth keeping.

The first put the function at `api/[[...route]].ts`. Vercel compiled each `api/*.ts` file on its own without rewriting import specifiers, so the relative import into `apps/api/src` resolved to a path with no extension and the process exited on ERR_MODULE_NOT_FOUND before serving anything. Every import inside `apps/api/src` is extensionless, which is ordinary TypeScript and not worth rewriting for one deploy target.

The second bundled that file during the build. It built cleanly and served no function at all: the `api/` directory is read from the committed source, so a file the build writes into it is never seen.

The third works and is the shape to keep. `scripts/build-function.mjs` writes `.vercel/output/functions/api.func` itself, esbuild-bundled, and `scripts/build-vercel.mjs` writes `static/` and the `config.json` routing table beside it. Nothing generated is committed. Two details there are load-bearing: the handler is a Node request listener from `@hono/node-server` rather than `hono/vercel`, because the Node launcher calls the default export as `(req, res)`; and the function declares `supportsResponseStreaming`, without which the platform buffers the whole reply and the answer arrives in one piece.

The full no-account flow was walked against the live site with curl. A first request mints a session and seeds it, the document list comes back labelled fictional demo data, "How do refunds work?" streams token by token and ends with citations naming the document and section, "what wine goes with fish pie" declines and offers a human, a rating sticks and shows up in the summary, the conversation log and the gap list both fill, a cross-origin request carrying only the public bot id is answered, and `/api/cron/sweep` without the bearer secret is refused with 401.

~~One thing the brief asked for is missing. A new workspace is seeded with a bot and the three document sets, but with no past conversations, ratings or analytics, so those three dashboard screens are empty until the visitor asks something. The brief wanted every screen to have data on first view.~~ **Fixed and deployed 2026-09-23.** Only the in-memory store had ever seeded history, which is why the tests passed and task 4.8 was ticked while the live site showed empty screens. `apps/api/src/seed-history.ts` now holds each set's history: four conversations, three up votes and one down, and three unanswered questions, one with a follow-up email. Both stores write it at seeding time, the Postgres one inside the seeding transaction. Citations are written as a document title and a section and resolved against the session's own copies, and `seed-history.test.ts` fails if a heading in the Markdown changes under them. Every seeded timestamp sits hours back, so the seeded questions never count against the ten-minute chat cap. Checked against the real project on 2026-09-23 with a probe session, deleted afterwards: 4 conversations, 10 messages, 5 cited answers, ratings 3 up and 1 down, 3 unanswered questions, 0 toward the cap. Switching the document set leaves the history in place, so its citations then name documents the workspace no longer holds. After the deploy a fresh session on the live site returned ratings of 3 up and 1 down, 10 messages and 3 unanswered questions.

`0 4 * * *` is the cron, and the hobby plan allows one run a day, so it fits. Task 8.1 is still open and may not be possible on this plan: Firewall rate-limiting rules are a paid feature. The server-side caps do not depend on it.

The site is still on its `.vercel.app` name. Attaching a `bobdempsey83.com` subdomain is the last deploy step.

### CI, 2026-09-23

CI failed three runs in a row on the dashboard test "rejects a malformed color", though no dashboard code had changed since the 09-21 pass. The settings panel copied the saved bot into its draft from a `useEffect`. On a slow first render that effect was still pending when the test typed, and React flushed it after the keystroke, which reset the field to `#2563eb`. It reproduced once in five local runs under Node 22 and never under Node 24, which is why it passed locally. The panel now follows a new saved bot by adjusting state during render, and eight cold Node 22 runs passed afterwards, as did CI on `f539f52`. Watch for the same pattern elsewhere: a mount effect that copies a prop into editable state can throw away the reader's first edit.

Local Node is 24 and CI pins 22. To reproduce a CI-only failure, run `npx -y -p node@22 node ../../node_modules/vitest/vitest.mjs run` inside the app's folder.

### The firewall rule, 2026-09-23

The hobby plan allows one WAF rate-limit rule and three custom rules per project. The one rule, "Rate limit API writes per IP", matches `POST` with a path starting `/api/` and allows 20 per IP per 60 seconds (fixed window), answering 429 before the function runs. It covers chat, uploads, the corpus swap, ratings and the handoff, and it bounds cost even when a visitor drops the session cookie to reset the per-session caps (20 questions per ten minutes, 10 documents). GET routes, including the one that mints and seeds a session, are not limited at the edge. Verified live: 25 empty POSTs to `/api/rate` returned twenty 400s, then five 429s. Testing by hand more than 20 POSTs a minute from one IP will hit it.

The rule lives in Vercel, not the repo. Change it with the Vercel CLI, which is logged in as `bobdempsey`, the way the advisor's rule was made: `npx vercel@latest firewall rules list --expand --project ai-chatbot-builder --scope bobdempseys-projects`, then `firewall rules edit "<name>" ... --yes` and `firewall publish --yes`. The Vercel MCP's firewall tools answer 404 "Seawall Config not found" for this project even with a rule published, so don't use them. The first version, typed into the dashboard, matched a literal `/api/*` and limited nothing; `rules list --expand` is what showed it.

Bot Protection is set to Log (published 2026-09-23), AI Bots is Allow and BotID is Basic. Challenge was rejected on purpose: a challenge page cannot be solved by the widget's `fetch` from a customer's page, so it would break the embed, and the rate limit already bounds what a bot can spend. Log records bot traffic without blocking it. Viewing unknown bot traffic needs Observability Plus, which this plan lacks. After the change `/` and `/api/bot` still answered 200.

### Working with the owner

He reads `tasks.md` and the OpenSpec list himself, so "what is left" comes back as two or three sentences of prose naming what unblocks what, never as a checklist read back to him. He asks for one-sentence answers often, and he means it.

Two kinds of action in this session needed his say-so before they would run, both refused by the harness rather than by him: `git restore` over files, and creating the Vercel deployment. Expect the same for anything destructive or outward-facing, and ask in one line rather than working around it.

One habit worth keeping: `biome check --write` over a whole directory re-sorts imports across files the session never touched, and the repo's `pnpm lint` does not enforce that ordering. Scope the formatter to the files you changed, or the diff stops being readable.
