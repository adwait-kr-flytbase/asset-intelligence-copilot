> Original product/backend design input. Tentative production concepts are preserved; implemented demo behavior and missing backend capabilities are described in ../architecture.md and ../question-coverage.md. The referenced base frontend-generative-ui-handoff.md was not supplied; ../backend-handoff.md is the retained integration proposal.

# Frontend addendum: reusable saved operator views

17 October 2026. New product/design direction from the user; tentative contract concepts only. This extends [the generative UI handoff](frontend-generative-ui-handoff.md). No frontend implementation or shared-schema/API change is made here.

## Product expectation

An operator can save a useful generated composition, reopen it, change a well/date/count input and obtain fresh data in the same component composition. They can also ask the existing coordinator to use that saved view with new inputs. Both interactions execute the same backend read recipe; manual parameter changes do not require the model to regenerate components.

A new unrelated question generates a new answer/artifact composition. A partial match can supplement the answer; it must not suppress requested analysis or silently alter a saved view. Personal views are separate from shared asset knowledge.

## Prepare these concepts

- **Definition:** stable ID/revision, name/purpose, typed parameters/defaults, approved panel/component references and validated data-query bindings. This is reusable structure, not a frozen answer.
- **Run:** definition revision, resolved parameters/time window, evaluation time and fresh artifact/result/evidence/tool-call references. Multiple tabs/users can have independent runs without modifying the saved default.
- **Controls:** supported well/date/count inputs declared by the definition. A parameter explicitly identifies which queries/panels it affects. Some fixed filters or panel-specific time ranges should remain visible.
- **Lifecycle:** refresh-on-open/apply/manual-refresh is the proposed first behavior. Mark loading, partial and failed panels. Old results retain their previous well/time labels until replaced; never show Well 001's result as Well 002 merely because the selector changed.
- **Agent changes:** agent reads/runs the same definition; explicit requested edits create a new revision or unsaved derivative rather than silently rewriting the saved dashboard.

Panel composition is stable across refresh; values, labels, source links, applicable rules and tool activity come from the new run. Different well types may yield unsupported or empty panels without the agent inventing replacement content. Preserve meaning and make unavailable data clear.

## Important narrative distinction

Deterministic tables, charts and validated rule checks can rerun from structured reads. An old AI explanation about one well must not appear as a new conclusion about another. Initially save deterministic panels plus reusable static labels; offer analysis as a separate agent action later, or retain a clearly dated original explanation with its original parameters. A historical result and a current-data view are different objects.

## Tentative backend operations

Conceptual operations: list/find accessible saved views, get a definition, validate/save a definition, and run a definition with parameter overrides. Exact HTTP routes, shared type names, action payloads and persistence/recovery details remain to be agreed. The run returns ordinary supported artifact kinds; no parallel dashboard rendering protocol is needed.

Saved definitions reference approved read operations, not arbitrary SQL/JavaScript or recorded model tool transcripts. Refresh never replays notes, corrections, assignments or delivery. Source/data permissions are rechecked on every run, not inherited from whoever originally saved the view. Private production views require trusted server identity; the challenge picker remains demo identity.

## Recommended first scope

Named private saved views, known catalog components, one well parameter, bounded inspection count and an optional relevant date range. Preserve layout; use direct controls and explicit chat reuse. Avoid a drag-and-drop dashboard editor, separate agent router, auto-sharing and scheduled agents initially. UI work remains entirely in the frontend worktree.

Read [saved-views-product-design.md](saved-views-product-design.md) for full product rationale, reuse rules and backend boundaries, and [saved-view-concept.json](saved-view-concept.json) for clearly synthetic, non-executable binding/run examples.
