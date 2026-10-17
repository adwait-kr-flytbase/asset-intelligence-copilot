# Fieldwork — a fresh operator workspace

Standalone React prototype, built from the official Vite React TypeScript scaffold. It does not import or modify `apps/web`, `apps/api`, shared packages. The earlier generative UI lab has been retired; its useful backend handoff and contract examples are retained here.

```sh
cd experiments/operator-next
pnpm install
pnpm dev
```

Open http://127.0.0.1:3400 (Hono fixture API: port 3401). Both bind to loopback; ports are strict so an existing process is never silently replaced. Node 22.22.3 / pnpm 11.20.0 used for verification. The nested workspace and lockfile isolate dependencies from root tooling. `pnpm dev` starts and stops both services.

```sh
pnpm typecheck
pnpm test:critical
pnpm build
```

## What to review

The first visit runs a labelled example investigation. Start a new conversation for the minimal entry screen. Ask for a field map, well temperature history, repair costs, downtime, an inspection matrix, compliance obligations, asset history, conflicting observations, or a correction review. Status/explanation questions can return a cited answer with no new visual.

- One conversation, compact interactive results, expandable into a focused working surface. Expanding never runs the pipeline again.
- Assets and explicitly Saved views have their own destinations. Conversations and recipes persist locally in this browser.
- Select an asset in a map/table to scope a follow-up; remove its context chip to ask more broadly. Focused follow-ups retain the result's scope; explicit asset/all-well requests can override it.
- Source controls open record excerpts and metadata attached to that exact result. Calculations link to their input evidence. Missing data and conflicts remain visible.
- Save view is deliberate. It stores a named kind, metric and scope recipe, not a previous answer. Opening it, applying parameters, or refreshing reads fresh synthetic records. Historical results remain unchanged. `Run <exact saved name>` invokes the saved recipe directly; other prompts take the chat pipeline.
- Correction proposals are read-only. There is no operational mutation, fake approval button, live microphone or background write.

## Implementation boundaries

React / Vite, TanStack Router + Query, AI SDK UI-message streaming, Zod runtime validation, Hono/Node and Leaflet. Manrope is bundled locally. Basemap tiles come from OpenStreetMap and require network access; record/marker fallback remains available if tiles fail. No provider keys are needed. Use the header dataset selector to switch between the six-well synthetic demo and the local 200-well sample dataset. Sample reads load source files server-side without copying or modifying them. Set `SAMPLE_DATA_DIR` server-side if the local dataset lives elsewhere; without it, sample mode reports unavailable and synthetic mode remains usable.

The backend is a deterministic **synthetic fixture executor**, not a model. Its prompt routing is a demonstration boundary, not a general language-understanding solution. A separate read-only adapter retrieves the local sample dataset and linked documents. It does not calculate production volumes, establish legal compliance, authenticate users, persist shared knowledge or change field records. Compliance is explicitly a partial evaluator; memory/correction workflows are integration gaps, not completed scenarios. Unknown/unsupported requests disclose that limitation.

`src/contracts/` copies the canonical lab artifact/evidence schema as a compatibility snapshot; it is not a new shared public contract. Eight approved renderers cover geo, series, ranking, matrix, obligations, timeline, claims and correction. The new backend supplements fixture sensor readings explicitly labelled invented, preserves nulls and record identity, and supports genuine well/date filtering. See [contract bridge](docs/handoff/contract-bridge.md) before connecting a real agent.

`src/workspace.tsx` owns session/request lifecycles and deliberate persistence; `components/AgentRequest.tsx` owns the streamed request; `components/WorkspaceUI.tsx` owns result frames, focus, evidence and Save; `ArtifactView.tsx` / `GeoView.tsx` own typed local interactions. The three page modules live in `src/pages/`; further component extraction should follow actual shared behavior. Local storage is browser-local, not secure enterprise persistence or backend memory.

See [question coverage and gaps](docs/handoff/question-coverage.md), [location and thermal design](docs/handoff/location-and-thermal.md), [research and source distinctions](docs/handoff/ux-research.md), [product decisions](docs/handoff/product.md), and [visual direction](docs/handoff/design.md). This implementation applies compact-to-focus product patterns; it does not embed vendor apps or demonstrate A2UI interoperability.

The detailed [backend-agent handoff](docs/handoff/backend-handoff.md) and `scripts/validate-backend-handoff.ts` were preserved when retiring the previous demo. The validator uses the existing `server/fixture-snapshot.json`; its artifact and evidence data match the earlier examples (only obsolete proposal warnings were updated). Run `pnpm exec tsx scripts/validate-backend-handoff.ts` to verify the handoff examples.

**Complete handoff:** [start here](docs/handoff/README.md). All current architecture, decisions, components, contracts, research, validation and integration gaps are collected in that one folder.
