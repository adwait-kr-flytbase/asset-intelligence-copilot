# Asset Intelligence Copilot

Oil-field intelligence chat with evidence-backed answers and inline visuals.
This branch supplies the shared infrastructure for independent frontend/backend work.
The current chat demonstrates **synthetic fixtures**, not a real agent or dataset answers.

## Start

Use Node **22.22.3** (`nvm use`) and pnpm **11.20.0** (pinned in `package.json`).
If needed: `corepack enable` then `corepack prepare pnpm@11.20.0 --activate`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Web: http://127.0.0.1:3000 · API: http://127.0.0.1:3001/api/health.
The web defaults to browser-local fixtures; send any message to see the synthetic card.
No model keys, database or dataset are required for fixture mode.
For PostgreSQL persistence and loading sample data, follow [storage setup](docs/storage.md).

| Command | Purpose |
| --- | --- |
| `pnpm dev:web` | Frontend only, independent of backend |
| `pnpm dev:api` | Backend only, independent of frontend |
| `pnpm lint` / `pnpm format` | Check / fix formatting and lint |
| `pnpm typecheck` | Check workspace types |
| `pnpm build` | Build deployable web assets and API |
| `pnpm test` | Small existing setup-boundary checks |
| `pnpm check` | Lint, types, existing checks and build |
| `pnpm --filter @repo/api start` | Run built API; requires `pnpm build` first |

**Speed is the priority. Add tests only when necessary and important.**

## Read next

- [Documentation index](docs/index.md): requirements and engineering pointers.
- [Development and worktrees](docs/development.md): independent branches, env and ports.
- [Architecture and ownership](docs/architecture.md): what each app owns.
- [Wire contract](docs/contracts.md): shared schemas and streaming integration.
- [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md): agent entrypoints and delivery rules.

Research/plans are local under `.context/`. `sample-data/` is also ignored and must
be shared or provisioned separately in another worktree.

The persisted application API runs separately with `pnpm dev:application` (port 3003).
See [application API](docs/application-api.md) for persona sessions, chat, pagination,
evidence, saved views and map-ready responses.
