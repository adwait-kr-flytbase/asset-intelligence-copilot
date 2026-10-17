# Operator component catalog

The continuous `/operator` page now consumes eight discriminated artifact kinds through the existing A2UI/direct trusted-widget catalog. This is a frontend/data-contract experiment using clearly synthetic records. The [backend handoff](backend-handoff.md) defines the proposed production integration and unresolved domain extensions.

| Component | Try in Explore another view | Useful interactions | Read binding |
| --- | --- | --- | --- |
| Geographic map | Spill map | Real basemap, pan/zoom/fit, keyboard markers, production/spill filters, linked records/details, exact sources, missing-coordinate list | `map` → `geo` |
| Multiple time series | Temperature history | Wellhead/ambient legend toggles, missing gaps, dated event evidence, accessible values table | `line` → `series` per selected well |
| Ranked comparison | Repair costs / downtime question | Currency/unit formatting, order, selected-well evidence and common zero baseline | `costs` → repair ledger ranking; `bar` → downtime ranking |
| Matrix | Spill distribution | Area/month event counts, exact-cell source drilldown, explicit zero versus missing | `heatmap` → `matrix`; metric determined by approved query binding |
| Compliance obligations | Compliance deadlines | Breach/pending/unknown/compliant filters, rule versus observation, deadline and source | `obligations` |
| Evidence chronology | Evidence timeline | Event-type filter, chronological records with category and sources | `timeline` |
| Competing claims | Conflicting claims | Attributed reports, measured observations, disputed states, source/status filtering | `claims` |
| Correction review | Correction review | Original/proposed value, reason, consequences and sources; explicitly read-only | `correction` |

Open **Explore maps, costs and operational evidence** on the welcome screen, or **Explore another view** above the composer after asking a question. These send ordinary prompts through the Hono pipeline; they are not static gallery cards. Save useful panels explicitly; named reuse and parameter Apply/Refresh call the same fresh read executor. New read kinds remain part of the one trusted rendering path, not a second dashboard protocol.

## Authority and scope

`src/artifact-contract.ts` validates artifact content, IDs, geographic pairs, ordered dates, matrix coverage and evidence membership. `src/protocol.ts` validates that artifact scope refers to returned wells and all evidence resolves in the result. `server/artifacts.ts` supplies deterministic fixture records and dedicated raw-temperature/cost/obligation/history/claim/correction evidence. No current fixture is an answer copied from the challenge examples. The bounded replay intent selector remains disposable lab code, not a production coordinator.

Inspection count applies only to inspection rows. Trend dates apply only to chart data. Costs, matrices, claims and obligations expose their own periods and rules. Browser formatting/selection does not recalculate domain truth. A status class, proposed correction or invented checklist must never be mistaken for a real regulatory conclusion or committed change.

## Map dependency and external requests

The lab pins Leaflet 1.9.4 and its types 1.9.22 in its nested project only. The geographic module is lazy loaded. The basemap requests standard HTTPS OpenStreetMap tiles with visible attribution and normal browser caching; no prefetch/offline tile download. Only tile coordinates leave the browser for the synthetic demo; no record bodies or source excerpts are sent. Marker/list/evidence functionality remains when tiles fail; unavailable basemap and missing coordinates are explicitly labelled. Select an approved enterprise tile provider/privacy policy before displaying real asset locations.

References: [Leaflet API](https://leafletjs.com/reference.html), [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/), [OSM attribution](https://www.openstreetmap.org/copyright).
