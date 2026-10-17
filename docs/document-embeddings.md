# Document embedding storage and indexing

## Configuration

Put the OpenRouter key in ignored `apps/ingestion/.env`. Keep its `DATABASE_URL`
pointing at the migrated target database. The example file includes the supported
starting profile:

```dotenv
OPENROUTER_API_KEY=your-key-here
OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small
OPENROUTER_EMBEDDING_DIMENSIONS=1536
```

The existing agent runtime separately reads `OPENROUTER_API_KEY` and its chat
`OPENROUTER_MODEL` from `apps/api/.env`. Apps do not read each other's env files.
Never put keys in `VITE_*`, contracts, examples or `packages/db/.env`.
The API now optionally uses these indexed profiles for scoped hybrid document discovery.
Set the same OPENROUTER_EMBEDDING_MODEL and OPENROUTER_EMBEDDING_DIMENSIONS in apps/api/.env
to enable query embeddings; leave them unset for lexical discovery. Exact stored document/report
links remain preferred. Retrieval validates profile/source identity, preserves scope, reports
fallback or incomplete index coverage, and never substitutes top-k hits for exhaustive analytics.
See apps/api/README.agent-output.md for the agent/result integration.

OpenRouter supports this model through its
[embedding endpoint](https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request).
The ordinary API key authenticates embedding requests. The provider may return
`text-embedding-3-small` without the routing prefix; the indexer accepts that exact
alias. The selected model and dimensions are validated; choosing a different
model requires an explicit profile/schema change, not a silent env switch.

## Run

From the repository root, using the pinned Node/pnpm versions:

```sh
pnpm db:up
pnpm db:migrate
pnpm ingest --data-root sample-data --namespace challenge

# No provider calls or embedding writes:
pnpm embed:documents --namespace challenge --dry-run

# Small live run, then complete the remaining documents:
pnpm embed:documents --namespace challenge --limit 8
pnpm embed:documents --namespace challenge

# Future dataset directories: import and embed pending documents in one command:
pnpm ingest --data-root /path/to/new-data --namespace challenge --embed

# Exact portable document ID, not a filesystem path:
pnpm embed:documents --namespace challenge --document fleet/well-types/T200.md
```

Indexing is explicit and independent of HTTP/build/dev. `ingest --embed` chains it
after the import commits, checking the key before importing. A source import failure
never starts embedding. An embedding failure exits nonzero and reports that source
data is already committed; resume with `embed:documents` or replay `ingest --embed`.
Plain `ingest` keeps provider-independent operation.
It reads committed PostgreSQL documents, so it can backfill after a URL change
without reading the directory again. A fresh database still needs migrations and
source ingestion first. Reruns skip completed document/source/profile combinations
and make no provider calls when nothing is pending. `--limit` counts pending
nonempty documents, not already indexed or blank documents. Empty Markdown is
reported and skipped before applying the limit. Missing namespaces fail clearly.

Progress goes to stderr; the final JSON receipt goes to stdout (pnpm/build wrappers
also print their own output). If indexing fails, earlier complete documents remain
usable and the command exits nonzero. Rerun the same command to resume. A provider
failure can require recomputing the current group of up to eight documents; there
is no durable queue or partially persisted vector cache.

## Storage contract

API-owned Drizzle tables live in `packages/db/src/schema/embeddings.ts`:

| Table | Contents |
| --- | --- |
| `embedding_profiles` | Immutable configuration identity: provider, model, dimensions and chunker version |
| `document_embeddings` | Published document/source/profile generation and its expected chunk count |
| `document_embedding_chunks` | Exact text spans, hashes, chunk order and `vector(1536)` values |

Profile ID is SHA-256 of the canonical configuration JSON. The current chunker is
`utf16-window-2000-overlap-200-v1`: at most 2,000 UTF-16 code units with 200-unit
overlap, adjusted at surrogate boundaries. These conservative windows bound input
size without adding a tokenizer dependency. Chunks are exact slices of original
Markdown; offsets are UTF-16 code units, with an exclusive end. No summaries or
synthetic context are substituted for source text.

