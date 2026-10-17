# Ingestion ownership

Own the independent directory-ingestion CLI. Read root `AGENTS.md`, the dataset guide,
and `docs/decisions/001-independent-ingestion-cli.md` before implementation. The
executable boundary is approved; local CLI setup lives in `docs/storage.md`.

- Accept explicit data-root and database configuration. Keep raw sources read-only,
  preserve original values and portable provenance, and report validation failures.
- Keep directory reading, parsing, validation and transactional PostgreSQL writes here.
  Consume API-owned Drizzle schemas/migrations/client through server-only
  `packages/db`; do not define parallel database models or import another app's source.
  See `docs/decisions/003-postgres-drizzle-storage-ownership.md`. Preserve the
  browser-safe `packages/contracts` boundary.
- Keep the local CLI simple. Use a single import transaction, reuse identical records
  and reject conflicting incoming values. Preserve source versions; defer snapshot
  catalogs and elaborate recovery. Failed transactions must not contribute to answers.
- Run independently of the HTTP service. Database-writing tasks bypass Turbo caching
  and run explicitly, outside ordinary build/dev startup.
- Verify with disposable database state and temporary fixtures; retain evidence and
  remove only owned resources. Protect source datasets and existing databases.

## Document embeddings

Read `docs/document-embeddings.md` before changing discovery, chunking, provider
configuration or embedding storage. Use `pnpm ingest --data-root <directory>
--namespace <namespace> --embed` to import new sources and then index pending docs.
The plain import remains usable without provider access; `embed:documents` resumes
indexing independently. Keep the key in ignored `apps/ingestion/.env` and update
`.env.example` when configuration changes.

Preserve known manual/report links; register other Markdown with directory-derived
asset/global scope. Keep provider calls after the import transaction commits and
publish each complete source/profile generation atomically. A provider failure
leaves committed source data intact; report that state and resume indexing.
Retain exact source offsets/hashes, replay safety and the selected model profile.
Source replacement needs an explicit revision policy. Retrieval/query embedding
is separate API work, outside this storage/indexing milestone.
