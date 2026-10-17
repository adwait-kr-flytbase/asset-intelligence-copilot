# Read-only evidence runtime

This separate backend entrypoint leaves the existing fixture app, shared contracts,
database schema and dependency manifests unchanged. It uses existing PostgreSQL data
and AI SDK 7.0.143. All operational tools are read-only. It does not implement private
memory, correction acceptance/interpretation, saved-view persistence or specialist
agent loops.

Run with the repository's pinned Node/pnpm versions after the existing database setup
and `@repo/db` build. Commands below run from the repository root unless stated otherwise.

## Start

Keep `DATABASE_URL` in ignored `apps/api/.env` as documented in `docs/storage.md`.
For live requests, add `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` there. No default
paid model is selected. Do not put keys in commands, source files or browser variables.

```sh
cd apps/api
AGENT_NAMESPACE=challenge AGENT_AS_OF=2026-10-17T00:00:00Z pnpm exec tsx src/runtime/index.ts
```

Default port is 3002; choose another with `AGENT_PORT`. Binding is always `127.0.0.1`.
Namespace is required, selected by server configuration and never supplied by model
arguments. `AGENT_AS_OF` is optional; otherwise the runtime fixes the as-of instant at
startup. Restart to advance it. This bounds observation/note/maintenance selection;
it does not provide historical document/correction replay. Documents are the current
imported corpus with immutable original source versions.

This is a local development endpoint, without production authentication or private
persistence. Client `userId`/`conversationId` values do not grant authorization or save
history. Browser Origin requests are rejected until a coordinated UI/API integration.
Use the terminal request below. No CORS or frontend code is changed.

```sh
curl -N http://127.0.0.1:3002/api/chat \
  -H 'Content-Type: application/json' \
  --data '{"userId":"local-demo","conversationId":"one-run","messages":[{"id":"m1","role":"user","parts":[{"type":"text","text":"Is WELL-0001 producing? Explain what the evidence says and any uncertainty."}]}]}'
```

`GET /api/health` reports process mode, not database/provider readiness. A chat request
without model configuration returns 503. The runtime limits concurrent investigations
to two, each with a 60-second deadline, five model steps and twelve executed tool calls.
Disconnect/cancellation aborts provider work; an in-flight PostgreSQL SELECT may finish
under the existing database statement timeout before cancellation is observed.

## Stream and capabilities

The response uses AI SDK UI-message SSE: actual `tool-input-available`,
`tool-output-available`/`tool-output-error`, `source-document`, text and existing
`data-visual` well-status parts. No new shared data variants are introduced. Standard
tool outputs contain rich original evidence and source locators. Final answer and
status cards publish only after the investigation completes and boundary validation
passes. Provider tokens are not streamed incrementally; actual tool progress is.

The coordinator exposes:

- `getOperationalContext`: latest inspection, exact-decimal derived status, attributed
  context/correction evidence and latest ten maintenance jobs/report IDs. History
  truncation is explicit. Future job completion dates remain plans.
- `getApplicableProcedures`: primary manual and SOPs, plus a parent manual when an
  explicit supported inheritance statement exists. Primary production rules win.
- `readEvidence`: original Markdown by exact document/report ID, scoped to namespace.
- `searchEvidence`: bounded PostgreSQL lexical document search with asset/kind filters.
  It is ranked discovery; it cannot establish exhaustive totals or absence of events.

The primary manual's supported production-temperature clause supplies the threshold;
unknown wording fails closed. A formal correction targeting the latest inspection
withholds production until a correction interpreter is implemented, preserving the
original measurement. A correction about a different field can therefore withhold
status conservatively. Ordinary notes never replace readings.

Only production classification is a supported domain calculation in this slice.
Fleet aggregation, downtime, spill correction interpretation, definitive compliance
evaluation and private conversation recall need additional deterministic tools.
The model is instructed to explain these limits. Citation validation checks that cited
IDs were retrieved; it does **not** prove every claim is supported. Live evaluation is
required before treating the model's narrative as reliable.

## Adapter boundaries

`src/evidence/types.ts` defines the consumer-owned evidence read port.
`src/evidence/postgres.ts` owns parameterized SQL; lexical search currently computes
full-text representations at query time and needs no migration. Measure it before
adding a persisted GIN projection or pgvector. `src/evidence/service.ts` owns status
rules and uncertainty. `src/agents/coordinator.ts` owns bounded SDK orchestration.

`src/agents/openrouter.ts` implements a deliberately narrow text/function-call SDK
adapter without dependency changes. It supports `generateText`, text and application
function tools, not reasoning messages, files, provider tools or provider token
streaming. The model ID must support function calling. Keep it replaceable with the
maintained OpenRouter provider after coordinating dependency/lockfile changes.
Generation and a future embedding provider remain independent choices.

## Build and model evaluations

```sh
pnpm --filter @repo/api typecheck
pnpm --filter @repo/api exec tsup --config src/runtime/build.config.ts
```

The standalone build produces `apps/api/dist/agent/index.js`. Start it from `apps/api`
so dotenv loads the app-local environment. The original fixture build cleans `dist`,
so build the standalone runtime afterward when building both.

See [model evaluations](README.evals.md) for real-model trial commands, tool-call and
response metrics, and per-trial reports. Newly added application/HTTP/provider-unit/
DB-smoke tests were removed at the user's direction. Existing foundation tests are
preserved. The only new test file checks the evaluation grader itself.

See [capability roadmap](README.capabilities.md) for how all 18 challenge examples map
to general product capabilities. They are minimum coverage, not hardcoded runtime
questions or the complete acceptance space. Current status/report tools are only the
first slice; the full example set is not implemented or passing yet.
