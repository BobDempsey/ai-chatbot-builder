# AI Chatbot Builder

Upload your documentation, get an embeddable support chatbot that answers from it and cites the section it used.

Live site: https://ai-chatbot-builder-pi.vercel.app

There is no sign-up and no login. The first request mints an anonymous session with a workspace of its own, seeded with a sample bot, three fictional document sets, past conversations, ratings and analytics, so every screen has data the first time you open it. The workspace lives 24 hours and is then deleted.

## What you can do in a few minutes

Ask the demo bot a question on the landing page and watch the answer stream in with numbered citations. Open the dashboard, swap the document set, upload a PDF or paste a help-center URL, and watch it chunk and index. Change the bot's name, colors, greeting and tone, then test it in the preview chat beside the settings. Copy the one-line script tag and paste it into any page to get the same chat as a bubble in the corner. Read the conversation log, the thumbs-up and thumbs-down ratings, and the list of questions the bot could not answer, which is the list that tells you what to write next.

Every seeded document is fictional on purpose and labelled as such. Documents about a real product would let the model answer from its training data, and the demo would prove nothing about retrieval.

## How an answer is made

**Ingest.** A PDF, a URL or pasted Markdown becomes text, and the text is split on its headings into chunks of about 900 characters with 150 characters of overlap. The overlap exists so a sentence that straddles a boundary is still whole in one of the two chunks. Each chunk keeps the heading above it, which later becomes the citation's section name.

**Embed.** Each chunk goes to OpenAI `text-embedding-3-small` and comes back as 1536 numbers, stored in a pgvector column of exactly that width. Indexing runs after the upload response has already gone out, so the dashboard can show a document as indexing rather than making you wait.

**Retrieve.** A question is embedded the same way, and an HNSW index finds the six nearest chunks by cosine distance, inside the asking session's rows only. Anything at or above a distance of 0.62 is dropped. That floor is measured rather than guessed: questions the seeded corpora answer land between 0.35 and 0.51, and off-subject questions land at 0.66 and above.

**Answer.** The surviving chunks go to OpenAI `gpt-5.6-luna` numbered, with an instruction to answer from them alone and to number what it used. The numbers in the reply become the citations under it, each linking to the document and section it came from.

**Decline.** The floor cannot tell a chunk about the right subject from one that holds the answer. Ask "what wine goes with fish pie" and the fish pie chunk comes back at 0.51, because it is about fish pie. So the model is given a way out: it replies `NO_ANSWER`, and the route turns that into a plain decline and a button offering to pass the question to a person. Nothing reaches the reader until that token is ruled out, so a decline never arrives half-written.

## How your data stays yours

Every table is keyed by session id, and Postgres row-level security enforces it rather than the application remembering to. The API sets a `request.acb_session` claim inside each transaction, and every policy compares against it. A query with no claim sees nothing at all.

This was checked against real rows rather than assumed. Under the anonymous role, session A saw its own documents and none of session B's, retrieval returned only A's ready chunks in distance order, a query with no claim returned nothing, and an expired session became unreachable before any sweep ran.

The API talks to Postgres directly rather than through PostgREST, because the service role key would bypass the policies entirely, and the policies are the isolation model.

With no login, the caps are the rest of the defense. One question is at most 1000 characters, a body over 32 KB is refused before it is parsed, history is capped at 10 turns, an upload at 5 MB, a session at 10 documents and 20 questions per ten minutes. Vercel Firewall rate-limits and bot-filters at the edge on top of that.

## Running it locally

You need Node 22 and pnpm 10.15.1.

```sh
pnpm install
cp .env.example .env    # then fill it in
pnpm dev:api            # port 5180
pnpm dev:landing        # port 5183, in a second terminal
```

`pnpm dev:dashboard` serves at `http://localhost:5181/dashboard/`, and `pnpm dev:widget` at 5182. Each front end proxies `/api` to 5180, which `ACB_API` overrides.

The API degrades rather than refusing to start, so a front end can run against nothing. Without `OPENAI_API_KEY` it uses fake embedding and answer clients and a looser relevance floor, because the fake embedder is lexical and its distances sit higher. Without `SUPABASE_DB_URL` it uses an in-memory workspace, seeded at boot and lost on restart. With both set it is the deployment, running on your machine, and every question spends credit.

To index the demo corpora into the template rows a new workspace is seeded from:

```sh
pnpm --filter @acb/api templates:load
```

## The repo

One pnpm workspace. `apps/api` is the Hono API, `apps/dashboard` the admin screens, `apps/widget` the embeddable chat, and `apps/landing` the chat-first landing page. `packages/schemas` holds the Zod schemas and the limits both sides need, and `packages/ui` the shadcn components, so the preview chat and the embedded widget render the same markup. `supabase/migrations` holds the six migrations, and `openspec/` the change proposal this was built from.

The widget renders inside a shadow root, so a host page's CSS cannot reach in and the widget's cannot leak out. What a page pays to carry the tag is a 2.1 KB gzipped entry script; the chat itself downloads on first hover, focus or click. `scripts/check-embed-size.mjs` fails the build if that entry goes over 4 KB, which is how an accidental barrel import gets caught.

```sh
pnpm test        # 146 tests, no key and no database needed
pnpm typecheck
pnpm lint
```

`pnpm --filter @acb/api eval` asks the live model 31 fixture questions and fails any reply quoting a figure its grounding does not contain. It spends credit, so it runs by hand and never in CI.

## Deploying

`vercel.json` builds every workspace, checks the embed entry size, and assembles one `dist/` from the three front-end builds: the widget at the root because the embed tag is `/embed.js`, the dashboard under `/dashboard/`, the landing page at the root. `api/[[...route]].ts` is the single function, and a daily cron calls `/api/cron/sweep` to delete expired workspaces.

Set `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` and `CRON_SECRET` as Sensitive environment variables in the Vercel project. The function refuses to boot if any is missing, which is better than answering with fake clients and looking like it worked.
