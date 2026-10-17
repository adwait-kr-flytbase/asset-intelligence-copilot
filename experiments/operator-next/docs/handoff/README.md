# Fieldwork — complete frontend and generative UI handoff

17 October 2026. **This folder is the final handoff.** The operator approved Fieldwork and asked to retain it as the only app in `experiments/`. The earlier lab was removed after preserving its useful contract proposal, fixtures, research and decision history. Fieldwork lives in `experiments/operator-next`; its source is outside this documentation folder.

Start with these documents in order:

1. [Product](product.md) and [current decisions](decisions.md): operator goals, approved interaction model, rejected approaches and reasons.
2. [Architecture and data flow](architecture.md): frontend/backend ownership, streaming, request identity, persistence and saved recipes.
3. [Complete component catalog](components.md): every page, shell/dialog component and all eight operational renderers, with code locations and interactions.
4. [Current contract bridge](contract-bridge.md), then [backend-agent handoff](backend-handoff.md): actual demo endpoints versus proposed production contracts, required evidence and operator-controlled writes.
5. [Question coverage](question-coverage.md): all18 scenarios, verified reads and explicit gaps. Example questions are a minimum capability floor; this is not a full benchmark pass.
6. [Location and thermal design](location-and-thermal.md): supported overlays, chart interactions, source requirements and why absent thermal imagery is not fabricated.
7. [Google/ChatGPT UX research](ux-research.md) and [visual direction](design.md).
8. [Run, validate and integrate](runbook.md) and [verification record](verification.md).

## What is delivered

One independent React/Vite application with TanStack Router/Query, AI SDK streaming, Zod contracts, Hono/Node demo services, Leaflet and a self-hosted light visual system. Continuous conversation, browser-local history, an Asset directory, explicit saved views, expandable interactive results, removable asset context, source inspection and failure isolation work on desktop and mobile. Six synthetic wells work without the sample dataset; an optional adapter reads the local200-well challenge dataset without copying or mutating it.

**It is a read-only prototype, not the completed agent/backend.** No live model, authentication, durable private memory, shared knowledge writes, accepted corrections or complete compliance engine is implemented. Its bounded prompt routing demonstrates the UI contract; it is not the final general-language reasoning system. The real app/API/shared contracts were not changed.

## Research and earlier decisions

- `research/` preserves dated technology findings, source links, CopilotKit/A2UI assessments and earlier UX research. Their notes explicitly mark obsolete lab assumptions; current decisions in this folder take precedence.
- `saved-views/` preserves the original saved-view product/backend design inputs and tentative concept JSON. Production concepts exceed the smaller implemented demo recipe.
- `history/` preserves retired lab decision/experiment logs for provenance. Do not use them as current implementation instructions. The old application remains recoverable in Git history, not as a second runnable app.
- Synthetic examples remain in `../../server/fixture-snapshot.json`; the executable validator is `../../scripts/validate-backend-handoff.ts`. Real sample records stay in the ignored repository `sample-data/` directory and are not bundled here.

All required handoff instructions and relevant research are collected here; ignored `.context/` is not needed to understand or continue the retained implementation. Historical research mentions unbundled source captures for audit provenance; primary public links remain available.

Visual references from the verified running app: [desktop map](screenshots/desktop-map.png), [mobile assets](screenshots/mobile-assets.png). They show the approved direction, not proof of production backend readiness.
