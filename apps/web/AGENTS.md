# Frontend ownership

Own React/Vite UI, TanStack routes/query cache, AI SDK chat transport and trusted
visual renderers. Read root rules, docs/contracts.md and docs/frontend-fieldwork.md.

- Operational data comes only from the persisted application API. No runtime mock
  records, synthetic answer fallback, browser history fixtures or dataset-mode switch.
  Decorative workspace/branding copy may remain static. Never invent values to fit a view.
- Use shared browser-safe ApplicationMessage/Result/Panel/ReadRecipe schemas from
  @repo/contracts. Do not import apps/api, packages/db or experiment/server source.
- Preserve approved Fieldwork styling, continuous conversation, focus/source/save
  dialogs and mobile navigation. Keep charts/maps lazy and ordinary reads independent
  of model work. No arbitrary generated JSX/HTML/SQL or executable view definitions.
- pnpm dev:web runs on3000 and proxies /api to application3003. Start the API separately
  with pnpm dev:application, or use pnpm dev for both. Read each .env.example; VITE_*
  values are public, credentials are server-only. WEB_PORT remains strict.
- Private query keys include namespace and person. Clear/cancel private state on
  identity change and guard late results. The four-role picker is demo identity,
  not production authentication or role-based access control. Shared records have
  equal access; conversations/results/views remain private to the selected person.
- Each persisted chat uses /chats/<id>. New draft/Ask about asset must not reactivate
  an earlier conversation. Keep stable request IDs, server-owned histories, accepted
  result/run identity and cancellation. Sidebar Working labels target the actual chat.
- Paginate growing lists, expose loading/error/end states and lazy-fetch historical
  results. Asset directory metadata does not establish production status/spill totals.
- Keep exact decimals, unknown/nulls, original timestamps and evidence references.
  Shared tools/calculations remain backend authority. Source paths are metadata, not URLs.
- Persist saved recipes through application endpoints; only panels with approved
  recipes can save/refresh. Preserve old scope on failure and show errors inside focus.
- Speed first: focused typecheck/build and meaningful boundary/browser checks. Avoid
  adding scaffolding tests or coverage infrastructure. Add frontend dependencies via
  pnpm --filter @repo/web add; coordinate the root lockfile deliberately.
- Preserve concurrent backend/agent changes. Report any tool/reasoning or schema gap
  without manufacturing mock results. Push needs user direction.
