# Question coverage and remaining integration work

The 18 questions in `docs/problem-statement/example-questions.md` are a **minimum capability floor**. The adapter reads records and applicable manual/SOP passages; expected answers are used in verification, not runtime routing or lookup tables. Alternate wells, areas and date windows use the same data operations. Language routing is deliberately bounded and has no model; this prototype is not a claim that arbitrary natural-language questions are solved.

Select **Sample dataset** in the header to query the local 200-well data. Original files remain unchanged and are not copied into the app or bundled into the browser. If sample-data is absent, the smaller Synthetic demo still works.

| Scenarios | Current read / UI capability | Remaining real-backend capability |
| --- | --- | --- |
| Q1 | Latest inspection, type-rule temperature difference, inspector, planned note, stale recorded-status conflict; source-linked answer/card | Authorized current-data tools |
| Q2 | Area non-producing wells, recorded status, explicit missing reasons, open repairs, temperature difference and source-linked table | Live corrections and policy revisions |
| Q3 | Raw wellhead/air trend, non-production markers, pointer/touch observation inspection, difference transform, numeric table | Authorized image access / accepted corrections |
| Q4 | Corrected spill detections, count/volume, explicit table, false-positive provenance | Further correction lifecycle |
| Q5–Q6 | Inspection-derived downtime (7 days per observed below-threshold week), scope/date/top-N, ranking/table, calculation/manual evidence | Cross-chat authenticated entity recall for Q11 |
| Q7 | Geographic spill map with source-linked pins, pan/zoom/fit, spill-volume symbols, discrete thermal point layer, missing-coordinate fallback | Surveyed spill footprints / approved map provider |
| Q8 | Area × month event-count heatmap, corrected detections removed, cell evidence; zero remains zero | Broader schemas/aggregations beyond this bounded adapter |
| Q9 | **Partial:** SR-01/02/03 and RC-04 findings from actual inspection, regulatory and repair-report evidence; fines and parsed gaps shown | Complete RCA/manual duties, planned-shut-in registration, annual-test evaluation and all applicable protocols. Do not call this a full Q9 pass |
| Q10 | Extracted containment duration from linked repair reports compared to SOP, scoped obligations/table, preserved saved containment predicate | Robust extraction for differently phrased future documents |
| Q11 | Browser conversation history and explicit saved recipes | Authenticated backend private memory, semantic cross-chat references, per-user isolation |
| Q12–Q13 | Typed before/after correction review exists in synthetic mode; sample mode explicitly remains read-only | Authorized proposal/approval/commit, original-value preservation, provenance, recomputation and conflict confirmation against real records |
| Q14 | Manual and SOP retrieval; type-specific temperature rules | Persisted type-scoped policy overrides and complete RCA aggregation; preserve T200 vs T350 distinction |
| Q15 | Attributed existing evidence and conflict display | Accepted corrections shared across authorized users and recalculated reporting/deadlines |
| Q16 | Shared source notes can be retrieved; no invented prior conversations | Authenticated separation of shared knowledge and each user's private conversations |
| Q17 | Existing inspection/notes can be compared with attributed claims | Persist newly supplied unconfirmed statements, show disagreement, request confirmation, audit later resolution |
| Q18 | Actual inspection, linked repair and both conflicting notes shown; ordinary notes do not delete a spill | Future authorized new claims/corrections |

## Verified sample anchors

- WELL-0001: INS-0001-0203, Ryan Brooks, Δ3.2 °C; planned-shut-in note retained.
- Northeast Block 8: four non-producing wells with two unexplained stops.
- WELL-0001 last 13 weeks: 13 readings; non-producing 8 and 15 Oct.
- WELL-0001 four-year spills: six retained, 15.1 bbl; formal rainwater correction excluded.
- WELL-0001 2025 downtime: 21 inspection-derived days.
- Northeast Block 7 downtime leaders: 49/42/42 days for WELL-0121/0138/0107. Date windows are displayed; explicit ISO dates can specify the example's exact June16–October16 window.
- Northeast Block 8 recent spills: four geographic pins.
- 2026 area/month counts: 35/43/37/26; 141 retained events.
- Bounded WELL-0001 compliance: four breach findings, USD5,000 open notice; pending manual/RCA duties are outside this evaluator.
- Southwest Block24 recent late-containment reports: about 7.1 and 8.1 hours.

These anchors are checked against raw records with evidence closure. They are not a substitute for the stateful Q11–Q17 scenarios. No challenge user picker is presented as authentication; browser local storage is not durable enterprise memory.

## Extending without overfitting

The real coordinator should select read tools by data need, with runtime-validated records, time windows, units, aggregation methods, rule versions and source locators. The presentation layer accepts approved data artifacts and a requested presentation, not expected question IDs. One answer can combine visuals, cited text, conflicts or a write proposal; a question may also need no new visual. Saved reads preserve dataset, intent, metric, predicates, scope and presentation and use fresh authorized tools.

Add future visual schemas only for a demonstrated data need: a spatial raster requires actual georeferencing; an operational action requires authorization and a separate write lifecycle. Do not turn unfamiliar questions into whichever of the eight components happens to match a keyword.
