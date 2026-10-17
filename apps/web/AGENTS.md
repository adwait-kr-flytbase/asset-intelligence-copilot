# Frontend ownership

Own this app's UI, routing, query cache, chat streaming client, fixtures and visual
renderers. Read root `AGENTS.md`, `docs/contracts.md` and `docs/development.md` first.

- Prioritize speed; tests only for necessary, important behavior. A build and brief
  browser smoke check usually suffice for scaffold changes.
- Run `pnpm dev:web` from the root. Default fixture mode needs no API, credentials
  or dataset. Live integration uses app-local env configuration and Vite's proxy.
- Maintain the Vite-generated React/TypeScript setup; scaffold additions with the
  relevant official tooling. TanStack Router uses code-based routes initially to
  avoid generated routing files while this app is small.
- Keep React components and UI-specific types here. Import shared wire schemas/types
  from `@repo/contracts`; never import `apps/api` or backend-only libraries.
- Extend fixtures alongside additive wire changes so the UI branch keeps working
  independently. Never make a fixture look like a real operational answer.
- Render only supported visual types with validated data and evidence. No arbitrary
  generated executable JSX/HTML. Query owns ordinary API state; AI SDK owns chat.
- Keep private identity/history scoped when user switching is implemented. Current
  hardcoded fixture user and conversation are temporary demo plumbing, not memory.
