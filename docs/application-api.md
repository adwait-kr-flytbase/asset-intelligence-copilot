# Application API

The application runtime provides persisted chat, source evidence, deterministic visual
reads, private saved views and map locations over HTTP. It wraps the existing agent;
agent tools, reasoning and domain calculations remain owned by the agent implementation.
Shared browser schemas live in `packages/contracts/src/application.ts`; synthetic renderer
fixtures are exported from `@repo/contracts/application-fixtures`.

## Run locally

Use the pinned Node/pnpm versions, PostgreSQL and the imported dataset described in
[storage setup](storage.md). Apply migrations with `pnpm db:migrate`, configure
`apps/api/.env` using `.env.example`, then run `pnpm dev:application`.
The application binds to `127.0.0.1:3003`; build with `pnpm build:application`.
Point the web app's existing proxy at this port using `VITE_API_TARGET=http://127.0.0.1:3003`.
The Fieldwork frontend consumes these contracts directly; see [frontend guide](frontend-fieldwork.md).
Each persisted chat has an owned `/chats/<conversation-id>` frontend URL.
Normal API dev/build/start commands target this persisted runtime. The agent experiment
remains an independent entrypoint; the live UI has no fixture fallback.

Required application settings are `DATABASE_URL`, `APP_NAMESPACE`, and a random
`APP_SESSION_SECRET` of at least 32 characters. Chat also requires
`OPENROUTER_API_KEY`; model selection uses the existing agent environment settings.
`APP_AS_OF` optionally fixes the evaluation clock for challenge demonstrations;
leave it unset to use the current time. See `.env.example` for port, timeout and
allowed browser origins. Credentials belong in ignored env files.

One application process owns a namespace using a PostgreSQL session advisory lock.
At startup, prior running work is marked interrupted; it is never silently regenerated.
This is a local single-process runtime, without distributed background execution.

## User presses Enter

1. Load `GET /api/session` and the paginated `GET /api/personas`. Select a real imported
   demo user using `POST /api/session/persona` with `{"personaId":"U-201"}`.
   The server sets a signed HttpOnly cookie. This picker deliberately allows demo
   impersonation; it is not production authentication.
2. Create a conversation once with `POST /api/conversations`, body
   `{"title":"North-east operations"}`. Retain its returned `id`.
3. Allocate a stable `requestId` for this submitted turn and send `POST /api/chat`:

   ```json
   {
     "conversationId": "<returned conversation ID>",
     "requestId": "<unique submission ID, reused for network retries>",
     "message": {"text": "Is WELL-0001 producing?"}
   }
   ```

4. The server verifies cookie ownership, admits one active turn per conversation,
   persists the user message and run, and loads bounded owned text history. Browser
   assistant history and browser user IDs are not accepted as agent context.
5. The injected `AgentRunner` gets the application run ID, text history, namespace,
   owner, evaluation time and cancellation signal. The wrapper constructs existing
   evidence/analytics services scoped to the namespace. Agents read through their
   existing tools; the HTTP handler never builds a prompt from all imported records.
6. AI SDK UI-message SSE sends `start` and transient `data-progress` for loading UI.
   Accepted agent outputs are adapted into typed panels and retained source-version
   evidence. The result and assistant message are committed atomically before final
   text, `data-citations`, `data-visual` and `finish` are emitted.
7. Use `ApplicationMessage` with `DefaultChatTransport`. Its custom
   `prepareSendMessagesRequest` should send the application envelope above, rather
   than the SDK's full browser message history. `data-visual` has
   `kind: "application-result"`, `schemaVersion: 1`, and `result`.
   Text is published after validation, not token-by-token before acceptance.

The `X-Run-ID` response header identifies the durable application run. Coordinator
execution IDs are separate, retained as `agentExecutionId` when available. Replaying
an identical completed request returns its saved response without another model call;
reusing its key for different input returns 409. Active/failed/cancelled requests also
return 409 on retry; use a new request ID for an intentional new execution.

Disconnects abort work. `POST /api/runs/:id/cancel` with `{}` explicitly cancels;
`GET /api/runs/:id` reconciles status/result ID after reconnect. A late agent response
cannot publish after cancellation. Runtime capacity and timeouts are bounded; ordinary
list/detail routes do not invoke agents or wait for agent slots.

## Lists, detail and loading

List routes return `{items,nextCursor}`. Pass the returned cursor unchanged as
`after` and preserve active filters between requests. Omitted `nextCursor` is never
used: `null` means the end. Default limit is 30, maximum 100; invalid limits/cursors
return 400. Fetch the first page for initial UI and subsequent pages on scroll.
There are no expensive full-result counts on ordinary lists.

| Route | Data and order |
| --- | --- |
| `GET /api/personas` | Imported demo users, ascending ID; public demo selector |
| `GET /api/areas` | Area centers and asset counts, ascending ID |
| `GET /api/assets?area=NE-07` | Asset summaries and point geometry, ascending ID; optional area ID/name filter and `search` (up to200 characters, literal case-insensitive substring across ID/name/area/well type); filters apply before cursor pagination |
| `GET /api/conversations` | Owned conversation summaries, newest creation first |
| `GET /api/saved-views` | Owned view summaries, newest creation first; excludes definitions/results |
| `GET /api/references` | Owned result IDs, exact entity refs, run/conversation IDs and evaluation times; newest first; excludes result/evidence payloads |

Recent lists use timestamp + ID keyset cursors preserving PostgreSQL microseconds.
Creation order stays stable as existing items change; newly created items appear after
refetching the first page. Timestamp ties do not lose or duplicate records. Asset and
selector cursors are entity IDs. Private queries always include namespace and owner.

