# Decision log

These decisions apply to the disposable lab. They are evidence for later production decisions, not automatic approval to change the real app.

## D01 — Isolate the entire experiment

Date: 2026-10-17. Status: adopted for lab.

Keep client, Hono backend, schemas, fixtures, dependencies, lockfile and docs in a nested `experiments/generative-ui-lab/` project. Match the actual UI stack. Do not import/edit the real apps or shared contracts.

Why: experiments can change rapidly without coupling production ownership, installs or API behavior. Tradeoff: deliberate duplication and separate commands. Revisit when transferring a proven capability into the real app through an explicit shared contract.

## D02 — Start with official A2UI and a direct baseline

Date: 2026-10-17. Status: adopted for experiment; production choice open.

Pin official renderer/core 0.14.0 and wire protocol v0.9.1. Use the same widgets, immutable results and interactions for both paths. Inspect actual installed APIs rather than copying stale examples. No pixel-parity or universal performance claim.

Why: learn the practical cost/value of protocol composition and updates. Tradeoff: additional dependencies and adapter lifecycle. Revisit if catalogs, cross-client portability or arbitrary composition become production requirements.

## D03 — Keep the model away from calculated values

Date: 2026-10-17. Status: adopted.

The model chooses a small deterministic query and supported view list. It cannot submit numeric facts, source IDs, arbitrary functions or executable markup. The server projects validated plans into canonical A2UI; the client validates again.

Why: model-controlled composition should preserve operational data meaning. Tradeoff: this does not measure raw A2UI syntax generation or open-ended query planning. Retry condition: add a separately measured raw-wire experiment after establishing a trustworthy result/interaction baseline.

## D04 — Support live generation and honest scripted replay

Date: 2026-10-17. Status: adopted.

Offline mode is explicitly scripted and requires no credentials. Optional live mode uses a lab-local compatible provider and never silently falls back. Local stub checks prove adapter boundaries, not real-model quality.

Why: separate deterministic UI/failure experiments from generation experiments. Tradeoff: a replay is not evidence that an agent chose the right visualization. Revisit after a real configured model run with unseen questions.

## D05 — Preserve completed results, drafts and evidence

Date: 2026-10-17. Status: adopted.

Run IDs gate updates; Stop restores the last completed surface. Persist only a versioned validated complete snapshot. Keep filter/selection/draft state outside renderer state. Representation changes retain the result and avoid another model call.

Why: an invalid or slow new view should not destroy useful operational context. Tradeoff: no server-side history, collaboration or durable corrections. Revisit during real-backend integration.

## D06 — Keep dependency compatibility explicit

Date: 2026-10-17. Status: adopted; reverify on upgrade.

The core UI/runtime versions match the real app. The lab uses Zod **3.25.76** because official A2UI React 0.14.0 requires its v3 peer, whereas the real app uses Zod 4.6.7. This exception is confined to the lab. Override transitive DOMPurify to **3.4.16** after the initial nested audit flagged advisories in 3.4.11. The final nested audit reports zero known advisories and no peer issues at the recorded check date.

Why: preserve a supported renderer dependency graph without changing the real app. Tradeoff: a production adoption must resolve the schema-version boundary intentionally. Revisit when A2UI updates its peer support.

## D07 — Measure useful behavior before choosing a winner

Date: 2026-10-17. Status: adopted.

Record first accepted visual, completion, errors, actions, preserved result identity and integration work. Timing includes deterministic replay delays; do not compare it as model latency or claim one framework is fastest. Current model plan generation is buffered before streaming the surface.

Why: parsing valid JSON and producing attractive screenshots are insufficient evidence of a reliable investigation experience. Revisit with identical real-model conditions and adequate samples.
