# Agent output for the application layer

Implemented backend boundary, 17 October 2026. No new browser contracts or UI components.
The application owner maps this domain data to the shared artifact contract negotiated
with the frontend; the model does not author component values or generated code.

## What the agent returns

`runCoordinator` returns `{runId, text, dataResults, visuals, sources, trace, usage}`.
`text` is the accepted explanation; `dataResults` contains actual successful domain
reads/calculations, independently assembled by the backend. Each result is typed in
`src/agents/results.ts` and has:

| Field | Meaning |
| --- | --- |
| `schemaVersion`, `id`, `runId`, `toolCallId`, `operation` | Version 1, unique result/run identity and the operation that produced it |
| `kind` | `asset-overview`, `analysis`, `operational-records`, or `deadline` |
| `readOnly` | Always true; no operational action was submitted |
| `parameters` | Effective validated tool inputs, including actual selected asset/area and dates |
| `asOf`, `evaluatedAt` | Data cutoff and execution time; neither implies live telemetry |
| `availability` | `available`, `partial`, `unavailable`; inspect payload's specific unknowns and coverage |
| `coverage`, `warnings` | Original coverage and caveats. Null coverage means unspecified, not complete |
| `presentation.preferredKind` | Domain presentation hint, not executable UI or an approved shared artifact |
| `units` | Explicit field units: °C, days, calendar-days, USD, bbl, count as appropriate |
| `sources` | Supporting source IDs, file-version identity, path and locators |
| `payload` | Exact original typed service result; never rewritten from model prose |

Raw decimal strings remain strings. Unknown/empty/zero remain different. A source path
is a reference, not an authorized browser URL; evidence access belongs to the application.
Source IDs identify logical records; `sourceId` identifies the retained source version.
Do not infer full historical evidence closure merely from currently exposed row sources.

## Payloads and intended frontend use

| Kind | Payload fields / semantics | Application mapping |
| --- | --- | --- |
| `asset-overview` | `status`, asset, latest observation, `production` or null, notes, maintenance, rule source, warnings. Production includes delta, threshold and input source IDs. | Status card plus attributed notes/claims; missing measurement is unknown. Existing shared well-status is emitted only for known status. |
| `analysis` | `metric`, rows, window/asOf, coverage, warnings, sources, presentation; spills also has totals. | Metric-specific ranking/table, trend, map or matrix. Aggregate before display limiting; never recompute total from one page. |
| `operational-records` | Maintenance/report links and regulatory events, sources, coverage including later linked follow-ups through asOf. | Evidence chronology, linked reports and incident context. Missing response record is not proof no action occurred. |
| `deadline` | Supplied trigger/rule interval, due date, assessment date, overdue calendar days, due state and input source IDs. `completion: not-assessed`. | Conditional calendar calculation; not an authoritative compliance/breach verdict. Exact hour-based deadlines require timestamp evidence and a separate calculation. |

Analytics tools now use flat inputs with separate scope-specific names:

- `analyzeAssetOperations`: required assetId.
- `analyzeAreaOperations`: required area.
- `analyzeFleetOperations`: whole accessible fleet.

All accept metric, optional equipment/grouping/limit and flat `from`/`through` calendar
dates for historical metrics. Current-status omits dates. All invoke the same existing
AnalyticsService; no guessed well representing an area, nested scope JSON, arbitrary
SQL or independent model arithmetic. The old analyzeOperations name remains recognized
only by the evaluator for historical reports.

## How it reaches the frontend

The independent runtime retains AI SDK UI-message SSE on `POST /api/chat`.
For these domain operations, the ordinary `tool-output-available.output` is now the
versioned AgentDataResult envelope. Read its `kind` and `payload`, not prose or a tool
name regex. Non-domain operations (document reads/search, delegation) retain their
original tool output. `tool-input-available` still gives actual validated parameters.
The final answer and existing `data-visual` well-status use their existing stream parts.
There is no new A2UI wire protocol or uncoordinated shared artifact variant.

Important: source-backed deterministic data can arrive before final answer validation.
If the answer fails, the stream reports error and no successful final narrative is
published. The application may retain independently validated result data while showing
that the explanation failed. It must not present a failed candidate as an accepted answer.
Internal/eval events retain the raw `output` plus optional `dataResult`; model tools still
receive original service data. The application agent can use this seam directly.

## Application responsibilities

Persist owned conversation/run/result state, authorize sources, ignore cancelled/late
runs, and map accepted domain outputs to agreed shared artifacts/citations. Preserve
original results and well labels during refresh. Add durable result IDs/revisions and
calculation provenance through that application service rather than treating an in-memory
run envelope as permanent storage. Frontend rendering stays in its worktree.

Structured data correctness is evaluated separately from narrative quality, invalid
model calls, provider/rate-limit failures and response omissions. Full compliance,
arbitrary correction interpretation, private recall and write workflows remain incomplete.
See README.agent-findings.md and README.evals.md for actual model trials and limits.