`GET /api/conversations/:id?limit=20` returns conversation metadata and its newest
message page in chronological order. Use `before=<nextCursor>` to prepend older
messages; the maximum is 50. Default messages contain text and result IDs in metadata,
without full maps/evidence. Lazy-fetch `GET /api/results/:resultId` when a visual becomes
visible. `includeResults=true` explicitly includes persisted visual/citation parts for
consumers needing full AI SDK message hydration. No model executes on reload.

`GET /api/saved-views/:id` fetches the full definition. `GET /api/results/:id` returns
an immutable validated result. `GET /api/evidence/:id?resultId=...` resolves a citation
only within an owned result. Foreign-owned resources return 404. No raw local file
path is exposed as a download URL and the API does not fetch source paths.

## Deterministic visuals and saved views

`POST /api/read-runs` accepts a `requestId` and one to eight panel descriptors:

```json
{
  "requestId": "read-unique-id",
  "panels": [{
    "id": "status",
    "title": "Current well status",
    "recipe": {
      "operation": "current-status",
      "presentation": "status",
      "parameters": {"scope": {"kind": "asset", "assetId": "WELL-0001"}, "limit": 1}
    }
  }]
}
```

Recipes validate compatible operation/presentation pairs. Supported operations are
current status, asset locations, temperature history, downtime, spills, repair costs and repeat repairs;
non-current operations require `{from,through}` ISO date windows. Scopes are asset,
area or fleet. Limits are bounded to 500. These reads reuse authoritative domain
functions and make no model calls. Results retain coverage/truncation and warnings;
a returned limit is not a claim to represent the complete dataset.

- `POST /api/results/:id/refresh`: `{requestId,parameters?,panelIds?}`; rerun approved
  panel recipes with validated parameter overrides and return a new result.
- `POST /api/saved-views`: `{sourceResultId,name,description?,panelIds?}` or
  `{definition}`; save only approved deterministic recipes.
- `PATCH /api/saved-views/:id`: `{expectedRevision,definition}`; optimistic revision
  conflict returns 409. Historical view revisions remain immutable.
- `POST /api/saved-views/:id/runs`: `{requestId,parameters?,panelIds?}`; execute the
  saved revision and retain that revision on its run.

All three read execution routes return `{run,result}`. A spinner during a deterministic
read is appropriate. Agent slots and deterministic read slots are separate; lists,
sessions, conversation history and saved definitions remain independent of both.
Arbitrary generated SQL, tool names, prompts and executable UI code are not recipes.
Some agent answers have text/evidence only; unsupported bindings cannot be refreshed.

## Maps, precision and evidence

Panels support status, table, ranking, series, geo and matrix. Values carry explicit
units/types, scope/window, coverage and evidence IDs; decimals remain exact strings.
A source missing a measured value stays null/unknown. Matrix holes stay null unless
underlying computation establishes a true zero.

Locations are GeoJSON WGS84 `[longitude,latitude]`, suitable for Leaflet/MapLibre or
other frontend map renderers. Missing/invalid locations have `geometry:null`; never
plot them at zero or at an area's center. A geo feature has distinct feature/event
and asset IDs, timestamp, values and evidence IDs. Multiple events can share a well
location. Optional bbox includes valid points only. Spill markers carry unknown
production status unless independently established. Area centers describe areas,
not inferred well coordinates. Tile styles/providers and rendering belong to the UI.

Evidence includes opaque ID, logical record ID, retained source-version ID, original
path and JSON pointer or JSONL/Markdown line span. Excerpts quote original retained
text, preserve numeric precision and disclose truncation. Sample evidence image
paths are references without supplied image bytes; they are not working image URLs.

## Agent integration boundary

The application provides persistence, request ownership, retained result/entity
references and ordinary HTTP operations. The existing coordinator provides reasoning,
tools, citations and domain outputs through the `AgentRunner` port. Existing accepted
tool results are adapted without rerunning model-selected analytics.

Private reference lists are available, but reference resolution such as “those wells”
inside reasoning still needs an explicit agent context/tool integration. Cross-user
private chat recall is forbidden. Shared corrections/writes, policy interpretation
and additional domain tools remain with the agent owner; session capabilities mark
shared writes unavailable. Mem0 is not required for this application milestone.

## Verification

`pnpm --filter @repo/api test` and `pnpm --filter @repo/contracts test` cover focused
geometry, recipes, exact evidence extraction and contract boundaries. The critical
application integration test is skipped unless `APPLICATION_TEST_DATABASE_URL` points
to a disposable database whose name contains `application_smoke`, migrated and seeded
from sample-data under namespace `challenge`. Run it with
`pnpm --filter @repo/api exec vitest run src/application/application.integration.test.ts`.
It checks pagination/timestamp ties, private ownership, replay/conflicts, server history,
foreign keys, saved views and cancellation including late/disconnected reads.

Verification on 2026-10-17 used a temporary Docker PostgreSQL/pgvector instance, applied
migrations twice, imported sample-data and passed the critical integration check. The
container was removed. A live OpenRouter chat completed in 3.9 seconds with a persisted
status panel and 20 citations; its temporary conversation was removed. Ordinary local
HTTP reads measured 1–3 ms median over 5 samples per route. These are local smoke timings,
not load-test guarantees. Source-file fingerprints and document embeddings were unchanged.

Asset-location maps use `asset-locations` recipes with inventory scope/asset IDs and
geo/table presentation; temporal, equipment and grouping filters are rejected. Existing
location results with trusted asset-location bindings receive replay metadata on read
and save, without rewriting stored evidence. Refresh uses the existing location service
and does not call an agent. Map search and annotation controls are display settings;
saved recipes retain the data scope rather than transient map controls.
