# Local ingestion CLI

A small independent backend tool that reads a supplied dataset directory and writes
through API-owned PostgreSQL/Drizzle schemas in `@repo/db`. Run it without HTTP/UI:

```sh
# From repository root, after configuring apps/ingestion/.env and applying migrations:
pnpm ingest --data-root sample-data --namespace challenge
```

Relative data roots resolve from the invoking directory (`INIT_CWD` under pnpm).
Absolute paths also work. See [storage setup](../../docs/storage.md) for configuration,
schema ownership and application usage.

Known shapes are validated; raw JSON, exact UTF-8 files and source versions are
preserved. One transaction keeps partial imports out of reads. Identical records can
be replayed, new IDs added, and changed existing values rejected without overwriting.
The local implementation intentionally plans in memory and has no service endpoints,
snapshot catalogs or general reference-replacement policy. Fix/extend it in-repo when
new directory edge cases require it. Keep source data stable while importing.
