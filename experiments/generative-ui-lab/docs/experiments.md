# Experiments and learning log

## How to record an experiment

Append one entry per meaningful finding:

```markdown
## E## — Question or hypothesis
Date:
Mode: scripted replay / live model / provider stub
Renderer, package/protocol/catalog version:
Question/scenario and relevant controls:
Expected:
Observed:
Evidence: exported record, screenshot or command
Decision/tradeoff:
Limitations:
Retry/change condition:
```

Keep credentials and production data out of artifacts. Preserve failures; label assumptions and proposals explicitly. Do not treat replay success as evidence of model reasoning.

## E01 — Does the installed renderer match the conceptual setup guide?

Date: 2026-10-17. Mode: package/source inspection.

Observed: renderer/core 0.14.0 expose the modern `A2uiSurface`, `createComponentImplementation`, `Catalog` and `MessageProcessor` APIs through v0_9 imports. The installed schema accepts v0.9.1. The high-level guide describes different names such as `A2UISurface` and `useA2UI`, so copying those examples would not implement this package version correctly.

Decision: pin package/wire versions separately and inspect declarations/source before integration. Evidence: manifest/lockfile, `src/renderers.tsx`, targeted browser observation. Limitation: not a full protocol-conformance test.

## E02 — Does a composed answer stay coordinated?

Date: 2026-10-17. Mode: scripted replay, A2UI and direct baseline.

Observed in browser: one attention investigation renders status/table/map/conflicts. Map selection coordinates the table; evidence opens from an A2UI action; area filtering preserves the authoritative result. Renderer switching keeps selection and produces equivalent widget/data output. Downtime adds line/bar charts, including an explicit gap for a missing weekly observation. Spills adds a heatmap with source drilldown.

Decision: application-owned result/interaction state can remain separate from either renderer. This is a promising transfer pattern. Limitation: a small catalog and six synthetic wells do not establish large-dataset or production performance.

## E03 — Is the conversation usable as the canvas grows?

Date: 2026-10-17. Mode: desktop browser observation.

Initial finding: a page-height canvas stretched the conversation column and pushed its composer below the viewport. Change: independent desktop conversation/canvas scrolling; natural document flow on mobile.

Decision: keep question entry reachable during an investigation. Evidence: before/after browser screenshots in the local task packet. This was a usability correction, not a renderer limitation.

## E04 — Can the provider adapter support a real model path without fake reasoning?

Date: 2026-10-17. Mode: localhost provider stub and missing-config path.

Observed: Hono live mode consumes a stub-generated query/view selection and emits the corresponding result/A2UI stream. Targeted checks reject extra calculated values, redact upstream error bodies and abort provider fetches. Unconfigured live mode reports missing configuration.

Decision: keep this live path distinct from scripted replay. Limitation: no actual provider/model run was performed; model quality, provider-specific option support and generation latency are unestablished.

## Next useful experiments

- Configure a real model and ask unseen questions within the three supported queries. Record unnecessary views, omitted context and explicit representation-request adherence.
- Compare model-generated raw A2UI messages with the current validated-plan projection, using identical catalog/data and a measured repair budget.
- Add an actual server action to a new lab experiment only when its authorization/idempotency/correction semantics are specified.
- Try larger result handles, pagination and incremental data updates; retain stable selection/draft state.
- Reevaluate A2UI versus direct composition using engineering effort, failure recovery and portability needs, not replay timing alone.

## E05 — Does Stop remain a cancellation after React updates the form?

Date: 2026-10-17. Mode: browser scripted slow stream.

Failure reproduced: clicking Stop cancelled the active request, but React immediately reused that button as the submit control; the browser's default click action submitted the form again with a fresh run ID. The delayed partial view belonged to that unintended new request, not a run-gate failure. Network and inspector events showed two requests with a cancel between them.

Change: explicitly prevent the Stop click's default action before changing chat state. The browser regression checks both retained results and no extra request after Stop. Lesson: aborting transport and gating stale events are necessary but do not cover form-control lifecycle/default-action races.

## E06 — Can repeated investigations keep request scope bounded?

Date: 2026-10-17. Mode: browser scripted replay.

Decision: preserve visual artifacts locally for rendering/replay; send only the latest user text and current query to the API. The browser checks every exercised request remains below 10 KiB and that failure-injection streams actually receive HTTP 200, preventing a request-size failure from masquerading as successful presentation rejection. This lab does not claim conversational memory from displayed chat history.
