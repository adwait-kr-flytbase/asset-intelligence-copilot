# API-owned PostgreSQL schema

`@repo/db` is the server-only persistence package consumed by API and ingestion.
Read [storage setup and usage](../../docs/storage.md) and the
[ownership decision](../../docs/decisions/003-postgres-drizzle-storage-ownership.md).

- `src/schema/`: canonical Drizzle tables, constraints and indexes.
- `migrations/`: generated, reviewed SQL and migration metadata.
- `src/client.ts`: explicit PostgreSQL connection/pool lifecycle.
- `src/read.ts`: namespace-scoped evidence lookup, without domain interpretation.
- `compose.yaml`: persistent worktree-local development database.

Run migrations explicitly. This package does not read dataset directories or create
connections on import. Compiled ESM exports keep driver dependencies within this package. Turbo builds it
before dependent apps; `db:watch` refreshes dist during schema/client development. Never import this package
from the frontend or browser-safe contracts.
