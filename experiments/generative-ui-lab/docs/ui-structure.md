# Operator UI structure and light theme

The approved continuous-chat workflow remains the basis of `/operator`. Refinement keeps the Fieldwork teal/ink identity while making the data panels the visual focus: pale neutral canvas, white result surfaces, selective teal emphasis, clearer headings, less prominent metadata and a compact composer. Synthetic labeling, exact source actions, explicit save and operator controls remain available.

## Component boundaries

| Location | Responsibility |
| --- | --- |
| `App.tsx` | Application/controller state, request gates, persistence, evidence lookup and integration |
| `ContinuousChat.tsx` | Conversation composition, historical turns, reply navigation and current context |
| `components/chat/AppHeader.tsx` | Brand and library/new/settings actions |
| `components/chat/ChatSidebar.tsx` | Saved views, conversation search/list and local-storage status |
| `components/chat/ConversationWelcome.tsx` | Honest starter prompts and exploration entry points |
| `components/chat/InlineResult.tsx` | One result's local selection, exact snapshot evidence, trusted renderer, explicit save and run provenance |
| `components/chat/MessageComposer.tsx` | Controlled input, connection status and send/stop actions |
| `components/chat/types.ts` / `suggestions.ts` | Shared chat interfaces and synthetic prompt suggestions |
| `components/artifacts/` | Separate Series, Ranking, Matrix, Obligations, Timeline, Claims and Correction renderers, with shared formatting/evidence/scope helpers |
| `OperationalArtifacts.tsx` | Small stable dispatch facade; keeps the existing import/export interface |
| `GeographicArtifact.tsx` | Existing lazy geographic module and Leaflet lifecycle |
| `components/ui/Icon.tsx` | Small authored SVG icon vocabulary for consistent action/brand glyphs |

Request, history, saved-view and source authority remain above the presentation components. Moving a renderer to another module does not change its data schema, callbacks, run identity or interpretation. Shared format/evidence helpers do not calculate production or regulatory truth.

## Styling boundaries

`OperatorExperience.css` is now an entry point, not a stack of repeated overrides. Its four scoped files under `components/operator/styles/` own:

- `tokens.css`: light palette, interaction colors, focus/selection and reduced-motion behavior.
- `shell.css`: navigation, sidebar, header, mobile library and persistence notices.
- `conversation.css`: reading surface, welcome/actions, message hierarchy and composer.
- `results.css`: result surfaces, chart/table details, state/source hierarchy and save/provenance footer.

The `.operator-review.operator-shell` root scopes theme precedence over earlier comparison styles. Other routes retain their layout and renderer behavior. Existing artifact/map styles remain their base geometry; this theme supplies operator-specific hierarchy and surfaces. No dependency or backend/shared-contract change is needed for the refinement.

Light theme is an explicit user preference. Avoid full-screen dark mode, decorative gradients or competing accent colors in future refinements. Use color with labels for operational status; preserve missing/failure/loading states and original result identity during refresh. Save status belongs with its action; source scope stays with the displayed data.
