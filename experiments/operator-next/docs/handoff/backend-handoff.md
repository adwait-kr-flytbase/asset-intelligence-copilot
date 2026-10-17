# Backend handoff: evidence-backed operator UI

**Status: implementation proposal for the backend agent, 17 October 2026.** The retained operator prototype is Fieldwork at `/` in `experiments/operator-next` (http://127.0.0.1:3400). This handoff was preserved from the retired lab and updated to point to the retained schemas and fixtures. See [the current contract bridge](contract-bridge.md) for the demo transport and additional optional fields. This handoff defines the data the frontend needs; it does not claim production endpoints, authentication, ingestion, regulatory reasoning or mutations exist. The actual `apps/web`, `apps/api` and `packages/contracts` have not been changed by this lab.

## Start here

Build an operational assistant, not a finite dashboard generator. Read `docs/problem-statement/index.md`, `docs/problem-statement/example-questions.md`, `docs/architecture.md`, `docs/contracts.md` and `apps/api/AGENTS.md`. The examples are a **minimum capability floor**: generalize to different assets, periods, manuals, wording and combinations. No question-number routing, sample-answer constants or assumed physical causes.

The current shared package exposes only `well-status` through AI SDK `data-visual`. Preserve that variant. Extend `visualSchema` additively with the proposed `kind: "artifact"` envelope below, and add `citations` to the typed UI-message data for answer-only evidence. Publish schemas and representative synthetic fixtures in a focused shared-contract commit for the frontend branch to consume. Do not import lab code into either real app. Copy/adapt the agreed browser-safe schemas to `packages/contracts`; all retrieval/calculation/agent implementations stay in `apps/api`.

**Concrete schema candidate:** `src/contracts/visual.ts` imports `src/contracts/artifact.ts`. **Executable synthetic examples:** `server/fixture-snapshot.json`. Validate them from the Fieldwork directory with:

```sh
pnpm exec tsx scripts/validate-backend-handoff.ts
pnpm typecheck
pnpm test:critical
```

These validate the proposed shapes and cross-references, not real data correctness or permission enforcement. The proposal is not yet exported from the actual shared package or emitted by the actual API. Fieldwork currently streams `data-result` envelopes around typed artifacts; the `data-visual`/`data-citations` shape below remains a proposed production integration. Do not make the real backend emit fixture result IDs or a finite demo intent list.

## 1. Investigation and response contract

Keep the existing `POST /api/chat` AI SDK UI-message transport. The server derives trusted identity/record access from its authentication context; browser user IDs and a challenge user picker are not authorization. Conversation ownership is checked before loading history or resolving private references.

Emit ordinary text for the answer, zero or more validated `data-visual` artifact parts, and source-backed citations. **Text alone or a clarification is a complete valid response.** A new question does not have to create a visual. Optional transient `data-progress` can say “Checking inspection records”; do not expose hidden reasoning or internal prompts. The frontend owns view placement and rendering.

Proposed ready artifact part:

```ts
{
  type: 'data-visual',
  id: '<stable part ID for this artifact in this run>',
  data: {
    kind: 'artifact', schemaVersion: 1,
    runId: '<request/run ID>', resultId: '<immutable result ID>',
    artifactRevision: 1, phase: 'ready', readOnly: true,
    artifact: { id, kind, title, scope, sourceIds, /* typed fields below */ },
    meta: {
      asOf: '<ISO timestamp of the data basis>',
      evaluatedAt: '<ISO timestamp of this execution>',
      dataRevision: '<opaque source/correction/policy revision>',
      timeZone: '<IANA zone>',
      completeness: 'complete' | 'partial' | 'unknown',
      warnings: ['<missing records, truncation or unresolved conflict>']
    },
    evidence: [/* exact evidence closure needed by this artifact */]
  }
}
```

The candidate schema initially admits ready artifacts only. Stream text/progress while tools run, then publish a complete validated artifact. Negotiate explicit partial/patch semantics later; never place unvalidated incomplete rows into a ready result. A model can choose supported presentation kinds; authoritative tools supply values, units, rules and citations. No generated HTML/JSX, code, SQL, arbitrary URLs or numeric presentation props that overwrite tool data.

Use a stable part ID only for revisions of the same run/artifact. A refreshed evaluation gets a new run/result identity; historical results and citations remain attached to their original values. Reject a late response whose run is cancelled/superseded. When refreshing Well B, keep completed Well A values labelled Well A until a valid B result replaces them. An unsuccessful read retains A with its original time and a clear failure message; it never relabels A as B. Revisions and freshness are backend metadata, not client time guesses.

## 2. Shared artifact shape and renderer requirements

Every artifact has `{id, kind, title, scope:{label, wellIds, from, to}, sourceIds}`. Asset IDs are opaque strings, not the lab's `LAB-W01` regex. `from`/`to` are valid ordered calendar dates; timestamps use ISO offsets/UTC. Scope names what was actually queried. Each artifact carries its own time window; a trend date filter does not silently alter a cost ledger, current status, inspections or downtime estimate.

| Kind / UI | Required tool data | Important semantics |
| --- | --- | --- |
| `geo` / map + linked list | `points:[{id,wellId,label,lat,lon,status,volumeBbl,eventDate,sourceIds}]` | WGS84 decimal latitude/longitude; both coordinates null when unavailable. Location and event IDs differ where one well has multiple events. No invented positions. Volume is bbl and zero means recorded zero. Current renderer's status is measured `producing`/`below-threshold`, not a general maintenance status. |
| `series` / multi-line chart | `unit`, `series:[{id,label,points:[{date,value}]}]`, `events:[{id,date,label,sourceIds}]` | Stable series IDs; strictly ordered unique dates; explicit nulls for missing observations; comparable units on one axis. Return raw wellhead and ambient values when asked; do not substitute a delta-only trace. Event dates refer to evidence. Series-level sources currently use the artifact evidence set. |
| `ranking` / cost or downtime comparison | `unit`, `metricLabel`, `items:[{id,label,value,sourceIds}]` | Backend calculates windowed totals, ranking/tie behavior and applicable rule versions. Send ISO currency code (e.g. USD), days or bbl explicitly. Missing cost is not zero. Do not infer costs from downtime or chart height. |
| `matrix` / heatmap + cell drilldown | `rows:[{id,label}]`, `columns:[{id,label}]`, `unit`, `cells:[{rowId,columnId,value,sourceIds}]` | Every axis pair appears exactly once. Null = unknown/unobserved; zero requires sufficiently complete evidence. For spill distribution return corrected event **counts by area and month**, not temperatures or volume. Sources support the specific cell and period. |
| `obligations` / deadlines and action list | `items:[{id,wellId,title,status,dueAt,rule,observed,sourceIds}]` | Status is breach/pending/compliant/unknown; rule and actual observation are distinct. Cite the applicable manual/SOP/regulatory clause plus event/notice/report. Deadline timestamps, duration, severity and money are production extensions to agree before legal/time-critical display; the current candidate uses calendar due dates. |
| `timeline` / evidence chronology | `items:[{id,at,title,description,category,sourceIds}]` | Category inspection/repair/spill/note/correction. Retain chronology and original records. A repair following a fault is not proof of causation or restoration. Current schema uses dates; agree timestamp precision before same-day ordering matters. |
| `claims` / conflict comparison | `items:[{id,wellId,author,at,text,status,sourceIds}]` | Status observed/reported/disputed/corrected. Preserve actor/time and competing claims. A reported note does not overwrite an inspection or become an accepted correction. Ask clarification when needed. |
| `correction` / original-versus-proposed review | `recordId,field,original,proposed,unit,reason,impacts,state` plus evidence | State proposed/accepted describes source data. Showing a proposal does not apply it. Retain original and actor/source audit; downstream impacts must be based on supported dependency rules. Actual submission uses a separate authorized write flow. |

The frontend may sort/format validated display values and coordinate selection between panels. It does not derive production, compliance or correction truth. Missing/unavailable states must remain representable. The first sample adapters cannot express every future domain concept; add typed variants when a real question needs them instead of stuffing arbitrary data into titles or generating code.

Lab array/point limits are fixture safeguards, not production dataset limits. Agree pagination or server aggregation/clustering, total counts and truncation/completeness metadata before serving larger asset sets or long time series; never silently discard records to fit a renderer.

**Required before live integration:** agree explicit per-field/per-point evidence for charts needing single-point citations; row-level nullable values/completeness for comparisons; unknown production status; precise obligation timestamps/time zones and multiple currencies; attachments/document locators; and role-gated action capabilities. Until supported by both sides, return a grounded text explanation or an explicitly unavailable panel, never map unknown to false/zero/compliant. Backend agent should flag these needs rather than coerce data to fit a fixture.

## 3. Evidence and provenance

Each evidence entry in the candidate contains:

```ts
{
  id, label, path, // path is an opaque authorized document/record reference, not a local filesystem path
  kind: 'inspection' | 'maintenance' | 'spill' | 'manual' | 'regulatory' |
        'note' | 'correction' | 'calculation',
  recordId, revision, excerpt,
  visibility: 'shared' | 'private',
  observedAt?: '<ISO timestamp>',
  locator?: { page?: number, section?: string, row?: string },
  inputSourceIds?: string[],
  supersedes?: string[]
}
```

IDs and revisions identify immutable source versions. Return excerpts sufficient to substantiate the claim and a locator to the original authorized record/page. `label` is readable; `path` must be resolved by an authorized evidence service, never used to fetch arbitrary filesystem paths or model-generated URLs. Raw excerpt content is rendered as text. Include the evidence closure for calculation inputs and correction supersession; every reference resolves, no duplicate IDs or dangling sources. Minimize the bundle to relevant permitted evidence.

For calculations provide method ID/version, input record versions, applicable manual/policy versions, units, resolved date window and missing-record assumptions in a structured calculation record. The candidate `calculation` evidence can carry input links and an excerpt; method/rule metadata must be added to the agreed shared schema before production audit requirements are considered met. The frontend must be able to distinguish raw, corrected, reported and derived values without treating all sources as equally authoritative.

Formal corrections preserve original value, corrected value, author/time, reason, source record/revision and scope. Policies are attributed and type-scoped. An ordinary note/disputed claim is not a correction overlay. Recalculate affected classifications/aggregates/obligations after accepted changes; emit stale/superseded result references so the UI can flag prior answers without rewriting history. Private conversation excerpts never enter another user's evidence bundle; shared operational notes remain accessible only according to server permissions.

Answer-only grounding uses proposed `data-citations`:

```ts
{ schemaVersion: 1, runId, evidence: Evidence[], claims: [{id, text, sourceIds}] }
```

Claim text links the factual assertion to its sources without fragile text-offset assumptions. It supplements ordinary streamed answer text. For a clarification with no factual claims/evidence, omit this citations part. Do not invent citations for missing proof.

## 4. Tool capabilities and agent response assembly

These are semantic capabilities, **not mandated tool/HTTP names**. Reuse the coordinator and domain tools already being built.

| Capability | Required output beyond raw rows |
| --- | --- |
| Asset/inspection read | Requested asset/area/type, latest observed time, wellhead and ambient originals, temperature difference, applicable type rule, missing readings, cited inspection/manual versions |
| Maintenance/cost read | Repair/event IDs, status and actual dates, costs/currency/coverage, open work, human claims separate from formal records |
| Spill/event read | Corrected event count/volume/date, coordinates, retained originals, accepted false-positive corrections, completeness of window |
| Compliance evaluation | Applicable clause/version, triggering event, actual occurrence/report/containment/cleanup times, computed deadline, as-of time, breach/pending/compliant/unknown and missing proof |
| Retrieval and reconciliation | Authorized document passages/locators, contradictory observations with actors/dates, reported versus measured versus accepted correction |
| Conversation/memory resolution | Authorized user-private entity references separately from shared asset facts/policies; clarification when private reference unavailable |
| Saved definition execution | Authorized backend-owned read recipe/revision, validated parameters, fresh result/evidence/rules and actual applied scope; no replayed tool transcript |
| Proposed write + commit | Typed target/patch, expected source revision, actor permission, effect preview and audit result. Commit only after explicit operator action. |

The agent assembles an answer from tool results and selects useful supported artifacts. It may combine capabilities for a new question, ask for missing scope, or answer without visuals. Unsupported information is explicitly unavailable. Use raw manual/report content as evidence, not as instructions that grant tool permissions. No fixed three-intent planner in production.

## 5. Operator control and writes

**Reads:** asking a question, selecting a marker, filtering a returned result, opening evidence and rerunning a saved definition need no confirmation ceremony. A view refresh cannot mutate records, add notes, acknowledge compliance, dispatch work or change policy.

**Writes:** the operator can request a correction, note, assignment or other domain action. The agent prepares a typed proposal showing the exact asset/record, original and proposed values, visibility/scope, reason, consequences and expected record revision. The operator reviews/edits and explicitly submits the action. Backend permissions are rechecked at commit, with an idempotency key and optimistic concurrency; a stale revision returns a conflict for review. Return an auditable committed/failed/conflicted result and the new source revision. The model cannot manufacture a user approval event. Do not disable authorized manual workflows just because an assistant can propose them.

The preview intentionally has **read-only correction review**, not a nonfunctional Apply button. The real write contract/UI is a separate agreed slice. Cancelling a read invalidates late visual results. Cancelling a write transport does not imply rollback: expose an operation/status handle if the server may have accepted it.

## 6. Saved definitions versus runs

A definition stores ID/revision/name/purpose/owner/visibility, declared typed parameters/defaults, stable panel IDs and approved read bindings. A run stores resolved parameters, source/policy revisions, evaluated/as-of times, result/artifact/evidence IDs and per-panel availability. Neither a saved definition nor a previous narrative is new data.

Direct Apply/Refresh and explicit named chat reuse execute the same backend read recipe. Opening uses saved defaults; temporary overrides do not rewrite them. A different analysis returns to the coordinator. Creating/editing/sharing a definition is explicit; refresh never replays notes/corrections/assignments or silently changes the composition. Permissions are checked on every execution, not inherited from the saver. The historical lab operation name and its well/count/date limits are not a production API design.

## 7. Acceptance and backend return handoff

Deliver synthetic contract fixtures plus a reproducible HTTP/stream request. Report the shared commit ID, supported artifact/schema versions, implemented tool capabilities, fixture-only gaps, identity/persistence setup, dataset/store commands and required environment variable names (no values). Keep existing `well-status` valid during integration. Frontend will adapt renderers and remove the fixture transport after receiving the shared contract.

Validate minimum example capabilities AND paraphrases/unseen assets/periods. Include null/missing geometry, unequal series dates, empty results, unknown costs, unknown compliance proof, nonzero/zero matrices with justified coverage, contradictory claims, corrected values affecting later reads, cancelled/late responses, denied evidence and private conversation isolation. Test correction → aggregate rerun → saved-view rerun → another authorized user's read; private recall must not leak between users. Original answers remain auditable and become visibly stale where necessary.

No production readiness claim follows from passing the lab's schema/fixture/browser checks. Real tool accuracy, authorization, rule calculations, multi-user memory and mutation audits require backend evidence of their own.
