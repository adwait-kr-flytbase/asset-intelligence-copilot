# Verification and limitations

Run the documented typecheck/build/critical checks from the nested project. The build covers both Vite assets and a separately built Hono entrypoint. The targeted Node checks cover canonical presentation/data references, stale-run gating, SDK/Hono request validation, body limits, provider response parsing, missing configuration, error redaction and cancellation using a localhost provider stub.

Browser verification exercises the real lab Hono stream and official A2UI renderer, equivalent direct rendering, evidence actions, filtering/selection, all six required visual families, representation changes, invalid updates, Stop, saved-state restoration, sanitized export, missing provider configuration and desktop/mobile layout. Local finite scripts, assertions and screenshots are retained in `.context/generative-ui-lab/evidence/`; those ignored records are specific to this checkout, not bundled test dependencies.

Known limits:

- All data and rules are synthetic. This is not integration with the real dataset or backend agent.
- Offline generation is scripted. Live adapter tests use a local provider stub; real-model execution is not verified without local configuration and an observed run.
- Live generation produces a small validated query/view plan. The server converts it to canonical A2UI. Raw model-generated A2UI, arbitrary component trees, general query planning and token-level surface generation are separate future experiments.
- The coordinate map has no basemap/tiles. It marks missing coordinates explicitly; it is not a GIS accuracy demonstration.
- Saved investigations are browser-local, versioned synthetic snapshots. Draft notes survive updates but are not persisted/exported. No shared/private production memory, correction persistence or authentication is implemented.
- The canvas retains valid content on rejected updates, but a renderer crash is contained by an error boundary rather than a guarantee of transparent renderer recovery.
- Browser timings include artificial replay delays and are single-run observations. No framework speed/model benchmark or full accessibility audit is claimed.
- Initial combined client bundle is roughly 813 kB minified / 235 kB gzip, including both renderers. The build reports a chunk-size warning. This lab records that tradeoff rather than hiding it; production should evaluate lazy loading/removing experimental paths.
- The dependency audit is a point-in-time check; re-run it when upgrading. A2UI's current Zod v3 peer is a documented lab-only exception to the actual app's Zod v4 schema version.

No production app/API/shared-contract/root-lock edits, push, merge or deployment are part of this delivery.

## Initial lab verification — 2026-10-17

- Typecheck and combined client/API build pass.
- 9 targeted checks pass.
- 39 browser assertions pass in Chromium, including request-count regression for Stop and bounded outgoing chat requests; no uncaught page errors.
- Nested dependency audit reports zero known advisories; no peer dependency issues.
- Scoped Biome check has zero errors; it retains style warnings (mostly CSS specificity/reduced-motion overrides and guarded fixture assertions).
- All tracked implementation changes are confined to this nested lab.

The combined client bundle is 806.11 kB minified / 232.39 kB gzip in this run. Real provider/model generation remains unverified.

## Operator experience verification — 2026-10-17

The current iteration adds complete scrollable message history, searchable/renameable browser-local investigations, exact answer-linked results, explicit refresh, local-filter/request context and mobile conversation/data navigation. Experiment controls remain available in Lab settings. No framework migration or voice feature was introduced.

- 12 critical checks pass, including history link integrity, more than six saved answers, legacy migration, interrupted recovery, rejected references and live context forwarding to a localhost provider stub.
- 34 Chromium assertions cover the operator flow and persistence/recovery: desktop/mobile question access, earlier/latest navigation without requests, full-history reload, separate investigations, search/rename, invalid source/partial cancellation, thread-switch isolation, direct rendering, contextual requests, unsupported scripted input, evidence navigation, invalid storage preservation, explicit recovery and quota failures.
- Typecheck/build and protected-path diff pass; finite evidence is retained in `.context/generative-ui-operator-demo/evidence/`.
- Bounded desktop/mobile screenshots were inspected; the inherited short chat-log height was removed so the conversation uses the available screen. The mechanical design detector reports no findings. This does not establish a complete accessibility audit or field usability study.

Saved history includes prompts on this browser only; sanitized experiment export still excludes prompts and drafts. Completed snapshots are immutable per answer/run. New investigations retain earlier threads. Browser storage can fill: a visible temporary state and notice replace persistence claims if saving fails. Invalid history is retained until explicit recovery backs it up and starts saving new work.

The SDK decision remains open: compare CopilotKit's headless interaction layer using the same operator shell and authoritative results, with AI SDK retained as a compatible backend option. Exact A2UI renderer/catalog compatibility and any managed-history deployment remain unverified. Current live model generation remains unverified without provider configuration.

## Visual-context stability iteration — 2026-10-17

The workspace now stays in place for ordinary subsequent visual answers and three scripted snapshot explanations. Only the first result, an explicit Refresh/Show as table, or opening a result changes it. Accepted partial data no longer replaces an existing canvas. Explanation evidence retains its original snapshot independently of the visible result.

