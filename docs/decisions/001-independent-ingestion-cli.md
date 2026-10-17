# Independent ingestion CLI

Status: boundary accepted by the user on 17 October 2026. A local PostgreSQL loader and the API-owned
Drizzle persistence foundation are now implemented; see [storage setup](../storage.md).
Historical disposable experiments remain in ignored `.context/ingestion-cli/`.

## Decision and rationale

Place the executable directory importer in `apps/ingestion`, owned by the backend
branch. It is a one-shot CLI application with its own package, dependencies and
configuration. It accepts an explicit data directory and connects to the selected
PostgreSQL database (see [ADR003](003-postgres-drizzle-storage-ownership.md)) without starting the HTTP server.

Ingestion is a backend responsibility, but its lifecycle differs from answering API
requests. The final challenge data arrives as a directory in the final two hours and
must be loaded alongside the sample. An independent CLI can inspect, import, verify
and retry that work without an API route, server process or frontend dependency.

Turborepo explicitly classifies CLI applications as application packages, commonly
under `apps/`, and recommends that applications be terminal nodes in the package graph.
Our workspace already discovers `apps/*`; no additional top-level `tools/*` convention
is needed. `packages/` also supports tooling, but `apps/ingestion` expresses this
tool's independent executable role.

Sources: [package types](https://turborepo.dev/docs/core-concepts/package-types),
[repository structure](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository).

## Boundaries and consequences

- `apps/api` owns the HTTP service and agent runtime; `apps/ingestion` owns directory
  parsing, structural validation and import orchestration. Neither imports the
  other's source. Running ingestion requires no API/frontend process.
- Use the API-owned Drizzle schemas/client through the backend-only
  `packages/db` when both apps consume it, as recorded in ADR003. The earlier MongoDB
  proposal is superseded. Keep wire contracts browser-safe in `packages/contracts`.
  Package extraction does not make server code available to the browser.
- Give the CLI a package manifest with `private: true` and explicit commands. This
  prevents accidental npm publication; network exposure is determined by routes and
  running services, not folder names or that manifest field.
- Database-writing Turbo tasks use `cache: false`. Keep ingestion out of automatic
  `build`/`dev` execution. Source-level idempotency handles replay; Turbo task caching
  cannot recreate external database state.
- Keep source datasets read-only. Development rehearsals use owned disposable database
  resources and temporary fixtures, with cleanup evidence retained under `.context/`.

Source: [side-effect tasks](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks#performing-side-effects).

## Alternatives considered

An app-local CLI in `apps/api` would need less initial configuration, but would couple
ingestion dependencies and release concerns to the HTTP service. A reusable library
under `packages/ingestion` would suit multiple callers; no such consumer currently
exists. These remain possible future changes if requirements justify them.
