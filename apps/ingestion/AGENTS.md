# Ingestion ownership

Own the independent directory-ingestion CLI. Read root `AGENTS.md`, the dataset guide,
and `docs/decisions/001-independent-ingestion-cli.md` before implementation. The
executable boundary is approved; implementation research lives in `.context/ingestion-cli/`.

- Accept explicit data-root and database configuration. Keep raw sources read-only,
  preserve original values and portable provenance, and report validation failures.
- Keep parsing/import orchestration here. Share MongoDB schemas/access through a
  workspace package only when a second app actually uses it. Preserve the browser-safe
  `packages/contracts` boundary and consume no other app's source.
- Treat published imports as the read boundary. Keep repeats idempotent and source
  overlaps explicit; failed or incomplete imports must not contribute to answers.
- Run independently of the HTTP service. Database-writing tasks bypass Turbo caching
  and run explicitly, outside ordinary build/dev startup.
- Verify with disposable database state and temporary fixtures; retain evidence and
  remove only owned resources. Protect source datasets and existing databases.
