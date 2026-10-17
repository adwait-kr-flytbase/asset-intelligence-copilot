# PostgreSQL persistence

For the final release dataset and its required schema migration, see
[final validation setup](final-validation-data.md). The application and local tooling now use the validated release database
`asset_final_validation_20270115`; the retired sample database remains available for rollback.

The API/backend owns `packages/db` (`@repo/db`): Drizzle schemas, reviewed migrations,
a PostgreSQL client and small namespace-scoped evidence reads. `apps/ingestion` is
an independent local loader using those same schemas. Neither needs the HTTP server
or frontend to run. The [decision](decisions/003-postgres-drizzle-storage-ownership.md)
explains the engine and ownership choice.

The user prioritized application persistence over ingestion infrastructure. This
milestone uses current relational tables, versioned original source files and one
transaction per import. Snapshot catalogs, temporal query frameworks and elaborate
CLI recovery are deferred. Chat remains a synthetic fixture; conversations, interpreted
corrections and application workflows have no persistence implementation yet.

## Local setup

Use Node22.22.3 (`nvm use`), pnpm11.20.0 and Docker Compose. From the repo root:

```sh
pnpm install --frozen-lockfile
cp packages/db/.env.example packages/db/.env
cp apps/ingestion/.env.example apps/ingestion/.env
# Add DATABASE_URL from the examples to apps/api/.env, preserving existing settings.
pnpm db:up
pnpm db:migrate
pnpm db:check
pnpm ingest --data-root sample-data --namespace challenge
pnpm --filter @repo/api db:check
```

Before starting, choose a local password in `packages/db/.env` and matching
`DATABASE_URL` in all three env files. Each command loads its package/app-local `.env`;
there is no shared env-file inheritance. URLs with special password characters must
be URL encoded. The checked-in examples contain placeholders, never live credentials.
The current worktree has generated ignored local credentials and a seeded local DB;
other checkouts/worktrees must provision their own config and ignored sample directory.

Select a unique `COMPOSE_PROJECT_NAME` and unused `DB_PORT` for each worktree. Default
host binding is `127.0.0.1:55432`; the image builds pgvector0.8.7 on pinned PostgreSQL18.6
Alpine (same base/ABI as the existing database), mounted at the
PostgreSQL18 data-volume parent `/var/lib/postgresql`. `db:up` waits for readiness.
`pnpm db:down` stops/removes the service while preserving its named volume. Do not
remove that volume as part of routine test cleanup. Changing POSTGRES_PASSWORD in
an env file does not change credentials inside an already initialized volume.

## pgvector and changing databases

`pnpm db:up` builds the local pgvector-enabled image; `pnpm db:migrate` enables the
`vector` extension in the selected database. The multi-stage Dockerfile pins the
PostgreSQL base digest and verifies the pgvector source archive SHA-256; build tools
are excluded from the runtime image. Updating the local image keeps the same named
volume, PostgreSQL version and URL. Never remove the data volume to install an extension.

Run `pnpm db:vector:check` to verify the installed extension, Drizzle vector inserts,
cosine nearest-neighbor search and dimension enforcement using a temporary table. Its
three-dimensional vectors are synthetic probes. Production document indexing separately
uses OpenRouter `text-embedding-3-small` at 1,536 dimensions; see
[document embedding operations](document-embeddings.md).

A PostgreSQL URL is portable; database contents and extension binaries do not move just
because the URL changes. For a new target:

1. Provision a compatible PostgreSQL server with pgvector available and a migration role
   permitted to enable the extension (managed services may require an administrator).
2. Update `DATABASE_URL` in `packages/db/.env`, `apps/ingestion/.env` and `apps/api/.env`,
   or supply it explicitly to each command/process. Local Compose uses POSTGRES_* and
   DB_PORT independently; changing DATABASE_URL does not reconfigure its server.
