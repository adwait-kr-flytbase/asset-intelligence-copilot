# Asset Intelligence Copilot — problem-statement index

Start here for challenge context, then follow the links for the task at hand. The source documents live alongside this index in `docs/problem-statement/`.

## High-level overview

Build a chat copilot that answers oil-field operators' plain-English questions about wells with evidence from inspections, repairs, regulatory events, human notes, manuals and operating procedures (SOPs). The sample covers 200 wells in four areas over roughly four years.

The challenge is the agentic layer: storing and retrieving mixed data, combining calculations with document rules, selecting useful inline visuals, remembering shared well knowledge and private user conversations, and applying corrections without hiding conflicts. Model training and image analysis are outside the requested scope. There is no starter app or prescribed technology stack.

## Document directory and reading order

| Order | Document | Read it to find |
| --- | --- | --- |
| 1 | [Problem statement](problem-statement.md) | Motivation, domain vocabulary, required product behavior, event flow, submission requirements and judging. |
| 2 | [Dataset guide](dataset-guide.md) | Dataset layout, every record type and field, joins, production inference, downtime counting and data pitfalls. |
| 3 | [Example questions](example-questions.md) | Eighteen evaluation scenarios with expected facts, evidence, visuals, memory behavior and correction/conflict handling. |
| 4 | [Setup and resources](setup-resources.md) | Dataset repository and acquisition, coding/model setup options and verification instructions. |

These are challenge requirements and sample expectations, not a description of an implemented system. Consult the linked sources when implementing or evaluating behavior.

## Find information by task

