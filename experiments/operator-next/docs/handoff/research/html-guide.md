> Historical research snapshot from17October2026. References to retired lab code, split layouts, local captures or an A2UI baseline are historical; current decisions/architecture in the parent folder take precedence. Vendor findings are dated, not a fresh compatibility guarantee. Raw third-party captures are not bundled.

# Visual HTML companion

User requested an easy-to-understand, descriptive HTML guide covering all important research findings, the spectrum, tools, flows, diagrams and animations.

Artifact: [generative-ui.html](../../../../generative-ui.html). It is self-contained: inline CSS/JavaScript/SVG; no runtime packages, fonts, CDN or network calls. Research facts retain the 2026-10-17 snapshot date.

## Coverage

| Research area | HTML section |
| --- | --- |
| Core principle and four patterns | Core principle + interactive spectrum; hosting shown as an orthogonal axis |
| Protocol responsibilities | A2UI / AG-UI / MCP / MCP Apps / A2A map |
| A2UI mechanics | Seven-step walkthrough, catalog, surfaces, bindings, local vs server state |
| Versions and caveats | v0.8/v0.9/v0.9.1/v1.0, renderer matrix, candidate discrepancy, transport/adapter maturity |
| Agent interaction / embedded apps | AG-UI events, MCP Apps lifecycle, permissions, fallback and bidirectional nesting |
| Eight tooling options | AI SDK UI/RSC, json-render, CopilotKit, assistant-ui, Tambo, OpenUI, C1, LangGraph |
| State, evidence, trust | Three state scopes, correction simulation, provenance, replay and pagination |
| Five research works | Results, distinct metrics, limitations and practical lessons |
| Copilot application | Six visuals, required evidence, domain calculations and conditional adoption path |
| Verification proposal | Coverage, overrides, scope/privacy, conflicts, failure cases, accessibility and performance |
| Evidence and uncertainty | Observed/recommended/unverified, refresh conditions and all 54 source snapshot links |

## Verification

`Browser results` (unbundled capture): 37 assertions, including interactive controls, keyboard tabs, every flow step, finite playback/pause, reduced motion, filtering, decisions, draft/saved separation, invalid input, retry no-op, source expansion, internal anchors, duplicate IDs, offline requests, no-JS fallback and print visibility. Layout checked at 1440, 768 and 390 CSS pixels. No JavaScript page errors or external requests.

Screenshots: `desktop` (unbundled capture), `spectrum` (unbundled capture), `mobile` (unbundled capture), `mobile flow` (unbundled capture). Inspected first batch, then made one bounded correction pass and reran. Added reverse arrows for submit, no-JS step list, and origin/license clarification.

The Chrome DevTools connector could not open because its profile was already in use. A separate cached Playwright Chromium instance performed read-only artifact verification without touching the running browser or installing dependencies.

Mechanical detector raised style heuristics (state-plane borders, purple hosting accent and line-height parsing). Visual inspection found legible computed typography and responsive geometry. These heuristics are not represented as a clean lint result. Full screen-reader or manual assistive-technology testing was not performed.

This is a presentation of authorized research, not an application-stack implementation or a formal task-factory delivery milestone.
