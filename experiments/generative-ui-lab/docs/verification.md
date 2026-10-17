# Verification and limitations

Run the documented typecheck/build/critical checks from the nested project. The build covers both Vite assets and a separately built Hono entrypoint. The targeted Node checks cover canonical presentation/data references, stale-run gating, SDK/Hono request validation, body limits, provider response parsing, missing configuration, error redaction and cancellation using a localhost provider stub.

Browser verification exercises the real lab Hono stream and official A2UI renderer, equivalent direct rendering, evidence actions, filtering/selection, all six required visual families, representation changes, invalid updates, Stop, saved-state restoration/reset, sanitized export, missing provider configuration and desktop/mobile layout. Local finite scripts, assertions and screenshots are retained in `.context/generative-ui-lab/evidence/`; those ignored records are specific to this checkout, not bundled test dependencies.

Known limits:

- All data and rules are synthetic. This is not integration with the real dataset or backend agent.
- Offline generation is scripted. Live adapter tests use a local provider stub; real-model execution is not verified without local configuration and an observed run.
- Live generation produces a small validated query/view plan. The server converts it to canonical A2UI. Raw model-generated A2UI, arbitrary component trees, general query planning and token-level surface generation are separate future experiments.
- The coordinate map has no basemap/tiles. It marks missing coordinates explicitly; it is not a GIS accuracy demonstration.
- Saved investigations are browser-local, versioned synthetic snapshots. Draft notes survive updates but are not persisted/exported. No shared/private production memory, correction persistence or authentication is implemented.
- The canvas retains valid content on rejected updates, but a renderer crash is contained by an error boundary rather than a guarantee of transparent renderer recovery.
- Browser timings include artificial replay delays and are single-run observations. No framework speed/model benchmark or full accessibility audit is claimed.
- Initial combined client bundle is roughly 805 kB minified / 232 kB gzip, including both renderers. The build reports a chunk-size warning. This lab records that tradeoff rather than hiding it; production should evaluate lazy loading/removing experimental paths.
- The dependency audit is a point-in-time check; re-run it when upgrading. A2UI's current Zod v3 peer is a documented lab-only exception to the actual app's Zod v4 schema version.

No production app/API/shared-contract/root-lock edits, push, merge or deployment are part of this delivery.

## Recorded verification — 2026-10-17

- Typecheck and combined client/API build pass.
- 9 targeted checks pass.
- 39 browser assertions pass in Chromium, including request-count regression for Stop and bounded outgoing chat requests; no uncaught page errors.
- Nested dependency audit reports zero known advisories; no peer dependency issues.
- Scoped Biome check has zero errors; it retains style warnings (mostly CSS specificity/reduced-motion overrides and guarded fixture assertions).
- All tracked implementation changes are confined to this nested lab.

The combined client bundle is 806.11 kB minified / 232.39 kB gzip in this run. Real provider/model generation remains unverified.
