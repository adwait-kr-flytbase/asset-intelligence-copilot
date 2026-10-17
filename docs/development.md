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
curl http://127.0.0.1:3001/api/health
```

`pnpm dev` runs both apps through Turbo, but the web still uses local fixtures by
default. No credentials or dataset are required for either scaffold.

## Connect web to backend

Copy `apps/web/.env.example` to `apps/web/.env.local`; change `VITE_API_MODE` to `live`.
Keep `VITE_API_TARGET=http://127.0.0.1:3001` or point it at the backend worktree's port.
Restart Vite after changing env. `/api` requests go through its dev proxy, so local
integration does not require cross-origin browser configuration.

`VITE_*` values are public browser/build configuration; put no secrets there.
`WEB_PORT` selects the dev-server port and `strictPort` prevents silent port switching.
For the backend, copy `apps/api/.env.example` to `apps/api/.env`; dotenv loads it
from the app working directory. `PORT` and `HOST` configure the server. Shell env
overrides dotenv/Vite file defaults.

Example of different ports without env files (macOS/Linux):

```sh
PORT=3101 pnpm dev:api
WEB_PORT=3100 VITE_API_MODE=live VITE_API_TARGET=http://127.0.0.1:3101 pnpm dev:web
```

The API still returns fixture data in live mode until the backend branch implements
the agent. Fixture mode is a frontend transport choice, not a real model provider.

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