Generations reference `(namespace, document_id, source_id)` through a composite
foreign key to the selected document version. Chunks reference the complete
generation key; deleting a generation cascades to its derived chunks. Original
source files are retained separately. Scope is inherited through the document's
namespace/asset/kind; it is not duplicated into vector rows. Future consumers must
join that document metadata when applying scope.

This strict selected-version FK deliberately prevents overwriting an indexed
source version in place. The importer already rejects changed existing documents.
A future explicit revision workflow must remove the old derived generation or
introduce a document-version ledger before changing the selected source. There is
no automatic document-replacement command in this milestone.

## Failure and replay behavior

- Calls use batches of at most 16 chunks. Document groups of eight amortize requests
  while bounding retained vector memory. Documents over 1,000 chunks fail clearly.
- Network/timeouts, HTTP 429 and server failures retry up to three attempts, with
  bounded backoff and a 45-second timeout per attempt. Other HTTP failures stop.
- Response model, batch count, unique indices, dimensions, finite values and
  nonzero vectors are validated. Raw provider bodies and credentials are not logged.
- Provider calls run outside database write transactions. Publication locks and
  rechecks the source document, then inserts the profile, generation and all chunks
  in one transaction. No failed document contributes partial chunk rows.
- A session advisory lock prevents two indexers for the same namespace/profile.
  Source import uses its existing transaction separately. A source changed between
  reading and publication is rejected, not silently indexed as the newer version.
- This is a local operator CLI. SQL foreign keys and uniqueness protect references;
  generation completeness is maintained by its publication transaction. Avoid
  manually inserting generation rows without their declared chunks.

## Verification

Focused tests cover exact Unicode spans, overlap, provider reordering/retries,
unauthorized errors and malformed/duplicate/zero/wrong-dimension vectors:

```sh
pnpm --filter @repo/ingestion test
pnpm --filter @repo/ingestion typecheck
pnpm --filter @repo/ingestion build
```

Disposable database evidence under ignored `.context/document-embeddings/` covers
fresh/repeated migrations, new Markdown discovery/scope, dry run, provider and SQL
failure rollback, source/namespace constraints, exact stored spans, complete counts,
concurrency, additive imports, empty-file bounded replay and changed-source rejection.
Owned temporary fixtures and PostgreSQL containers are removed after verification.
Earlier live credential checks used synthetic text and temporary vectors. Corpus
backfill results are recorded separately; these checks do not establish retrieval
quality, and no Mem0 dependency is required for embedding storage.

## Current sample backfill — 2026-10-17

The live `challenge` database contains **1,514 published document generations and
3,057 embedded chunks**, using the configured OpenRouter key and the selected
1,536-dimensional model. Every generation has its complete declared chunk count;
every chunk's source span/hash and vector dimension/nonzero norm were verified.
The source audit still matches all 880,507 original values; all 48 foreign keys
have zero orphaned references.

The profile ID reported by the CLI is
`0911261bfb47befe40f17ff4ccf7e6f7f3e6e3c79ecd011d927dafdeca5f32db`.
Consumers can read its configuration from `embedding_profiles`; document scope
comes from joining `documents`, and citation offsets use the exact stored Markdown.

A full rerun with `OPENROUTER_API_KEY` explicitly unset reported zero pending
or indexed documents/chunks, proving completed replay needs no provider access.
The built CLI's dry run also passed. Three focused tests and 17 disposable DB
scenarios passed; owned temporary containers/fixtures were removed. Evidence:
`.context/document-embeddings/{current-db-audit.json,source-audit.json,disposable-results.json,backfill.log,replay.log}`.
This milestone implements embedding storage/indexing only; retrieval remains separate.

The combined `ingest --embed` path was additionally tested with new synthetic Markdown
and real OpenRouter calls on a disposable database, including replay and missing-key
preflight. Source imports remain committed if a later indexing step fails.
