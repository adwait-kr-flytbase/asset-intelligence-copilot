# Development and worktrees

## Independent startup

Run `pnpm install --frozen-lockfile` in each worktree. Node/pnpm versions and command
reference are in [README](../README.md). Worktrees have independent app files,
`node_modules`, env files and process ports; pnpm's download store can be reused.

Frontend only:

```sh
pnpm dev:web
```

Backend only:

```sh
pnpm dev:api
curl http://127.0.0.1:3003/api/health
```

`pnpm dev` runs web and the persisted application API through Turbo. The frontend
always uses `/api` through Vite's proxy; the default target is127.0.0.1:3003.
See [frontend guide](frontend-fieldwork.md) and [application API](application-api.md).

## Local settings

Copy app-local `.env.example` files when provisioning a worktree. PostgreSQL must be
migrated/imported and the API requires DATABASE_URL, APP_NAMESPACE, APP_SESSION_SECRET
and chat provider settings. There is no frontend fixture mode. Connection failures
stay visible; do not seed fake answers to hide unavailable services.

WEB_PORT and APP_PORT select distinct strict ports; VITE_API_TARGET points the UI at
the chosen application API. VITE_* values are public; provider secrets stay server-side.
Shell env overrides Vite/dotenv file defaults. Example: `WEB_PORT=3100 pnpm dev:web`.
For custom browser ports add the exact origin to APP_ALLOWED_ORIGINS.

## Branch from the shared baseline

After the foundation is committed on main, run from the main checkout:

```sh
git worktree add -b feat/frontend ../asset-intelligence-frontend main
git worktree add -b feat/backend ../asset-intelligence-backend main
```

Frontend owns `apps/web/`; backend owns `apps/api/`. Both receive root plumbing and
`packages/contracts/` at the shared baseline. Keep changes to these shared surfaces
small and additive, communicate their commits, and cherry-pick a shared commit into
the other branch when needed. Do not cherry-pick the entire UI branch just to get a
schema addition. App-specific manifest changes can live with that app's work; regenerate
the lockfile after a merge conflict with `pnpm install`, then inspect its diff.

Each worktree's ports must be unique if it starts the same service. A frontend-only
worktree can talk to a backend-only worktree using `VITE_API_TARGET`.

Ignored `.context/`, local skills, env files and `sample-data/` do not appear in new
worktrees. Reinstall optional task tooling there if using it. Keep research under
that worktree's `.context/`. The backend can share the main checkout's dataset via
a local symlink; for the example directory names above, run from the backend worktree:

```sh
ln -s ../asset-intelligence-copilot/sample-data sample-data
```

Use this only if `sample-data` does not already exist. Treat the source dataset as
read-only and keep derived stores separate. The scaffold itself does not read it.

## Ready-to-start checklist

The segregation and startup plumbing are already in place; no additional framework
setup is needed before starting two branches. Per worktree:

1. Create its branch from the latest committed `main` and run
   `pnpm install --frozen-lockfile` there.
2. Start the agent with that worktree as its working directory; read root instructions
   and the assigned app's `AGENTS.md` / `CLAUDE.md` before edits.
3. Run the owned app (`pnpm dev:web` or `pnpm dev:api`), or `pnpm dev` for both.
   Web operational screens require the configured application API; no fixture mode exists.
4. For backend ingestion, link/provision the ignored dataset. Add credentials only
   when model integration needs them. Future local stores must be separate for any
   concurrently writing backend worktrees.
5. Share focused additive contract commits and the resulting fixtures. Each branch
   can change its own manifest; the single root lockfile remains a coordination point.

The real agent, database and Fieldwork UI now have explicit application boundaries. A worktree still contains both apps; ownership is a working
convention, not a filesystem access restriction.

## Fast verification

Run `pnpm typecheck` and `pnpm build` after meaningful setup changes, plus a targeted
startup/browser/request smoke check. `pnpm lint` checks formatting; `pnpm format` fixes
it. Existing `pnpm test` covers a few important request/schema boundaries. Add tests
only when necessary and important; prioritize speed over coverage or harness growth.

Dependencies are pinned with one lockfile. pnpm 11 policy lives in
`pnpm-workspace.yaml`, including the explicit esbuild install-script allowance and
version-specific release-age exceptions created for this baseline. Use `pnpm install`
after changing a manifest; scripts deliberately fail on stale dependencies rather
than silently installing them. CI installs frozen dependencies, lints, typechecks,
runs the existing small boundary checks and builds.

## PostgreSQL persistence

See [storage setup](storage.md) for the per-worktree Docker database, app-local env
files, explicit migrations, local dataset loader and API connection usage. Fixture
web/API startup still works independently of PostgreSQL.
