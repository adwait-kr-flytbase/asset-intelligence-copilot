# PostgreSQL, Drizzle and storage ownership

Date: 17 October 2026.
Status: selected storage direction following the user's request to prefer correct
structured schemas and use PostgreSQL if appropriate. This records the engine,
ORM and ownership decision. The persistence foundation is now implemented; see
[storage setup](../storage.md) and the scope update below.

## Decision

Use **PostgreSQL with Drizzle ORM** for canonical structured records and source
provenance. This supersedes the earlier MongoDB preference and implementation
proposal. Keep the independent `apps/ingestion` CLI accepted in
[ADR001](001-independent-ingestion-cli.md).

The API/backend owns the canonical Drizzle schema, migrations and database client.
These live in **server-only `packages/db`**, consumed by API access and CLI writes. This is shared backend infrastructure with two concrete consumers,
not a browser contract package. Neither app imports the other's source.

- `apps/api`: domain queries, calculations, evidence retrieval, corrections and
  authorization. It consumes the canonical schema; it does not read dataset folders.
- `apps/ingestion`: directory discovery, reading, parsing, source validation,
  provenance capture and transactional database writes using that same schema.
  It runs without the HTTP service and does not need a public ingestion endpoint.
- `packages/db`: canonical Drizzle tables, SQL constraints, migrations
  and connection primitives. No second set of importer-owned database models.
- `packages/contracts`: browser-safe HTTP/stream schemas and synthetic fixtures.
  Keep database implementations and server dependencies out of this package.

## Why PostgreSQL

JSON files are the delivery format, not evidence of a schemaless domain. The full
sample audit found consistent record shapes and explicit asset, inspection, user,
team and area relationships. Maintenance, regulatory events and formal corrections
must reference the correct asset's inspection, rather than merely an existing ID.
SQL foreign keys, uniqueness, checks and transactions express these invariants
in the database and support exact joins, aggregates and date-window calculations.
MongoDB remains viable, but would require more application-managed referential
integrity for these relationships. This choice is about the data model and its
constraints; it is not a comparative performance claim.

Use typed relational columns for known domain fields, with JSONB for original
parsed payloads and appropriate source metadata. Preserve exact original file
content separately: JSONB does not preserve textual formatting or key ordering.
Use exact decimal storage for costs and preserve date-only values, timestamps,
nulls and source precision deliberately. Equipment kinds are not evidence of
individual physical component identities; do not invent instance histories.
Formal correction prose must remain attributable source evidence, not silently
become a trusted typed patch.

Drizzle's TypeScript types and relation helpers do not replace runtime input
validation or SQL constraints. Generate, inspect and apply migrations, including
composite foreign keys for same-asset relationships. Database schema changes belong
to the backend schema owner; ingestion validates incoming directories against them.

## Evidence and limits

A disposable PostgreSQL 18.6 / Node 22.22.3 proof used Drizzle ORM 0.45.4,
Drizzle Kit 0.31.11 and pg 8.23.1. All nine scenarios passed, including a full
sample load of 47,200 business records/documents, exact baseline queries, decimal
and source preservation, rejection of cross-asset references, duplicate/check
failures and multi-table rollback. The generated migration installed 45 foreign
keys and 12 checks across 17 tables. Source fingerprints were unchanged; owned
containers, network, temporary database and dependency mounts were removed.

Local research and evidence live in ignored
`.context/storage-foundation/research/structured-audit/` and
`.context/storage-foundation/evidence/structured-audit/`. They are experiments,
not deployed application code or a full lifecycle acceptance test. Earlier MongoDB
prototype results remain historical evidence, not PostgreSQL importer verification.

## Implementation follow-through

Re-evaluate ingestion for PostgreSQL transactions and shared Drizzle schemas.
Before production acceptance, exercise replay, additive directories, changed source
versions, conflicting IDs, partial failure, concurrent writers and cleanup. Design
source identities/revisions before copying the single-snapshot proof loader.
Retain failed-import isolation and explicit publication; consistent multi-query
reads need a pinned revision or suitable transaction isolation.

PostgreSQL hosting, deployment, embedding provider, vector index and detailed
retrieval design remain open. RAG does not require a second canonical database;
start from source-backed SQL/document retrieval and justify optional search/vector
projections separately. Neo4j, workbench workflows and generative UI proposals
are outside this storage decision.

Sources: [PostgreSQL constraints](https://www.postgresql.org/docs/18/ddl-constraints.html),
[Drizzle constraints](https://orm.drizzle.team/docs/indexes-constraints),
[Drizzle transactions](https://orm.drizzle.team/docs/transactions),
[MongoDB reference consistency](https://www.mongodb.com/docs/manual/data-modeling/data-consistency/).

## Scope update: prioritize application persistence

The user directed us to keep ingestion as fixable local tooling and prioritize the
application persistence layer. This supersedes the proposed snapshot-catalog milestone.
Implemented: canonical typed relational tables, reviewed migrations, Docker PostgreSQL,
API-owned lazy connection/pool lifecycle, namespace-scoped evidence access and a minimal
transactional CLI. Original source files are versioned; typed business tables represent
current records. Conflicting incoming IDs reject rather than silently overwrite.

Full snapshot publication/history, comprehensive ingestion recovery, automatic reference
replacement and source-mutation tracking remain deferred. These are not needed to start
application repositories. Domain calculations, interpreted corrections, chat persistence
and authorization remain subsequent application work. See docs/storage.md for exact
commands and limitations; the earlier nine-scenario proof above remains historical evidence.

## pgvector setup

The user explicitly requested pgvector. Enable vector through a reviewed migration and
build pgvector0.8.7 on the same pinned PostgreSQL18.6 Alpine base used by the existing
local volume. This keeps PostgreSQL/libc/collation versions and the local URL unchanged;
it avoids switching the existing volume to a different distribution's image. The source
archive is checksum verified and compilation uses portable flags in a separate build stage.

For a fresh compatible database, change each process's DATABASE_URL, apply migrations,
import the dataset and verify. A URL change alone transfers no data; ingestion restores
original files, while application-created state requires backup/restore. Embedding model,
dimensions, production embedding tables and retrieval logic remain separate decisions.

## Document embedding implementation

The user authorized embedding work and explicitly excluded retrieval. Selected
OpenRouter `openai/text-embedding-3-small` with 1,536 dimensions, following live
credential/batch/PostgreSQL compatibility checks. API-owned Drizzle tables store
immutable profile configuration and document/source/profile generations with exact
chunk text, UTF-16 offsets, hashes and vectors. No vector search index or API query
embedding is added here.

The independent `apps/ingestion` indexing command reads committed documents and
publishes complete per-document generations atomically after provider calls.
Reruns skip completed keys; bounded provider retries and a session advisory lock
keep the local tool simple. New Markdown is registered as a reference with scope
inherited from its directory, retaining known manual/report classifications.

A strict FK to the selected document/source version prevents stale or mismatched
publication. Existing source replacement remains explicitly unsupported; a future
revision workflow must remove derived generations or add a document-version ledger
before changing selected sources. Original source versions are never deleted by
indexing. See [embedding operations](../document-embeddings.md).