| When working on… | Go to | What to look for |
| --- | --- | --- |
| Product scope and chat experience | [What you build](problem-statement.md#what-you-build) | Generative inline UI, evidence, two memory levels, feedback, conflict disclosure and unseen-data support. |
| Visual selection | [Choosing the visual](example-questions.md#choosing-the-visual) | Honor an explicit visual request; otherwise use a suitable card, table, line/bar chart, map or heatmap. |
| Ingestion and data modeling | [Folder layout](dataset-guide.md#folder-layout), then the field tables below it | Fleet data, per-well files, IDs, timestamps, equipment, repairs, regulator events and human context. |
| Production status and downtime | Dataset guide → **Inspections**; examples **Q1–Q3, Q5–Q6** | Apply the well-type manual to temperature differences; count downtime from inspections. |
| Spill totals and spatial/time analysis | Examples **Q4, Q7–Q8** | Exclude formally corrected false detections; aggregate by time/area and retrieve well coordinates. |
| Compliance and root causes | Examples **Q9–Q10, Q13–Q14**; dataset guide → **Repairs**, **Regulator events** | Combine SOP/manual rules, structured events and facts found only in repair reports. |
| Private conversation memory | Examples **Q11, Q16** | Resolve a user's earlier references across chats while keeping other users' conversations private. |
| Shared well knowledge and corrections | Examples **Q12–Q16**; dataset guide → **Human notes** | Preserve originals and correction provenance; apply changes across users at the correct well/type scope. |
| Contradictions and uncertain claims | Examples **Q12, Q15, Q17–Q18** | Show conflicting evidence, retain both claims and distinguish formal corrections from ordinary notes. |
| Evaluation and test sequencing | [How we check answers](example-questions.md#how-we-check-answers), plus the scenario directory below | Exact facts, cited evidence, suitable visuals and scenario-specific state dependencies. |
| Dataset acquisition and runtime setup | [Sample Dataset](setup-resources.md#sample-dataset) and the setup sections that follow | External repository, `sample-data/` layout and provider/local-model setup examples. Verify current provider details before using them. |
| Final delivery | [How the day runs](problem-statement.md#how-the-day-runs), [What to submit](problem-statement.md#what-to-submit), [How we judge](problem-statement.md#how-we-judge) | Test-data release in the final two hours; OrganizerHQ submission; two-page write-up, video up to five minutes and public licensed repository. |

## Dataset lookup map

Paths below are relative to the repository’s `sample-data/`, as described in the [dataset guide](dataset-guide.md).

| Path | Use for |
| --- | --- |
| `fleet/areas.json`, `fleet/users.json` | Areas, teams, well membership, user names and roles. |
| `fleet/well-types/T200.md`, `T350.md` | Production thresholds and type-specific operating/maintenance rules. |
| `fleet/sops/*.md` | Spill response, regulatory compliance and field-work protocols. |
| `assets/WELL-XXXX/metadata.json` | Well type, ownership, location, equipment and recorded status. |
| `assets/WELL-XXXX/inspections.jsonl` | Temperature readings, spill detections/volumes, inspector and discovery time. |
| `assets/WELL-XXXX/maintenance.jsonl` | Repair issue/action, dates, costs, inspection link and report path. |
| `assets/WELL-XXXX/maintenance-reports/*.md` | Narrative root causes, containment timing, cleanup, safety and compliance details. Follow `report_file`; filenames vary. |
| `assets/WELL-XXXX/regulatory-events.jsonl` | Reports, notices, fines, status and related inspection IDs. |
| `assets/WELL-XXXX/context.jsonl` | Human notes, formal corrections, authors and validity periods. |

Start joins from the well's `asset_id`. Its `well_type` selects the manual; inspection IDs link discoveries to repairs, regulatory events and corrections. **WELL-0001** is the reference well with every record category.

## Rules to carry into implementation

- **Production is derived:** compare `wellhead_temp_c - ambient_temp_c` against the threshold in the applicable type manual. Absolute temperature and possibly stale `recorded_status` are insufficient.
- **Downtime is inspection-based:** each non-producing weekly inspection in the requested period contributes seven days. Missed inspections contribute zero. Repair `downtime_hours` measures job duration and is not the downtime metric.
- **Documents supply executable rules:** retrieve thresholds and deadlines from manuals/SOPs. Containment timing and other necessary facts can exist only in free-text repair reports.
- **Corrections preserve history:** retain the original, who corrected it and why; apply the correction in subsequent answers for every user within its well or type scope. Attribute user-supplied rules separately from manual rules.
- **Notes and formal corrections differ:** contradictory notes remain visible evidence; an ordinary assertion does not silently replace a detection or resolve a disagreement.
- **Memory has two scopes:** share well knowledge and feedback; isolate each user's conversational history. A user picker is sufficient for the challenge UI.
- **Answers need traceable evidence:** cite the records and documents used, disclose missing explanations and conflicts, and use well IDs plus area/team/person names in answers.
- **Evaluation has a fixed clock:** example scenarios use **17 Oct 2026** as “today”; “right now” means the latest inspection. Repairs belong to periods by their start date. Q6 explicitly specifies **16 Jun–16 Oct 2026**; consult each scenario's exact window.
- **Generalize beyond the sample:** load the later test dataset alongside the sample and support unseen questions. Expected sample answers are validation targets, not application rules.

## Example-scenario directory

All scenarios and their full expected answers are in [Example Questions](example-questions.md).

| Scenario | Capability / lookup |
| --- | --- |
| Q1 | Current production, latest inspector, planned shutdown and stale status for WELL-0001. |
| Q2 | Area-wide non-producing wells with explanations in a table. |
| Q3 | Temperature history and non-production markers in a line chart. |
| Q4 | Corrected spill count and total volume for one well. |
| Q5 | Annual inspection-derived downtime, including a deceptively hot idle well. |
| Q6 | Top three wells by downtime in an area, shown in a bar chart. |
| Q7 | Map of wells with real recent spills. |
| Q8 | Area × month spill-count heatmap. |
| Q9 | Cross-source compliance breaches, fines and pending actions. |
| Q10 | Containment deadline breaches using narrative repair reports. |
| Q11 | Cross-chat private recall of Q6's wells and their repair costs. |
| Q12 | Raw temperature correction; rerun Q2 and disclose conflicting inspector evidence. |
| Q13 | Spill-volume correction that changes reporting and compliance obligations. |
| Q14 | Persistent T350-only root-cause-analysis rule; preserve T200 behavior. |
| Q15 | Q12/Q13 corrections visible to other users, with provenance/conflicts. |
| Q16 | Shared planned workover knowledge and private-history isolation following Q11. |
| Q17 | User statements contradict inspections or other users; retain unconfirmed claims. |
| Q18 | Disagreeing spill notes without a formal correction; show both sources. |

Run scenarios on the original sample unless they specify prior state. Preserve the explicit sequences **Q6 → Q11**, **Q12 → Q2 rerun**, **Q12 + Q13 → Q15**, and **Q11 → Q16's private-memory check**. Q14 includes its own before/after rule change.
