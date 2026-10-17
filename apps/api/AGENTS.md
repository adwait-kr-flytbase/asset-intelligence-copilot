# Backend ownership

Own this app's Hono endpoints, agent/tools, ingestion/evaluation commands, domain
calculations, data access, corrections and memory. Read root `AGENTS.md`, the challenge
index, `docs/contracts.md` and `docs/development.md` first.

- Prioritize speed. Add tests only for necessary setup boundaries or critical domain
  behavior; use targeted request smoke checks instead of growing a generic harness.
- Run `pnpm dev:api` independently; no frontend process is required. `src/app.ts`
  defines the app without opening a socket; `src/index.ts` owns runtime startup.
- Preserve the AI SDK UI message protocol on `POST /api/chat`. Keep user and
  conversation scope explicit. Evolve shared schemas additively and provide fixtures
  so frontend work is not blocked by backend progress.
- Keep all server implementations here, not in `packages/contracts`. Start ingestion
  or evaluation as app-local CLI modules; add a separate tool app only when useful.
- Raw data, authoritative calculations, correction provenance and durable memory
  belong here. Do not rely on browser state for cross-user shared knowledge.
- Consult manuals/SOPs and reports; follow `report_file` rather than guessing names.
  Keep originals, apply corrections at their scope, surface unresolved contradictions
  and cite evidence. Ordinary notes are not formal corrections.
- The current endpoint is a synthetic fixture, not a real agent. Before adding
  private persistence, enforce conversation ownership server-side. Demo user IDs
  supplied by the browser are not production authorization.
- Bind locally by default. Select a database, model and deployment target explicitly
  when implementation needs them; avoid speculative infrastructure services.

## Working independently

- Make server changes in this app. Leave `apps/web/` to the frontend branch. Verify
  HTTP endpoints directly; no frontend process is required to implement the backend.
- Add server dependencies from the repo root with
  `pnpm --filter @repo/api add <package>`; include the app manifest and lockfile change
  in your commit. Use `-D` for tooling. Keep provider credentials out of contracts.
- For a focused check, use `pnpm --filter @repo/api typecheck` and
  `pnpm --filter @repo/api build`, plus a relevant HTTP/CLI smoke check. Add tests
  only when they protect necessary, important behavior.
- Dataset and `.env` files are ignored: provision them in this worktree as described
  in `docs/development.md`. Keep future derived stores/migrations app-owned; use a
  separate local database/schema per worktree if multiple backend processes write.
- Publish changed wire schemas and representative synthetic fixtures in a focused
  shared commit before asking the frontend to integrate. Preserve existing response
  variants while the two branches catch up.
- Handoff: list endpoints/stream parts, shared commit IDs, required env variable
  names (not values), dataset/store setup, and a reproducible request example.
