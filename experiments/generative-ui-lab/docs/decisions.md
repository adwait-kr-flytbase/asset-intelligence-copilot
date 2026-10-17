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

## D08 — Evaluate the operator experience inside the demo

Date: 2026-10-17. Status: adopted, supersedes the lab-first shell.

User feedback: a promise that the eventual product will be simpler is insufficient; the demo must let the user evaluate that simpler experience now. Default to one-click operational questions, conversation plus results, one reachable composer, contextual evidence and hidden experiment controls. Desktop and mobile are both primary. Mobile shows one destination at a time, preserving the same investigation and composer.

Why: the experiment must reveal task friction, not just renderer capabilities. No decorative/nonfunctional voice entry point. Future voice must share context and result history with typing.

## D09 — Own the conversation and immutable answer versions

Date: 2026-10-17. Status: adopted for synthetic lab.

Keep complete application conversation entries and validated completed snapshots outside the SDK transport cache. Key each result version by run ID; a domain result ID is not a historical answer ID. Every completed answer opens its exact stored snapshot. Refresh and representation changes append entries. Scrolling does not navigate. Searchable, renameable threads persist on this browser only; pending attempts restore as interrupted. Thread switching invalidates the stream gate and stops the current attempt.

Storage key `genui-lab-history-v2` validates schema, result/wire links and readiness. Legacy `genui-lab-investigation-v1` is migrated without removing its original. Invalid saved content is kept; new work remains temporary until explicit recovery in settings saves a backup key. Quota/access errors show temporary status and a notice. No production durability, encryption, account isolation or cross-device claims. Prompt history is local and excluded from exports.

## D10 — Treat CopilotKit as a separate interaction-layer experiment

Date: 2026-10-17. Status: proposed for a bounded comparison, no adoption yet.

CopilotKit can work with an AI SDK backend and a custom headless operator shell. It may replace custom context/action/state plumbing; A2UI describes presentation and remains a separate concern. Retain server-authoritative calculations, immutable answer results, evidence validation and application-owned history in either variant. Do not assume CopilotKit's A2UI renderer is the same package as the official renderer, or that documented protocol examples prove compatibility with this catalog/version.

Compare identical questions, context changes, frontend actions, cancellation, historical results and mobile flows. Count integration code and failure behavior; do not infer a latency/model-quality winner from scripted delays. Sources and detailed audit live in ignored `.context/generative-ui-research/research/copilotkit-capability-audit-2026-10-17.md`. The current implementation remains AI SDK UI streaming plus official A2UI/direct rendering.

An independent review identified the inherited chart fallback when a selected well falls outside a changed area. Area changes now retain the selection only when it is visible; otherwise they select the first well in that area, aligning the header, trend and explicit request context.

## D11 — Keep the visual workspace stable across questions

Date: 2026-10-17. Status: adopted for lab; extends D08/D09.

User correction: the entire page changing for each question costs attention; not every question needs new UI. Separate completing an answer from activating its visual snapshot. The first result opens automatically. Later ordinary visual answers are saved and offered through their result card; the current view stays in place, including its renderer instance, expanded details, filters, selected well and scroll. Explicit Refresh/Show as table applies a completed change. A partial update never replaces an existing workspace. A small stable-height context row offers Show latest result without an alert or forced navigation.

Three scripted follow-ups explain status, downtime methodology or conflicts using the current selected well's validated snapshot fields. They append text and source links, with no model/stream call or new result card. Explanation entries retain the exact context snapshot and validated source IDs. Evidence can open from an older explanation without changing the canvas. They do not infer physical failure causes. Mobile retains the current destination and shows a New reply cue.

Tradeoff: switching to a newly prepared investigation requires one deliberate result action; this preserves focus without approval modals. This does not implement a general model decision about when text versus visuals is best, nor targeted widget patching. Future backend integration should expose explicit answer/presentation intent with server-authoritative results; renderer protocol alone should not decide workspace navigation. Existing saved history schema accepts additive optional explanation fields and is revalidated.

## D12 — Compare a continuous generative conversation

Date: 2026-10-17. Status: alternative experiment, not a production winner.

User rejected the prior stable-workspace iteration as obscuring the generative UI experience and asked for another page: one continuous chat with past chats in a sidebar. Keep the existing split page at `/` and add `/conversation`. Render actual trusted interactive representations inside each assistant answer, not detached result links. Each subsequent visual answer appends in place; initial/current partial views belong to that turn. Both pages share controller, transport, result validation, source dialog, renderer selector and saved threads.

Inline result controls have independent session state. Interacting with a result explicitly sets subsequent question context; the composer displays that context. Historical values/sources do not change when another answer is used. Thread-level current scope persists; non-focused per-result scopes are session-only and reset on reload. New chat/sidebar search/mobile History remain accessible. Comparison navigation is a page load and can interrupt a stream.

Why: evaluate whether operators can read, explore and continue from a visual answer without switching attention between chat and a separate workspace. It intentionally retains actual visual richness. No operator usability study has selected a winner. Long transcripts currently mount all result renderers; production needs a measured history/pagination strategy.
