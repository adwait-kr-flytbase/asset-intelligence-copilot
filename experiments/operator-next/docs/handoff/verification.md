# Verification — 17 October 2026

Validated using Node22.22.3 and pnpm11.20.0.

- `pnpm test:critical`: 23 passing tests. Includes runtime artifact/evidence validation, request correlation, null/time/metric semantics, explicit visual requests, saved subset/predicate/dataset bindings, local-storage recovery, sample record calculations, document retrieval, historical late-verification breaches and containment-only recipes.
- `pnpm build`: TypeScript, Vite client and bundled Hono server.
- Desktop and390px mobile browser checks: all eight artifact kinds; text-only cited response; explicit Save; fresh named/direct saved reads; preserved two-well subset; focus follow-up scope; Assets search/filter; history reload; mobile navigation; no page overflow or uncaught browser errors.
- Local sample browser journey:200-map markers and temperature layer, keyboard selection,13-week temperature chart/table/difference control, four-well explicit status table, four-spill map reopened fresh with predicates, manual retrieval, two conflicting Q18 notes,200-asset directory.
- Failure checks: dismissing a pending saved refresh cannot reopen focus; stopping an investigation prevents a late stream from attaching its result. Corrupt stored history is preserved and labelled temporary.
- Actual OpenStreetMap basemap tiles loaded; loading timeout/error retains coordinate markers and record fallback. Map/chart rendering loads in separate chunks. A failed visualization has a boundary that retains conversation and source controls.

Preview: http://127.0.0.1:3400; Hono: http://127.0.0.1:3401. Development command starts both services. Sample data is read locally, never copied into tracked source or browser bundles. The app remains a bounded read-only prototype: no provider model, production ingestion/authentication, shared writes, accepted corrections or private backend memory. Compliance coverage is partial; see question-coverage.md.

Source isolation: this work adds only experiments/operator-next. Existing apps, shared contracts, old lab and root tooling/lockfile are untouched. Existing unrelated .gitignore change remains outside this work.

## Retired lab cleanup

After the operator approved Fieldwork, the previous generative-ui-lab app and its demo services were removed. Its detailed backend handoff and validation script were moved into this project. Existing fixture artifact/evidence data already matched (obsolete proposal warnings differed), so no second dataset was retained. Fieldwork remains independent and the actual apps/shared contracts remain unchanged.
