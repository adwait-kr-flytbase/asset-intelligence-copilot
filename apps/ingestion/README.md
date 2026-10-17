# Local ingestion and embedding CLIs

Independent backend tools that use API-owned PostgreSQL/Drizzle schemas in
`@repo/db`. Run without HTTP/UI, after configuring `apps/ingestion/.env` and
applying migrations:

```sh
pnpm ingest --data-root sample-data --namespace challenge --embed
pnpm embed:documents --namespace challenge --dry-run
pnpm embed:documents --namespace challenge
```

Relative data roots resolve from the invoking directory (`INIT_CWD` under pnpm).
Absolute paths also work. See [storage setup](../../docs/storage.md) and
[embedding configuration and operations](../../docs/document-embeddings.md).

Known shapes are validated; raw JSON, exact UTF-8 files and source versions are
preserved. One transaction keeps partial imports out of reads. Identical records
can be replayed, new IDs added, and changed existing values rejected without
overwriting. The local implementation plans in memory and has no service endpoints,
snapshot catalogs or automatic reference-replacement policy. Keep source data stable
while importing.

## Documents

Fleet Markdown retains its manual/SOP classification; maintenance-linked reports
retain their asset/job links. Other `.md` files (case insensitive) are registered
as `reference` documents. Files under `assets/<asset-id>/` inherit that asset;
other locations are namespace-wide references. Unknown asset directories fail.
This is location-based operational scope, not user authorization or inferred
applicability to a well type. Source text and hashes remain unchanged.

## Embeddings

Use `--embed` to import and then automatically index all pending documents in the
namespace, including new Markdown. The key is checked before importing. Embedding
starts only after the source transaction commits. If provider/indexing fails, the
command exits nonzero and explicitly reports that the data import already committed;
resume with `pnpm embed:documents --namespace challenge`. Omitting `--embed` performs
only directory ingestion and requires no provider key.

The separate indexer reads committed documents, generates bounded overlapping
chunks and uses OpenRouter `openai/text-embedding-3-small` at 1,536 dimensions.
`OPENROUTER_API_KEY` is required for live indexing, not directory ingestion or dry
runs. Reruns skip complete source/profile versions. `--limit 8` bounds pending
nonempty documents; `--document portable/path.md` selects an exact document ID.

Provider calls run outside import/publication transactions. Each document's vectors
and generation marker publish atomically after validating the current source.
Failures preserve earlier complete generations, so rerunning resumes safely.
Chunks retain exact source offsets and hashes in the API-owned schema.

Existing document changes still reject ingestion. A future explicit revision
workflow must handle the selected-version embedding foreign key deliberately.
Retrieval and query embedding are outside these CLIs' implemented scope.
