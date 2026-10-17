# Claude project entrypoint

@AGENTS.md

**Speed is the priority. Write tests only when necessary and important for setup
or critical behavior; avoid test-suite expansion for routine plumbing or docs.**

Read the canonical rules above and the `AGENTS.md` in the app you are changing.
Frontend: `apps/web/`. Backend runtime: `apps/api/`. Ingestion CLI: `apps/ingestion/`.
Browser-safe shared package: `packages/contracts/`. Server-only `packages/db` holds
API-owned PostgreSQL/Drizzle schemas/migrations shared with ingestion.
See `docs/decisions/003-postgres-drizzle-storage-ownership.md`.
Research and temporary plans belong in `.context/`; durable instructions belong in `docs/`.

For new-document imports or embedding changes, follow the ingestion/embedding
guidance in `AGENTS.md` and `docs/document-embeddings.md`.
