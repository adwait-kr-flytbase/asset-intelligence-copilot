# Operator-agent capability boundary

The challenge example questions are minimum product capabilities. Support should
come from composable domain tools and evidence, not question matching, fixed well
IDs, fixed dates, canned answers or one prescribed call sequence. The application
must generalize to additional assets, history, wording and combinations of questions.

## Keep the three-agent direction

Coordinator interprets scope, invokes the needed capabilities and synthesizes a
supported answer. Evidence investigator handles record/history/narrative retrieval
and deterministic calculation tools. Procedure specialist resolves applicable clauses
and checks structured obligations. Simple requests can use direct tools without
running all agents. Specialist loops remain future implementation; current code is
a coordinator with read-only evidence tools.

Calculations, effective corrections, permissions and writes belong to deterministic
services. Agents choose tools; they do not recreate fleet totals by reading top-k
snippets or infer authoritative policy from memory. Model/SDK and storage adapters
remain replaceable behind consumer-defined ports.

## Capability families that cover the minimum examples

| Family | Example baseline | Required reusable tools/services |
| --- | --- | --- |
| Current state and explanations | Q1–Q2 | Asset/fleet selection, measured status, scoped human context and linked reports |
| History and fleet analytics | Q3–Q8 | Ranged inspections/events, effective corrections, downtime/spill/cost calculations, ranking/grouping and coordinates |
| Procedures and obligations | Q9–Q10 | Applicable manual inheritance, report facts, protocol clauses, reporting/containment/deadline evaluation with unknown states |
| Private continuity | Q11, Q16 | Trusted ownership, conversation/result/entity references and time-aware reference resolution |
| Shared corrections/knowledge | Q12–Q13, Q15–Q16 | Validated scoped changes, original preservation, receipts, shared effective reads and recalculation |
| Scoped user policy | Q14 | Explicit policy provenance/applicability and type-specific overrides without rewriting manuals |
| Disagreements | Q17–Q18 | Targeted records and attributed competing claims, keeping notes separate from accepted corrections |

The current EvidenceReader is a small direct/document read port. Add separate
history/fleet query, calculation, correction, policy and private-memory ports as
needed; do not stretch it into arbitrary SQL or a universal action interface. Scope,
window, as-of time, units, coverage and provenance must travel through those results.
Higher-level fleet tools should return complete computed sets and summaries rather
than requiring hundreds of per-well model calls. Execution budgets can be configured
by capability as needed; five steps is the initial slice's limit, not a permanent
product restriction.

## Generalization rules

- IDs, area/type selections and dates are runtime inputs. Rules come from applicable
  documents or explicit scoped user policy. Fixed dates/answers live only in eval data.
- Original source versions and typed data are authoritative inputs. Retrieval discovers
  evidence; SQL/domain services establish complete aggregates and absence claims.
- Notes remain attributed assertions; accepted corrections change effective data and
  downstream results while preserving originals. Do not resolve a disagreement by
  whichever text ranks highest.
- Private conversational references are separate from shared asset knowledge. Demo
  user IDs do not establish production authorization.
- Typed calculations feed visual data. Explicit visual requests need matching typed
  artifacts; renderer work belongs to the UI worktree. The current shared wire contract
  only supports a well-status card. Tables/charts/maps/heatmaps need coordinated
  additive contracts when their backend consumers are built.
- Saved views store parameterized approved read/calculation bindings. Manual and agent
  reruns reuse those services; switching assets resolves fresh evidence and rules.

## Evaluation coverage, not sample fitting

`src/evaluation/catalogue.ts` lists every example and the required state chains.
Q6→Q11, Q12→Q2→Q15, Q13→Q15, Q14 before/after and Q11→Q16 must carry declared state
within a scenario and reset between trials. Isolated evaluation storage will be
needed for mutation scenarios; never replay writes against the shared development DB.

Start each capability with independently reviewed expected facts, then vary IDs,
values, time boundaries, types, missing/conflicting evidence and phrasing. Include
held-out inputs and new combinations. Accept alternative valid tool paths. Keep
expected answers out of agent context; do not generate the oracle with the same
calculator being evaluated.

Only the status/context/report baseline currently has executable model cases.
All other catalogue entries are explicit targets. The initial system prompt's limits
prevent unsupported claims until those tools exist; they are not permanent product
non-goals. Full example coverage and unseen-question success remain unmeasured.
