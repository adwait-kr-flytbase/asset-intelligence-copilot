# Fieldwork frontend with application data

`apps/web` uses the approved Fieldwork styling and component patterns from
`experiments/operator-next`, with operational data supplied exclusively by the
persisted application API. There is no browser fixture executor, synthetic answer
fallback or dataset-mode toggle. The experiment remains a historical review reference.
Workspace branding and generic prompt suggestions are presentation copy, not facts.

## Run

Use the pinned Node/pnpm. Configure PostgreSQL and imported records through
[storage setup](storage.md), apply migrations, and configure ignored `apps/api/.env`
from its example. `DATABASE_URL`, `APP_NAMESPACE` and `APP_SESSION_SECRET` are required;
chat additionally needs the existing OpenRouter credentials/model configuration.
Import the actual provided directory with the ingestion CLI; no raw dataset is
bundled into the browser. Empty or disconnected storage remains visibly empty/error.

`pnpm dev` starts web and the application API. They can also run independently:
`pnpm dev:application` (API3003) and `pnpm dev:web` (web3000).
The API app's ordinary dev/build/start now target the persisted application entrypoint.
Vite proxies `/api` to `VITE_API_TARGET`, default `http://127.0.0.1:3003`.
`WEB_PORT` selects a different frontend port. There is no `VITE_API_MODE` switch;
provider credentials remain server-only. Fonts are bundled; map basemaps use
OpenStreetMap with an explicit missing-tile fallback.

## Identity and access

The compact picker presents four distinct roles with one actual imported person per
role: production supervisor, field operator, field inspector and HSE officer.
It does not repeat all imported users with the same role. The selected representatives
remain stable using non-secret role-to-person preferences; they are always validated
against imported people. The current selected person's identity comes from the server.

All four roles currently read the same shared operational records in the namespace.
Conversations, results, evidence reached through those results and saved views are
private to the selected person. Role names do not currently enforce separate capability
or area permissions. This is deliberately demo identity selection, not production
login/RBAC. The server checks ownership; browser preferences cannot authorize a read.

Persona changes cancel current work, clear private UI/query state, leave the old chat
URL and fetch the new person's data. Late results cannot attach to another identity.
Old synthetic browser history is neither read nor displayed. Browser storage contains
only public role-selection preferences; durable chats/views live in PostgreSQL.

## Conversations and ordinary reads

Each persisted conversation has `/chats/<server-conversation-id>`. History entries
are real links supporting revisit/copy/open in another tab. Direct links load owned
history; a link never grants another person access. New conversation opens a blank
draft at `/` and obtains its server ID when the first question is submitted.
The root URL stays a draft, including after reload; it never redirects to the latest chat. “Ask about
asset” always opens a fresh draft with that real asset selected. The selected asset
context is included visibly in the stored user message, not resolved through fixture
well-name patterns.

Enter uses the shared `ApplicationMessage`/chat request contract. The server loads
owned history; browser assistant messages are never submitted as authoritative context.
The UI shows safe progress and a small spinner on the matching sidebar chat.
Stop/disconnect use the server run ID and cancellation. Only an accepted result with
matching conversation and run IDs can render as a completed answer. Text-only real
answers are valid. No question automatically fires on first visit.

Assets, areas, people, history and saved views use bounded cursor pages. Asset search
queries all imported IDs, names, areas and well types server-side after a short debounce,
combined with the area filter. The table scrolls below always-visible search/filter controls;
Previous/Next controls show 25 rows per page and reset on filter changes. Paging assets
never runs an agent. The directory shows actual names/types/areas/coordinates; it does
not invent production status or spill totals absent from that endpoint. Historical
messages fetch immutable results only when near the viewport. Query keys include
namespace/person and reload does not regenerate previous answers.

## Panels, evidence and saved views

Native shared `ApplicationResult`/`ApplicationPanel` schemas drive status, table,
ranking, series, GeoJSON and matrix components. Unsupported obligations/claims/
correction presentations are not filled with old mock content. The backend may still
return a grounded text answer when it has evidence but no compatible visual.

Decimal labels retain exact strings; null/unknown/zero remain distinct. Numeric chart
projections only position marks and do not replace displayed values or backend
calculations. Series remain discrete observations. Maps preserve event versus asset
identity, missing geometry, unknown status and [longitude,latitude] order. Per-row,
point and cell controls open evidence attached to that exact immutable result.

The source browser has metadata search, source-type filters and bounded40-record pages,
with a separate scrolling reader. Documents and answers render safe Markdown, including
tables; record excerpts show labeled fields. Two compact citations plus an overflow control
keep rows readable; each opens the actual immutable source. Separate excerpts of a file
retain their individual locators. The reader provides exact original text, copy, partial-excerpt
notices and expandable provenance (record/source-version IDs, paths and line/JSON locators).
JSON numeric lexemes remain exact; older browsers without reviver context use original text.
Paths are provenance, never invented download URLs. Raw HTML and remote image loading
are disabled; Markdown media references remain text. Closing a dialog restores opener focus.
The reader and Markdown parser load lazily; reader geometry CSS is loaded with the shell.

Save is offered only for approved panel recipes. Definitions are persisted through
`/api/saved-views`; reopening, Apply and Refresh run the backend deterministic recipe
without a model call. New results have new identities. Old scope/time stays visible
until a fresh result is accepted; failures are shown within the focused dialog.
Saving a view never approves a correction or writes shared operational knowledge.

`src/api.ts` owns same-origin HTTP validation, `workspace.tsx` owns lifecycle/identity,
`pages/` own the destinations, and `components/ApplicationPanelView.tsx`/`GeoView.tsx`
render native shared data. The experiment-only schema copies and frontend mock data
were removed. No app imports another app's server implementation.

See [application API](application-api.md) and [contracts](contracts.md) for wire details.
Private-reference reasoning and additional domain/write tools remain agent-owner work.

## Verification

Run `pnpm typecheck`, `pnpm --filter @repo/web test`, `pnpm --filter @repo/web build`
and scoped Biome checks. Focused tests cover cookie/cursor handling, request/result
validation, stable chat request identity and exact decimal/unknown display. Browser
verification uses actual PostgreSQL reads, a real model chat, direct conversation URL
reload, original evidence, paginated assets, saved deterministic map/series/ranking/
matrix reads, fresh asset-scoped chats and persona isolation. It uses no fabricated
operational records. Temporary verification views/results are removed afterward.

## Map interactions

Asset and event maps share hover/focus identity, keyboard/click popups and evidence
actions. Marker selection updates styles and details without rebuilding layers or
refitting bounds. Asset inventory views omit event-only fields and status filters.
Search highlights matching returned records in blue and dims other markers; Only search
matches filters them instead. Search fits matches, and Fit map restores relevant bounds.
Annotations can show on hover, asset IDs, names or event volumes where supplied.
Missing coordinates remain records, overlapping events remain individually selectable
and unknown production is never inferred from spill events. Saved maps retain their
backend scope; search/label controls are temporary display state.
