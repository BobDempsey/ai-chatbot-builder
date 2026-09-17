# Building in parallel: vertical slices in git worktrees

How this repo splits work between agents. Written for the agent that picks up a slice, and for whoever cuts the slices in the first place. Researched 2026-09-17; the prior run of this pattern is `spec/advisor-build-plan.md` in `C:\code\ai-frontend-advisor`, which used exactly two slices and merged them by hand.

## The two ideas

A **vertical slice** is a feature cut through every layer it needs: its UI, its endpoint, its logic and its data access, owned by one agent. The opposite is a horizontal split, where one agent does "the API" and another does "the frontend". Horizontal splits look tidy and fail in practice, because every feature change lands in the same folders and two agents end up editing one file from different directions. A slice is judged by whether it can be finished and verified without waiting on another slice.

A **git worktree** is a second working directory for the same repository, on its own branch, sharing one `.git` object store. `git worktree add ../repo-slice-a -b slice-a` gives an agent a full checkout in seconds without cloning. The Agent tool takes `isolation: "worktree"` and does this for you, cleaning the worktree up if nothing changed. The point is file-level isolation: two agents editing the same path in one directory corrupt each other's work with no warning, and worktrees make that impossible.

They compose. Slices decide what an agent owns; worktrees stop two agents from touching the same bytes while they work.

## Cutting slices for this project

Slice along the capability boundaries the specs already draw, in `openspec/changes/add-rag-chatbot-mvp/specs/`. Those seven capabilities are close to the natural slice lines, because each names behavior a visitor can observe rather than a layer of the stack.

Some rules that come out of the research and out of the advisor build:

- **Two or three slices at a time, not seven.** Each extra slice multiplies the merge surface, and this repo is small. The advisor ran two.
- **Name every file each slice owns, before starting.** A file owned by nobody gets written by both. A file owned by two slices is a merge conflict with extra steps.
- **Pull shared files out of the slices.** Anything two slices need (the shared UI package, the schemas package, a migration, `scripts/`) is written on `main` first, in a phase 0, then both slices build on it. The advisor did this: phase 0 landed the spec edits and the `uilc:ask` event contract before either agent started.
- **Foundations are not a slice.** The monorepo scaffold, the database schema, session middleware and the RLS policies are phase 0 work. Everything else depends on them, so parallelising them just produces three incompatible scaffolds.
- **Give each slice its own ports and its own database.** Two worktrees cannot both hold a dev server port or a check-runner port. In the advisor, two worktrees could not run `pnpm site:check` or `pnpm dev` at once, which cost real time. Assign ports per slice up front, and give each slice its own Supabase branch or schema.
- **Each worktree needs its own install and its own env file.** `.env` is gitignored, so it does not come with the checkout. Run `pnpm install` inside the new worktree; a moved or new working directory needs `CI=1 pnpm install --frozen-lockfile`.
- **Merge sequentially and keep both sides of a shared check file.** If two slices both add checks to one test script, the merging session keeps both sets rather than taking one side. The advisor hit exactly this on `scripts/site-check.ts`.

## Candidate slices here

After phase 0 (scaffold, schema, RLS, sessions, seeding), the work splits cleanly into three:

- **Ingestion and retrieval.** Upload, chunking, embedding, indexing state, vector search, the answer route, citations, the decline path. Owns `apps/api` and the demo corpora.
- **Dashboard.** Settings, preview chat, conversation log, ratings, the unanswered list. Owns `apps/dashboard`.
- **Widget and landing page.** Shadow-root mounting, the lazy loader, the script tag, the chat-first landing page. Owns `apps/widget` and the landing app.

The dashboard and the widget both consume `packages/ui`, so that package is phase 0 and frozen for the duration, or one slice owns it and the other waits. The dashboard and the widget both call the answer route, so its request and response shape belongs in `packages/schemas` before either starts.

## Running it

1. Land phase 0 on `main` and commit it. Every slice starts from that commit.
2. Write down, per slice: the capability it owns, the files it may write, its ports, and how it verifies itself.
3. Launch one agent per slice with `isolation: "worktree"`, giving it that written scope and nothing else.
4. Merge one slice at a time, run the full check suite after each, and fix the conflict in the shared file rather than picking a side.

## Sources

- [Git worktrees for parallel AI agent execution](https://www.augmentcode.com/guides/git-worktrees-parallel-ai-agent-execution)
- [Running a multi-agent coding workspace](https://www.augmentcode.com/guides/how-to-run-a-multi-agent-coding-workspace)
- [Git worktrees for AI coding](https://www.mindstudio.ai/blog/git-worktrees-parallel-ai-coding-agents)
- [Git worktree isolation patterns](https://zylos.ai/research/2026-02-22-git-worktree-parallel-ai-development/)
- [Vertical slice architecture](https://www.jimmybogard.com/vertical-slice-architecture/)
- [When to choose vertical slice architecture](https://milanjovanovic.tech/blog/when-to-choose-vertical-slice-architecture)