Targeted verification includes 15 critical checks and a finite desktop/mobile Chromium journey covering initial activation, text-only/no-request replies, identical widget DOM instances, preserved scroll/expanded details/filter/selection, offered versus displayed result persistence, explicit switching and representation changes, old explanation evidence, invalid updates, Stop during partial updates and mobile reply notification/reading position. Local evidence lives in `.context/generative-ui-context-stability/evidence/`.

These tests exercise scripted synthetic behavior. The general live-model path still selects a visual plan; the three snapshot explanations are local and labeled as such. Model-selected answer-only behavior, selective component patches and field usability remain separate work. The first-accepted-update timing is not time-to-visible-view when a result is merely offered.

Formal task-factory admission/signoff remains blocked by the preserved unrelated `.gitignore` modification. Actual checks and independent review are retained separately; no clean-worktree gate or merge/deployment success is claimed.

## Continuous chat alternative — 2026-10-17

`/conversation` is a separate comparison page using the same saved messages/results and backend. Finite desktop/mobile verification exercises actual inline A2UI chart/map/table/heatmap composition, append-only historical visuals, selected-well text follow-up, old-result context/evidence, independent per-result controls, current partial surface/Stop, desktop sidebar search/new/reopen/reload, direct renderer, mobile history/composer/overflow and return to the split page with the same chat. Evidence is retained under `.context/generative-ui-continuous-chat/evidence/`.

Current scope restoration is thread-level: non-focused inline filters are session-local. Long transcripts render every historical visual; no virtualization or production persistence is claimed. Comparison links load the other page and may interrupt a pending request. Synthetic data and bounded script/live-model limitations remain unchanged. Formal task-factory signoff remains blocked by the preserved unrelated `.gitignore` edit.

## Final operator preview — 2026-10-17

The isolated `/operator` page passes typecheck, client/API build and 26 critical checks. A finite Chromium journey passes 35 desktop/mobile assertions: unsaved repeat/text-only pipeline calls, explicit Save/cancel, separate definition persistence, same endpoint for named invocation and controls, fresh type-specific reads, pending versus completed labels, independent inspection count/trend dates, empty trends, retained results after failure, selected-well fresh explanations, panel-specific inputs, sources and mobile access. Earlier comparison/recovery suites are retained as regressions. Evidence: `.context/generative-ui-operator-final/evidence/`.

Saved definitions are browser-local approved fixture read recipes; the loopback demo accepts posted definitions. Production requires authorization and backend-owned definitions. The full example-question matrix is an architecture acceptance floor, not an execution pass: general retrieval, compliance, writes/corrections, shared/private memory and broader result contracts remain backend/integration work. No real provider/model quality is established. The client build still reports a large chunk warning (about 853 kB minified before gzip); virtualization/code splitting are future work.

Formal task-factory clean admission remains blocked by an unrelated preserved root `.gitignore` edit. No formal signoff, push, merge or deployment is claimed. Local targeted checks and independent review are separate evidence.

Independent integration review identified ambiguous saved-name aliases. Exact names now take precedence over optional “my” and punctuation, independent of storage order. A focused regression failed before the fix and passes after it; quoted names permit explicit parameter suffixes when a name itself includes a suffix. Saved-storage browser checks also cover quota failure with no false Saved state, invalid content retention and backed-up explicit recovery.

## Operational component expansion and backend handoff — 2026-10-17

Typecheck, client/API build, 38 critical checks and scoped Biome (39 files, zero errors/no fixes) pass. The production bundle retains the existing large main-chunk warning; the geographic component is separately lazy loaded. A finite 27-assertion Chromium journey checks map records/geometry/filters/keyboard/evidence/offline tiles, dual temperature series/toggles/table, currency ranking, saved cost bindings and crosswell fresh reads, obligations, timelines, claims, read-only correction, matrix evidence, mobile composer/overflow and runtime errors. Prior operator35 and continuous24 journeys also pass. One batched visual inspection and one correction/confirmation pass were used. Detector returns no findings.

The handoff validator accepts 8 proposed read-only artifact envelopes and 1 cited answer, and rejects unknown evidence/provenance, duplicate IDs, invalid geography, write flags and executable fields. This validates synthetic shape and reference boundaries, not real tool calculations, regulations, identity, audited writes or backend implementation. The new envelope is not the actual shared contract/API. See backend-handoff.md for explicit production gaps and operator-control requirements.

Evidence is retained in `.context/generative-ui-components/evidence/`. Unrelated root `.gitignore` remains preserved; no formal clean factory attestation, merge, push or deployment is claimed.

Final integration review found mixed cost/downtime summary binding and legacy save-panel labels. A shared artifact resolver now binds summaries, widgets, backend metadata and picker labels to the same actual metric. Four targeted regressions pass, including currency preservation and combined panel ordering; five runtime assertions verify correct combined cost/downtime prose, cross-panel selection/evidence and save labels. No additional visual polish pass was performed.
