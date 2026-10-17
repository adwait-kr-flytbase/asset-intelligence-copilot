# Shared contract boundary

Keep this the sole shared package until concrete reuse requires another. It contains
browser-safe Zod schemas, wire types and explicitly synthetic fixtures. No React
components, database clients, model execution, domain calculations or env access.

Read `docs/contracts.md` before changing exports. Prefer additive optional fields or
new visual variants; update fixtures and carry the change into both worktrees. Keep
the API and web on the same AI SDK protocol generation. This package exports TypeScript
source: Vite/tsx consume it directly and the API production build bundles it.

Speed first. Add tests only when necessary to protect an important wire boundary.
