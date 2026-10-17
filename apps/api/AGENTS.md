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