3. Run `pnpm db:migrate`, then `pnpm ingest --data-root sample-data --namespace challenge`
   for a fresh dataset-only database, followed by `pnpm db:check`, `pnpm db:vector:check`
   and `pnpm --filter @repo/api db:check`. Run
   `pnpm embed:documents --namespace challenge` to regenerate document vectors if
   they were not restored from a backup; this requires the ingestion OpenRouter key.
4. Restart the API so its existing pool uses the new URL. API and ingestion need no code
   changes for the same compatible PostgreSQL schema/extension setup.

Re-ingestion restores original dataset content; it does not migrate application-created
chats, corrections or other future state. Use a logical backup/restore to preserve that
state when moving databases. Keep the previous database/volume until the replacement
passes reconciliation. PostgreSQL major-version or Alpine/Debian changes need a separate
migration check; this pgvector update keeps the existing base image unchanged.

## Browse with Drizzle Studio

From the repository root, run `pnpm db:studio`, then open
[Drizzle Studio](https://local.drizzle.studio). It uses the installed workspace Kit/ORM
and `packages/db/.env` database URL, binding locally to `127.0.0.1:4983`.
Use `pnpm db:studio --port 4984` if another worktree uses that port. Stop with Ctrl+C.
Avoid root-level `npx drizzle-kit studio`: the dependencies and config are owned by
`packages/db`, and npx may download a separate CLI that cannot resolve the package's ORM.

## Schema and migrations

Source schema: `packages/db/src/schema/`. Generated SQL and migration snapshots:
`packages/db/migrations/`. The pinned libraries are Drizzle ORM0.45.4,
Drizzle Kit0.31.11 and node-postgres8.23.1. Schema modules cover:

- Namespaces/oil fields, immutable-by-loader source file versions and locators.
- Areas, teams, users, well types, wells and equipment inventory.
- Inspections, maintenance, regulatory events, notes and formal correction evidence.
- Full Markdown manuals/SOPs/reports/references and explicit report/manual relationships.
- Embedding profiles, source-bound document generations and exact chunk/vector rows.

Known values use typed columns; raw structured payloads remain JSONB. Source files
retain exact UTF-8 text, SHA-256, portable path and a version ID derived from path/hash.
Record citations include that exact version plus JSON pointer or JSONL line. Two
versions of the same path can coexist without changing an older record's citation.
Invalid UTF-8 input is rejected rather than stored with replacement characters.

Composite keys scope records by namespace. Foreign keys enforce same-well inspection
links and matching area/team assignments. SQL checks validate cost sums, date ordering,
spill/null consistency, correction targets, supported record states and location ranges.
Equipment kind is not a physical serial identity. Numeric columns return decimal
strings, date-only fields remain strings, and instants use timestamptz. Source formatting
and original precision remain available in preserved originals. Future planned maintenance
completion dates are valid. No derived production/downtime rules are stored here.

After a schema change:

```sh
pnpm db:generate
# Review the generated SQL and snapshot files; commit with the Drizzle schema.
pnpm db:migrate
```

Migrations run explicitly, never on API startup or implicitly during ingestion. Do not
edit an already-applied migration; add the next migration. This workflow uses reviewed
SQL rather than `drizzle-kit push`. Database tasks bypass Turbo caching and do not run
as part of ordinary build/dev.

## Application access

`apps/api/src/storage/database.ts` exposes lazy `getDatabase()` and `closeDatabase()`.
Importing the API requires no DB URL until application code requests the connection.
Server shutdown closes any pool it created. This preserves independent fixture startup.

```ts
import { createEvidenceStore } from '@repo/db';
import { getDatabase } from './storage/database.js';

const connection = getDatabase();
const evidence = createEvidenceStore(connection, 'challenge');
const asset = await evidence.findAsset('WELL-0001');
const latest = await evidence.recentInspections('WELL-0001', 1);
```

The client also exposes typed `db` for Drizzle queries and `pool` for parameterized SQL.
Tables are exported from `@repo/db/schema`. Scope every query by namespace; a namespace
is an operational data partition, not user authentication. The read helper also supports
`findDocument(id)` with its original source version and `findSource(sourceId)`.
Recent inspections are deliberately bounded to 1–500 rows; larger/application queries
can use typed tables directly with their own pagination/filter contracts.

`@repo/db` exports compiled ESM from `dist/`, keeping PostgreSQL driver dependencies
resolved inside that package. TypeScript consumers use its source types. Turbo builds
it before dependent apps; `pnpm dev:api`, the local loader and API db:check also build it
explicitly. After editing storage source during development, run `pnpm --filter @repo/db
db:watch` in another terminal (or rebuild once). API watch observes DB dist changes.
Node production entrypoints live in each app's `dist/`. PostgreSQL dependencies remain
server-only. Browser-safe contracts keep their existing source-export convention;
no web imports changed.

Complete Markdown, scope metadata, exact links and original source locators are stored.
pgvector and document embedding storage/indexing are implemented. See
[document embeddings](document-embeddings.md) for the separate post-import command.
Retrieval services remain separate application work.

### Relationship verification

The live `challenge` database was audited on 2026-10-17 against the source dataset:
all 48 foreign keys were validated with zero orphaned references. Source-level
checks also found zero mismatches in area/team membership, inventory equipment
kinds used by repairs, report-file links, type/manual mappings and recorded
inspection pointers. The complete source/value reconciliation compared 880,507
values with zero mismatches. Evidence lives in ignored
`.context/pgvector/evidence/{relations-audit,post-vector-data-audit}.json`.

Same-asset composite foreign keys protect inspection, maintenance, report and
correction links. Equipment references in maintenance identify a kind, not a
unique installed unit; no physical-unit relationship is invented. An area's raw
asset list is retained as evidence; `assets.area_id` is the canonical relational
membership. The manual join enforces document/type existence; matching a manual's
kind and filename to its type is loader logic checked by the audit, not a
type-specific SQL foreign key.

### Embedding boundary

`pnpm ingest --data-root <directory> --namespace challenge --embed` imports then
indexes pending documents. `pnpm embed:documents --namespace challenge` independently
reads committed documents and publishes
source/profile-bound vectors using OpenRouter. It runs explicitly after ingestion;
provider calls stay outside write transactions. Completed documents are skipped on
replay. See [the embedding runbook](document-embeddings.md) for configuration,
chunk offsets, atomic publication and revision limitations. Ingestion now registers
additional Markdown as asset-scoped or namespace-wide reference documents.
Retrieval endpoints and query embedding remain separate work.

## Local loader and checks

The CLI reads a supplied directory, validates known source shapes with Zod, retains
original numeric precision using lossless JSON parsing, then writes in FK order in one
transaction. Writes serialize per namespace. Identical existing records are reused;
new IDs are added. Changed existing payloads/documents or equipment ID collisions reject
the import and roll back all preceding writes. Missing records are not deleted.

This is intentionally local tooling with an in-memory plan, not an ingestion service.
Changed overlapping fleet metadata/manuals require a deliberate loader update or a
separate namespace; there is no automatic prefer-incoming policy. Records from a separate
namespace are not combined by reads. Resolve overlaps before the final dataset load;
never silently namespace duplicates to claim they were merged. Source directory contents
must remain stable while the CLI runs. No snapshot/history API or crash-resume machinery
is provided; original input files remain versioned evidence.

Useful checks:

```sh
pnpm --filter @repo/db db:smoke  # Requires the original sample in namespace challenge.
pnpm --filter @repo/api db:check
pnpm typecheck
pnpm build
pnpm test
```

The storage smoke uses transaction rollback for invalid-write checks. Disposable
integration rehearsals use separate owned PostgreSQL containers/tmpfs and temporary
fixtures; retained local research evidence is in `.context/postgres-storage-plan/evidence/`.
Test cleanup removes owned test resources and leaves the persistent development DB,
original sample and reusable Docker image cache intact.
