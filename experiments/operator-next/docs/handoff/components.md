# Complete retained component catalog

Paths below are relative to `experiments/operator-next/`. React components stay local to this app; no shared component package was introduced without a second consumer.

## Workspace, pages and controls

| Component/module | File | Behavior |
| --- | --- | --- |
| App, Shell, Navigation | `src/App.tsx` | Light workspace, Assistant/Assets/Saved views navigation, recent threads, new conversation, dataset selector, mobile navigation |
| Conversation | `src/pages/Conversation.tsx` | Labelled example, empty entry prompts, continuous user/assistant history, progress/failure, inline results and follow-ups |
| Assets | `src/pages/Assets.tsx` | Dataset-bound directory, search/status filters, desktop table/mobile records, ask about asset and open field map |
| Saved | `src/pages/Saved.tsx` | Explicit definitions only, search, honest empty state, fresh open/read |
| Answer | `src/components/Answer.tsx` | Plain response text and controlled expansion for long source-based responses |
| WorkspaceProvider/useWorkspace | `src/workspace.tsx` | Shared UI authority; no calculations/authorization moved into visual components |
| AgentRequest | `src/components/AgentRequest.tsx` | Per-request stream instance, progress, verification and error callbacks; cleanup/cancellation |
| Dialog | `src/components/WorkspaceUI.tsx` | Native modal wrapper with Escape/close handling |
| Scope | same | Actual asset count/identity and date window |
| ResultCard | same | Single title/scope, typed visual, evidence action, explicit Save and Expand |
| Composer | same | Sticky input, Send/Stop, removable selection context; no decorative voice or upload controls |
| SaveDialog | same | Named definition, duplicate/storage checks, persist-before-success |
| EvidenceDialog | same | Exact result source selector, excerpt, record revision, visibility, locator and calculation inputs |
| FocusDialog | same | Same artifact in a larger surface, source/save actions, scoped composer, saved parameter Apply/Refresh, deliberate new-reply return |
| Overlays | same | Focus, save and evidence modal composition |
| ViewBoundary | `src/components/ViewBoundary.tsx` | Failed visualization cannot remove conversation/source controls |
| Icon | `src/components/Icon.tsx` | Small authored SVG registry; labels belong to interactive controls |
| Store/response helpers | `src/types.ts` | Validated persistence, interruption recovery and correlated results |

## Generative operational artifacts

`src/components/ArtifactView.tsx` dispatches a validated artifact to a trusted component. It accepts inline/focus mode, selection/evidence callbacks and optional `auto`/`table`/`card` presentation. Backend data determines meaning; local interactions cannot change authoritative facts.

| Variant / component | Data | Interactions and limits |
| --- | --- | --- |
| `geo` / GeoView | `points` with WGS84 coordinates, well/event identities, production class, volume/date/source IDs; optional thermal/inspection/reason fields | Pan/zoom/fit, keyboard/hover/touch selection, source-linked record, status/spill filters, spill-volume symbols, optional discrete temperature layer, loading/offline/missing-coordinate record fallback. `src/components/GeoView.tsx` lazy-loads Leaflet |
| `geo` / GeoRecords | Same point data | Explicit location table or asset card without forcing a map; optional ΔT/threshold/recorded status/reason/inspection fields shown when supplied |
| `series` / SeriesView | Raw dated nullable series, unit, event markers | Pointer/touch nearest observation, date control, legend toggles, raw/difference display when supported, read table, exact gaps and source events. Production markers are backend supplied |
| `ranking` / RankingView | Backend metric/unit and item values/source IDs | Common-zero bars, correct currency/days/bbl formatting, order toggle, table, linked asset selection and sources |
| `matrix` / MatrixView | Explicit row/column axes, unit, complete nullable cells and cell sources | Two-dimensional heatmap, cell drilldown/source access, distinguish unknown from zero; can represent area×month counts or inspection differences without changing units |
| `obligations` / ObligationsView | Rule, observed evidence, status, deadline, well/source IDs | Status filtering, rule/record review and evidence. Pending/unknown/breach remain distinct; late completion remains historical breach. No commit or pretend legal certification |
| `timeline` / TimelineView | Dated inspection/repair/spill/note/correction events | Chronological list or explicit table, category filtering, linked record/source access |
| `claims` / ClaimsView | Attributed dated observed/reported/disputed/corrected statements | Filter statements, retain authors and both sides of conflict; no ordinary note silently becomes an accepted correction |
| `correction` / CorrectionView | Record/field, original/proposed values, unit, reason, impacts and state | Before/after review, original preserved, read-only disclosure, provenance. Demo has no Apply/accept mutation |

Shared renderer helpers format units/status, resolve sources, identify valid linked wells and display empty/partial/warning states. Evidence is closed over calculations/inputs. Each result retains identity across local interactions; a new run gets new IDs. Presentation requests such as table are propagated through responses and saved recipes.

## Styling and responsive behavior

`src/index.css` owns app/shell/pages/dialogs/composer and the light design language. `src/components/artifact-view.css` owns visualization controls and layouts; Leaflet CSS loads with the map module. Manrope is self-hosted via `@fontsource-variable/manrope`. Indigo signals interaction; green/amber conveys operational condition. Small text describes metadata rather than competing with the answer. Mobile has a real navigation drawer, readable stacked asset records, internally scrolling tables and full-size focus/evidence surfaces. Reduced-motion styles and keyboard focus are included.

## Future components, only when backed by data

Authorized document/image attachments, calibrated georeferenced thermal rasters, surveyed spill polygons, complete status/unknown cards, precise multi-currency/timezone obligations, richer per-point evidence and role-gated action proposals may need additive variants. Their schemas and authorized tool outputs must precede a renderer; imagery, terrain temperatures, geometry, approval and derived facts must never be fabricated to make a component look complete.
