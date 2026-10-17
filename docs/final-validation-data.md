# Final validation dataset

The application, ingestion CLI and database tooling now use local PostgreSQL database
`asset_final_validation_20270115`, namespace `challenge`, on the pgvector server.
The validated target was activated after the user requested the application switchover.
App-local ignored env files and checked-in examples point to this database.
No sample conversations or saved views were copied. The release dataset itself
includes revised versions of the original200 wells.

The retired `asset_intelligence` database is retained for rollback and is no longer
used by normal application/ingestion/database-tooling commands. Original input
directories remain unchanged.

## Dataset and clock

Use `test-data/dataset` as the ingestion root. Keep `test-data/README.md` and
`test-data/final-questions.md` outside operational evidence. The release specifies
15 January2027 as “today”; the active application and validation checks use
`APP_AS_OF=2027-01-15T23:59:59.999Z` so records throughout that day are included.
The date is pinned to the release clock rather than the host clock.

The loaded dataset has600 assets,7 areas,6 teams,27 users,3 well types,
125,198 inspections,17,415 maintenance records,1,887 context notes,
328 regulatory events,3,076 equipment records and4,449 Markdown documents.
All7,451 retained source files match the input bytes.

## Required schema changes

Migration0004 permits `plugged` recorded status and `data_correction` context notes.
Both correction types require an inspection target, with the existing same-asset
foreign key. Asset area and team now have independent foreign keys: the release
allows a well’s team to differ from its area’s team. Other foreign keys and checks
remain enforced. The active validation database has all five migrations, including0004. The retired database remains unmigrated.

The loader validates optional type/team histories, decommissioning dates, late-entry
timestamps and cost revisions, while retaining their complete original JSON and exact
numeric lexemes. Field corrections retain field/original/corrected values in raw JSON;
ingestion does not rewrite inspections or apply interpretation rules.

## Local operations

Credentials remain in the existing ignored package/app env files. The local helper
`.context/final-validation/run-target.py` derives an isolated target URL in memory
and sets the validation namespace/clock only for its child process. It never writes
or prints a credential or changes any env files. From the repo:

```sh
python3 .context/final-validation/run-target.py pnpm db:migrate
python3 .context/final-validation/run-target.py pnpm ingest --data-root test-data/dataset --namespace challenge
python3 .context/final-validation/run-target.py pnpm embed:documents --namespace challenge
python3 .context/final-validation/run-target.py pnpm db:check
```

This helper is local evidence under ignored `.context/`, not a distributed application
entrypoint. Standard CLIs accept an explicit `DATABASE_URL` for other installations.
The normal app, Drizzle Studio and import commands now target the validated database.
No original source directory has been deleted.

## Verification

Retained local evidence is in `.context/final-validation/`: import/index receipts,
byte/hash manifest audit, constraint rejection probes, API pagination/search/map reads
and validation-only clock checks. API smoke uses in-process Hono requests without
starting another server, calling a model or populating conversations/views.

Final indexing completed:4,449 documents /8,946 chunks,1,536 dimensions,
OpenRouter openai/text-embedding-3-small. Every stored chunk matched its exact
source span and SHA-256, generations had complete sequential chunk counts,
and the final dry-run reported zero pending documents.

Docker stopped during indexing with a disk-space error. Normal PostgreSQL crash
recovery preserved both databases; source audits were repeated successfully. Before activation, the retired database retained its source fingerprint and4 migrations;
the active validation database has5.
