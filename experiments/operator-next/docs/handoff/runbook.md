# Run, verify and continue

## Local start

Use the repository's pinned Node/pnpm; this delivery was checked with Node22.22.3 and pnpm11.20.0. From a checkout containing the retained app:

```sh
cd experiments/operator-next
pnpm install
pnpm dev
```

Frontend: http://127.0.0.1:3400. Hono: http://127.0.0.1:3401. The dev command starts both; Vite proxies `/api` to Hono. Both bind to loopback. Keep ports strict rather than silently selecting a different review URL. The retired lab's3200/3201 services were stopped.

Worktrees do not inherit ignored dependencies, local storage or sample files. After the merge, the main checkout contains source/docs but may need its own nested install; the already running preview remains in the original kahawai checkout. Do not install dependencies at repository root to run this demo.

Synthetic mode requires no provider key or dataset. Select Sample dataset in the header for local challenge records. The server resolves repository `sample-data/` or accepts a server-side `SAMPLE_DATA_DIR`. It validates records, retains originals and does not ingest/copy data into tracked source. A missing dataset returns unavailable; synthetic mode remains usable. Browser `VITE_*` values must never carry credentials.

## Checks

From the demo directory:

```sh
pnpm typecheck
pnpm test:critical
pnpm build
pnpm exec tsx scripts/validate-backend-handoff.ts
```

The handoff validator reads the already retained `server/fixture-snapshot.json`. It checks all eight proposed read-only envelopes, cited answer and rejection cases; no API or write is performed. Current critical suite has23 passing tests when the local sample is available. See verification.md for actual browser checks and question-coverage.md for the difference between read anchors and incomplete stateful scenarios.

## Review journey

1. Open the initial labelled synthetic example; select a location, inspect its source, then ask a follow-up using visible context.
2. Expand the result: same identity/data, no new read. Ask another question; the original focused result stays stable and a deliberate return shows the new answer.
3. Start a new conversation. Ask for a temperature trend, ranking, matrix, obligation, timeline, conflict or correction review. A why/status question can return only cited text.
4. Explicitly Save one result. Open Saved views and run it: new result IDs, retained kind/metric/dataset/scope/predicates/presentation, fresh source read. Apply changed parameters, then Refresh current.
5. Switch to Sample dataset. Try a map of all wells, WELL-0001's13-week wellhead/air history, Northeast Block8 non-producing table or recent spill map, area×month2026 spills, or WELL-0101's20Aug conflicting spill notes.
6. On mobile, use the real navigation drawer, asset records, chart numeric table and full focus/evidence screens. Tables may scroll internally; the page should not overflow horizontally.
7. Check failures: Stop, thread switch, read error, old result during refresh, late response after dismissal, missing tiles/coordinates and unavailable sample data. Old evidence must not change identity or become newly labelled live data.

Map tiles need network access to OpenStreetMap. A real enterprise deployment must choose an approved provider/offline strategy; symbol rendering and source records remain available if tiles fail. Referenced thermal/RGB files are not supplied with the sample.

## Next implementation sequence

1. Read the current architecture/components/decisions, then backend-handoff.md and contract-bridge.md.
2. Agree additive browser-safe shared schemas with the backend branch. Keep real app source ownership: `apps/web`, `apps/api`, shared contracts only. Do not import experiment/server code across apps.
3. Replace bounded prompt routing with authorized coordinator/tool execution while retaining validated artifact/evidence semantics, unknown/partial states and explicit visual preferences.
4. Add authenticated durable conversation ownership, private recall and shared source knowledge separately. Implement saved recipes as versioned authorized read bindings, not executable client definitions.
5. Add actual proposal/review/commit for corrections/notes/policy changes with operator action, source revisions, conflict handling and audit. Recompute downstream quantities; preserve originals and unconfirmed claims.
6. Complete domain coverage and document extraction using unseen data, not question-specific constants. Q9 pending manual/RCA duties and Q11–Q17 stateful behavior are material gaps.
7. Port the approved UI behavior into the actual frontend deliberately. Retain this app as an independent review reference until the real integration is accepted.

No remote push or deployment is part of the local merge instruction. Current source can be recovered from Git; do not recreate the retired app merely for its handoff material.
