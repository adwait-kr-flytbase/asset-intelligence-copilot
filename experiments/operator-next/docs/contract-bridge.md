# Agent and backend integration boundary

The existing detailed backend handoff remains at `experiments/generative-ui-lab/docs/backend-handoff.md` (see that lab's docs directory if the handoff filename changes). This standalone prototype retains its artifact and evidence schemas in `src/contracts/artifact.ts` and `visual.ts`. No shared package changed.

## Transport

- `GET /api/health`: `{status:'ok', mode:'fixture'}`.
- `GET /api/assets`: runtime-validated asset directory.
- `POST /api/chat`: `{requestId, parameters, messages}`. AI SDK UI-message SSE emits optional correlated `data-progress`, text, then validated `data-result: AgentResponse`. The current demo receives the latest textual request only; durable conversational context belongs in the backend when integrated.
- `POST /api/views/run`: `{requestId, definition, parameters}`. The same read executor returns an `AgentResponse`, bypassing language planning. Saved dataset, kind, metric, predicates and requested presentation stay bound to the approved definition; well/date overrides are explicit.

A result includes `schemaVersion`, request correlation, answer, optional citations, zero or more validated visuals, resolved parameters, intent and visible fixture mode. Every visual has a run/result identity, artifact revision, read-only status, artifact, evidence, as-of/evaluation/revision/timezone/completeness metadata and warnings. This prototype uses the request UUID as the run correlation. New reads must issue new identities; expansion and local filtering preserve identity.

`ReadParameters` carries dataset binding, optional area/top-N/status/spill/obligation predicates, `wellId`, optional `wellIds` for an explicit subset, optional bound ranking metric (`repair-cost`, `downtime`, `spill-volume`) and an ordered date range. Parameters must reflect the records actually read. Do not relabel a cached result for new parameters. Empty data and missing values must retain their meaning. Units and axes are explicit. Corrections point to the original record, carry before/after/reason/impact and never imply a write occurred.

## Required guarantees for a real agent

1. Authorization and tool execution happen server-side; browser schemas do not grant permissions. Never stream executable generated code, SQL or arbitrary component imports as UI.
2. Tools return typed records, calculations, scopes, units, data freshness and source locators. The agent selects an approved artifact; frontend validates before rendering.
3. Every claim and displayed datum must resolve to evidence included in that result. Calculated evidence closes over input evidence. Conflicts, nulls, uncertainty and private/shared visibility remain explicit.
4. Fresh saved reads use the same authorized tools/calculations as chat. Persist recipe versions and validated parameters rather than old narratives. Revisions and as-of times come from real data, not rendering time.
5. Production estimates, downtime rules, repair costing, regulations and contradictory human statements require domain tools, not visual heuristics. Example questions are a capability floor, not a finite intent list. Unsupported tools produce an honest answer, not an unrelated chart.
6. Writes are a separate proposal/approval/commit lifecycle with audit identity, concurrency/version checks and authorization. This demo deliberately exposes no commit endpoint. Saving a personal view is not publishing shared knowledge or accepting a correction.
7. Cancellation and late-response rejection protect the active investigation. Existing results remain intact after failure. Conversation histories and saved recipes need authenticated persistence before real enterprise use.

The comparison with Google/ChatGPT informed the interaction model. It does not change these guarantees. AI SDK handles message transport; the application owns the typed evidence/artifact contract. Adopting A2UI later would require a compatible producer and adapter, not merely installing a renderer.

Local sample additions are optional geo point temperature-difference/threshold, recorded status, reason and inspection identity fields. They retain point-specific source IDs. Scope/geometry limits accommodate 200 assets; evidence/reference limits are bounded at 1,000. These additions are documented compatibility snapshots only. A real shared-contract change needs deliberate frontend/backend coordination. See question-coverage.md for incomplete memory/write/compliance scenarios.
