> Historical research snapshot from17October2026. References to retired lab code, split layouts, local captures or an A2UI baseline are historical; current decisions/architecture in the parent folder take precedence. Vendor findings are dated, not a fresh compatibility guarantee. Raw third-party captures are not bundled.

# Product direction alignment: saved operator views

Read on 2026-10-17 at the user's request. Source material: `.context/ui-agent-handoff/saved-views/frontend-saved-views-addendum.md`, `saved-views-product-design.md` and `saved-view-concept.json`. No application, API, contract, dependency or source handoff files changed. No external capability verification was needed for this interpretation of supplied product design.

## Intended journey

Ask a substantive operator question → coordinator/tools produce an evidence-backed answer with suitable supported visual artifacts → save selected useful panels as a named private view → reopen/run with changed well/count/date controls or request the same view through chat → approved read recipes return fresh values, sources, rules and time labels in the stable component composition. A different question may generate a different composition. Saved views support the investigation rather than constrain all questions.

## Distinct objects

- Conversation: private questions, replies and historical artifacts.
- Saved definition: versioned reusable composition, approved components, typed inputs, allowlisted read-operation bindings and defaults. Not a stored prompt, arbitrary code or tool transcript.
- Run: one definition revision, resolved parameters, evaluation time and new per-panel data/evidence/activity states. Parameter overrides do not rewrite the saved defaults.
- Historical result: preserved original outcome and citations. It differs from rerunning a view against current data; no arbitrary historical-database replay capability is assumed.

## Implications for frontend experience

A useful generated composition can become a reusable view. Direct input changes need no model regeneration. Keep parameters attached to the queries/panels they actually affect; count-based inspection history and date-based trend are different controls. Apply/refresh opens a new run. Old data retains its original well/time labels until replacement; loading/empty/inapplicable/failed panels are explicit, including mixed coverage. Multiple tabs/users have independent run parameters.

Changing wells must update result values, labels, sources, applicable manual/type rules and accepted-correction provenance. Preserve component meaning; no invented replacement data when a panel is unsupported. An original AI narrative stays dated with its original scope or is excluded; fresh explanation requires a separate bounded analysis action. Read refresh must never replay writes, notes, corrections, assignments or delivery.

Private views, private conversations and shared asset knowledge have separate ownership. Recheck current data access for every run; browser/demonstration identities do not establish production authorization. Production definitions/runs and permissions remain backend-owned.

## Coordinator applicability

Explicit named view/active-view reuse takes priority; a full semantic match can reuse a compatible definition. Partial matches supplement rather than suppress missing analysis. No match generates fresh results normally. Explicit modifications create a revision/unsaved derivative. No separate routing agent, keyword-only classifier, dashboard editor or new rendering protocol is required by this design. Exact HTTP routes/types/tool payloads remain tentative; JSON concept is marked non-executable.

## Current demo gap

The continuous page demonstrates inline interactive artifacts, historical snapshots and follow-up context; the split page offers an alternative shell. Both use the same synthetic three-query catalog. Neither implements a saved reusable definition, parameter-bound backend recipe, count/date reads, deterministic manual/chat reruns, per-panel run recovery or server-owned private saved views. Existing local filters select from already-loaded fixture rows; they do not prove fresh backend reads for a different well. Existing saved chat snapshots are not reusable saved views.

Layout remains an evaluation choice. This handoff explicitly does not select one. The next meaningful product experiment would implement the narrow saved-view journey in the chosen comparison shell, keeping current layout comparison available and mock/backend limits explicit; the present request is read/understand only, not authorization to turn tentative JSON into actual shared APIs.

## Handoff completeness

The supplied folder currently contains only the three saved-view files. Referenced `frontend-generative-ui-handoff.md` is absent, and the linked storage document is not included in this handoff. This interpretation is grounded in the available saved-view addendum/design/concept, not a complete review of the missing base generative-UI contract or actual backend implementation. The design's earlier no-implementation notice is preserved; no implementation was requested in this turn.
