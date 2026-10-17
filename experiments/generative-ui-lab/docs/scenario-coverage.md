# Minimum capability coverage

Source: [example questions](../../../docs/problem-statement/example-questions.md), read together with the [problem statement](../../../docs/problem-statement/problem-statement.md). These are minimum capabilities; question numbers are traceability labels only. This is an architecture checklist, **not a passing test report**. No expected sample answers are embedded here or in the demo.

| Examples | General capability required from agents/backend | Frontend/interaction contract | Saved read suitability |
| --- | --- | --- | --- |
| Q1 | Reconcile latest inspection, applicable type manual, stale maintenance state and human context; distinguish observed condition from proposed cause | Evidence-backed status, conflicting/stale claims, as-of date | Parameterized inspection read; recompute context |
| Q2 | Filter by geographic/organizational scope, derive nonproduction and retrieve supporting reasons; expose unknown causes | Scoped table, missing reason, provenance | Read recipe with area/type parameters |
| Q3 | Retrieve date-bounded raw series, calculate classifications and mark events | Multiple named series with units, ambient versus wellhead values, event markers | Series recipe with well/date parameters |
| Q4 | Aggregate corrected spill events over arbitrary windows | Count/volume/table with correction trail | Corrected-event read, not correction replay |
| Q5 | Derive weekly downtime over a requested year; reason from temperature difference | Concise text with evidence; no mandatory chart | Read can be saved, but no forced visual |
| Q6 | Rank/group date-bounded calculated downtime; handle ties/type rules | Ranked bar/table, units and explicit window | Parameterized ranking read |
| Q7 | Filter true events, dates and coordinates, exclude accepted false positives | Event map plus accessible event details | Geographic read |
| Q8 | Aggregate arbitrary two-dimensional groups and time buckets | Heatmap with labelled axes, units and table alternative | Aggregation read |
| Q9 | Join manuals/SOPs/regulatory notices, structured records and narrative reports; distinguish breach, pending obligation, compliance and missing proof | Obligation/action table with deadlines, amounts, provenance and uncertainty | Read only; no action/acknowledgement replay |
| Q10 | Extract narrative timestamps, apply applicable deadlines and date/area scope | Breach table, duration/limit and source passages | Read with rules/source revisions |
| Q11 | Resolve a prior private conversation's entity set, then retrieve period-specific maintenance costs | Referenced-context explanation and cost comparison | Resolved IDs may parameterize a read; private access reauthorized |
| Q12 | Capture attributed correction preserving original, detect contradiction, recalculate classifications | Proposed correction/review, original/revised values, conflict, refreshed affected results | Never replay correction; dependent reads recompute |
| Q13 | Correct a value and propagate threshold crossing into obligations and stale prior classifications | Correction provenance, consequential deadlines and superseded-answer warning | Read-only consequences; write separate |
| Q14 | Persist a user-supplied type-scoped policy with authority attribution; recompute RCA eligibility in future chats | Manual versus user policy, exact scope and effective version | Read uses current authorized policy; policy update separate |
| Q15 | Apply shared corrections across authorized users without exposing private transcripts | Actor/source attribution and consistent recalculated data | Reauthorize shared data; no private-history reuse |
| Q16 | Share operational knowledge while isolating private conversational references | Shared context attribution; clarification when private reference unavailable | Saved definition sharing and conversation privacy remain distinct |
| Q17 | Retain contradictory human claims and observations; ask confirmation without inventing resolution | Competing claims, timestamps, unconfirmed state and clarification | Read current claims; never persist inferred correction |
| Q18 | Distinguish disputed note from accepted correction; reconcile later confirming evidence | Evidence chronology and retained original event | Corrected-event read only applies accepted overlays |

## Stateful acceptance sequences

- Ranking → next-day private recall → costs, including another user's attempt at the same private reference.
- Accepted correction → rerun aggregate/list → open an affected saved view → another authorized user's read.
- Corrected spill volume → recompute threshold/deadline obligations → identify stale prior analysis.
- Type-scoped policy change → fresh conversation → recalculate only matching asset types.
- Conflicting claims → clarification/new evidence → preserve original and audit lineage without silently overwriting.

Repeat these with unseen entities, new periods, alternative manuals and paraphrases. Include empty results and missing evidence. Reset baseline records outside intentionally stateful sequences. Retrieval/domain-calculation correctness and privacy must pass independently of whether a visual looks correct.

## Current lab coverage

The lab exercises the **interaction mechanisms** for a subset: synthetic inspection/status data, a single delta-temperature series, downtime ranking, spill map/heatmap, selected conflicts, source dialogs, text-only explanations and explicit reusable read views. Its local regex matching and query enum are not production planning. All other capabilities remain production acceptance requirements, not silently unsupported product scope. See [product architecture](product-architecture.md) for ownership and boundaries.
