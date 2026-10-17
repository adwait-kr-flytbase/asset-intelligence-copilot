# Asset Intelligence Copilot

Build a chat assistant for oil-field operators that combines inspections, repairs,
manuals/SOPs, regulatory records and human notes into evidence-backed answers and
inline visuals. Read [the challenge index](docs/problem-statement/index.md) for
requirements and [architecture](docs/architecture.md) for the implementation boundary.

## Delivery priority

**Prioritize speed. Write tests only when necessary and important for setup or
critical behavior.** Prefer a quick typecheck/build and targeted runtime smoke check.
Do not expand test infrastructure, chase coverage, or test routine scaffolding,
styling or documentation just for completeness. Keep existing useful checks working.

## Ownership and independence

- Frontend branch owns `apps/web/`: React/Vite, TanStack Router/Query, chat UI,
  visual renderers, browser-local fixtures and API client integration.
- Backend branch owns `apps/api/` for Hono/Node, agent/tool execution, domain
  calculations, evidence retrieval, corrections and persistent memory, and
  `apps/ingestion/` for the independent directory-ingestion CLI. Read the
  [ingestion boundary decision](docs/decisions/001-independent-ingestion-cli.md)
  before changing ingestion ownership or extracting shared storage code.
- `packages/contracts/` is the **browser-safe shared package**: runtime schemas,
  wire types and synthetic fixtures. Read [the contract](docs/contracts.md) before
  changing its public surface. Keep changes additive while branches develop separately.
- Root tooling, `pnpm-lock.yaml`, CI and contracts are coordination surfaces. A branch
  can update its own dependencies and regenerate the lockfile; integrate these changes
  deliberately. Add shared packages only when actual reuse justifies the coupling.
- Canonical storage uses PostgreSQL + Drizzle. The API owns schemas/migrations;
  ingestion owns directory reading, validation and database writes. Share canonical
  models through server-only `packages/db`, consumed by both apps; see
  [the storage decision](docs/decisions/003-postgres-drizzle-storage-ownership.md).
- Frontend and API communicate over HTTP. Do not import one app's source from another app, put
  server implementations in contracts, or move frontend components to shared packages
  without a second real consumer.

Before starting frontend or backend work, read that app's `AGENTS.md`, even if your
session starts at the repository root. Claude entrypoints point to the same rules.
Follow [worktree development](docs/development.md) for independent runs, port selection,
fixtures and linking the two branches. A worktree does not inherit ignored files.

## Current foundation

The frontend defaults to a local synthetic fixture stream and runs without the API.
`VITE_API_MODE=live` routes `/api` through the Vite proxy to Hono. The API currently
serves health plus a synthetic AI SDK chat stream. PostgreSQL/Drizzle storage and a local ingestion CLI now exist; read `docs/storage.md`.
PostgreSQL/pgvector document embeddings are available. Authentication and persistent
conversation memory remain application work. Keep fixture output visibly
labeled; never present it as answers derived from sample data.

For document imports or embedding changes, read [embedding operations](docs/document-embeddings.md).
Use `pnpm ingest --data-root <directory> --namespace <namespace> --embed` for import
followed by pending-document indexing. PostgreSQL/pgvector and the OpenRouter
embedding profile are configured; retrieval is separate application work.

Use AI SDK UI message streaming, not `@ai-sdk/rsc`. TanStack Query owns ordinary API
data; the chat hook owns the live message stream. Store durable memory on the backend.

## Workflow

- Use the pinned Node/pnpm versions and root commands in [README](README.md).
  Scaffold framework apps with their official tooling (the web app was generated
  using `create-vite` with `react-ts`), then customize them.
- Keep exploration, research, plans and temporary evidence in ignored `.context/`.
  Put durable project/run/architecture instructions in `docs/`.
- Keep credentials in ignored app-local env files. Browser `VITE_*` values are public.
- `sample-data/` is local and ignored. See the dataset guide and worktree instructions
  before ingestion. Preserve raw records and original values when applying corrections.
- Read relevant requirements rather than hardcoding sample answers. Production uses
  temperature difference and the type manual; downtime uses weekly inspections.
  Show conflicts and sources; keep shared knowledge separate from private conversation
  history. A challenge user picker is not production authentication.
- Preserve concurrent work. Commit foundational shared changes before branching;
  carry later shared commits into both branches. Push/deployment needs user direction.
