> Original product/backend design input. Tentative production concepts are preserved; implemented demo behavior and missing backend capabilities are described in ../architecture.md and ../question-coverage.md. The referenced base frontend-generative-ui-handoff.md was not supplied; ../backend-handoff.md is the retained integration proposal.

# Saved operator views: reusable data recipes with agent control

17 October 2026. Product/backend-contract design only. The user delegated sensible recommendations and proposed saving useful generated views, changing well/date inputs manually, and letting the agent reuse a matching saved view while answering unrelated questions normally. Earlier explicit no-implementation instruction remains in force. No UI code, shared schema, database migration or endpoint is added here.

## Recommendation

Support both manual parameter changes and agent-assisted reuse over one saved definition. Build one reusable view capability rather than an agent-dependent imitation of a previous answer. A saved view keeps the chosen component composition and validated read/query bindings; each execution supplies current parameters and returns fresh data, citations and tool activity. A small named view is sufficient initially; a general dashboard editor, arbitrary SQL and free-form executable UI are unnecessary.

This is a familiar product pattern: Metabase binds dashboard filters/parameters to cards to avoid separate dashboards for every data slice, and Grafana variables substitute inputs in queries and dashboard elements. These precedents establish feasibility of parameterized views, not evidence of an operator preference or a reason to adopt either platform. [Metabase dashboard filters](https://www.metabase.com/docs/latest/dashboards/filters), [Grafana variables](https://grafana.com/docs/grafana/latest/visualizations/dashboards/variables/).

## Operator journey

1. Ask about Well 001's latest condition, last five inspections and recent temperature history. Agents/tools assemble a useful answer and supported artifacts.
2. Ask to save the useful composition as “Well inspection overview,” or use a save action supplied by the UI worktree. Save selected useful panels, not the entire conversation or every intermediate tool output. Allow a suggested name and adjustable well/date/count inputs.
3. Open that saved view and select Well 002. Execute the same approved read operations with the new parameters, retaining component types, chosen columns, units and layout. No model reasoning is required merely to change the parameter and refresh the data.
4. Alternatively ask “Use my inspection overview for Well 002.” The existing coordinator finds the accessible definition, resolves the inputs and calls the same execution path.
5. A new question about a different metric or analysis uses normal agent/tool generation. It may use relevant saved-view results as context without forcing the question into a template that cannot answer it.

Changing the well during one run is a parameter override, not an edit to the saved definition/default. Saving a new default or changing panels is explicit. Multiple users/tabs can run the same definition with different parameters without a shared mutable “current well.”

## What gets saved

| Object | Meaning | Lifecycle |
| --- | --- | --- |
| View definition | Name/purpose, supported entity kinds, panels, typed parameters, validated query references and bindings | Stable view ID with revisions; user-owned initially |
| Execution | One definition revision plus resolved parameters and data evaluation time | New run ID per refresh; result/artifact IDs and actual read activity |
| Result artifact | Typed values/rows/series, sources, applicability, coverage and missing-data state | Belongs to an execution; never renamed/rebound to another asset without rerunning |
| Optional saved result | Preserved outcome of one execution | Explicit dated historical result; not equivalent to a live reusable view |

Save validated read recipes, not prompts, internal chain-of-thought, arbitrary code or an exact transcript of tools that happened to run. The coordinator/tooling layer already knows which application operations generated the visible results; it should supply reusable operation descriptors where those operations support it.

A typed query reference names an allowlisted read operation/version with validated constant arguments and explicit parameter bindings. For example, a well input binds to the asset scope of the overview, inspection list and trend query. Required source namespace comes from authorized application context, not an editable client field. UI component/catalog references and data-shape compatibility are validated before the definition is accepted.

A few independent queries and declarative parameter references are enough initially. Do not introduce a general expression language, workflow DAG editor, generic SQL executor or separate dashboard service to support this first use case.

## Parameter design and refresh semantics

A saved definition declares which inputs can change: first well, a bounded inspection count and a time range where the panels support one. Keep the distinction between “last five inspections” and “inspections during the last 90 days.” If a date control applies only to a trend, its label/binding should say so. Display meaningful fixed constraints such as corrective-only maintenance; do not silently hide filters.

Relative periods such as “last 90 days” resolve at each execution using an explicit clock/time zone, and the returned result records the resolved interval. Absolute dates remain absolute. The full recipe retains the metric definition, grouping and interpretation: inspection-based downtime must not turn into repair duration on refresh.

Recommended first behavior is explicit refresh: opening a view runs its read recipe, changing parameters and applying them starts a new run, and manual refresh reruns current parameters. Reopening can immediately show a clearly dated last result while refreshing; it must not imply the displayed result is current. No background scheduling or continuous LLM loop initially.

Changing from Well 001 to 002 invalidates all panels bound to that well, including labels, explanatory context, applicable manual/type rules, sources and tool activity. The backend resolves rules for the newly selected well. Preserve panel composition where supported; missing data/type-specific inapplicability yields an explicit panel state. Never substitute the old well's values or manual to fill a gap.

Each result carries view ID/revision, run ID, resolved parameters, evaluation/as-of time, source versions and rule/correction provenance where available. During refresh, prior data stays labeled with its own parameters/time; a failed Well 002 run must not look like a successful Well 002 view showing Well 001 data. Independent panels may have partial failures, but the composite result identifies its run/parameters and coverage.

A deterministic refresh means the same validated operations and presentation bindings execute without an LLM reinterpreting the prompt. Fresh inputs, new data or accepted corrections can legitimately change values. Same layout does not mean same answer forever, nor a guarantee of full historical replay.

Current storage provides relational records and versioned original sources, not a snapshot/query-history framework. Persisting the previous result and its citations can preserve what was shown; exact rerunning against an arbitrary old database state is a separate future capability. Do not require a temporal framework for ordinary current-data views. [Current storage boundary](../../docs/storage.md).

## Deterministic versus AI-derived panels

A status calculation, inspection table, date-bounded metric, trend series or validated obligation check can use a deterministic refresh recipe. Narrative search may be repeatable as a search operation, but free-form cause inference or synthesis is not automatically deterministic just because its last tool results were structured.

At save time classify panel refresh behavior:

- **Deterministic:** eligible read/analysis recipe returns fresh data without a model call.
- **AI-assisted:** a separate “Update analysis” step is required; show that it invokes agents and produces a new dated interpretation.
- **Static:** user text/help content remains applicable to the whole view, or an old explanation stays visibly labeled with its original scope/time.

For the first version save deterministic panels and static instructional labels. Exclude/surface a clear warning for dynamic narrative panels without a validated recipe. A view can offer “Explain these results” through the coordinator later. Do not preserve a one-off factual sentence about Well 001 as the refreshed answer for Well 002. Event-driven invocation of agents should be explicit and bounded, not a hidden side effect of changing a well filter.

## Agent reuse without hijacking new questions

Keep the current three agents. Add saved-view discovery/execution tools to the coordinator, not a new view-selection agent or Jev classifier. Saved definitions expose a concise description, entity types, supported metrics/questions and parameter schema so the coordinator can judge actual applicability.

Reuse priority:

1. Explicit named view or clear reference to the active view: run it after resolving inputs.
2. A saved view fully covers the requested analysis and compatible entities/filters: reuse it, identifying which view/parameters were used.
3. Partial match: answer the uncovered question normally and optionally include the relevant saved view. If the user requests a modification, propose an unsaved derivative; do not silently rewrite the saved definition.
4. No match: generate a fresh supported result using the normal agent/tool flow.

Comparing words alone is insufficient: an inspection view does not answer repair-cost rankings merely because both mention the same well. A detailed “why” question may need additional investigation even when the saved view displays relevant observations. If several named views fit and the reference is materially ambiguous, ask a concise clarification or present a normal answer with the useful alternatives; do not guess which private view the user intended.

## Small coordinator tool additions

- findSavedViews: accessible definitions summarized by purpose, supported inputs and analyses; private-scoped retrieval rather than conversational memory guessing.
- getSavedView: full authorized definition and its revision/parameters.
- runSavedView: validate overrides, authorization and operation compatibility, resolve parameters, execute read recipes and emit the usual result artifacts/tool trail.
- saveView: validate a proposed definition from supported result recipes and save a named private revision after the user's save instruction. No extra confirmation ceremony for an ordinary requested private save.

These are proposed application operations/wire contracts, not implemented names. Normal runs are read-only. Definition edits use expected revision and explicit user intent; stale writes are rejected/merged deliberately rather than last-write-wins. Creation/execution must not replay corrections, note writes, assignments, emails or handover delivery. Saved views never embed executable arbitrary agent tools supplied by a browser.

## Ownership and defaults

Default to private personal views. Keep view ownership/preferences separate from shared asset knowledge and private conversation history. Real user-scoped persistence requires trusted server identity; the existing challenge picker is demonstration identity only. Check current data access on every run and parameter selection. A copied/shared view should not become a capability to read restricted data; sharing/roles are deferred from the first version.

Definitions and execution/result persistence belong on the backend through a small SavedViewStore/application port, with eventual PostgreSQL-backed storage coordinated with the schema owner. Do not add saved-view tables/migrations to the storage agent's work without coordination. Definitions are plain versioned data, so they can be replayed via the same application services regardless of storage/agent provider. Operation/component incompatibility should produce a clear needs-update state; never let a model silently reinterpret old recipes.

## Frontend coordination, not frontend work here

The frontend can prepare for saving an answer composition, listing named views, typed well/date/count controls, refreshing, per-panel missing/error states and parameter-aware result titles. Chat and direct controls invoke one run contract. Definition, parameter schema, panel/component references, run results and operation summaries should be shared browser-safe types when finalized. We do not select a layout or implement any controls in this worktree.

An illustrative [saved-view concept fixture](saved-view-concept.json) accompanies this proposal. It is draft semantic JSON, not valid current visualSchema or an executable query language. A [frontend addendum](frontend-saved-views-addendum.md) points out the new contract needs. Both extend the earlier handoff and require no branch synchronization to inspect via absolute path.

## Recommended first scope

A named, private, parameterized view composed from approved deterministic results; one well selector, bounded inspection count, an optional relative/absolute time range for supporting panels, refresh, and coordinator-assisted invocation. Same view component composition for a compatible Well 002, with fresh results/citations. No free-form dashboard editor, automatic private-view sharing, scheduled agents, cross-source data joins written by users or general workflow engine.

Useful acceptance cases for a later plan: Well 001 → Well 002 without layout regeneration; same view invoked manually and through chat; changed rule/type/accepted correction reflected on new run; missing data shown rather than substituted; unrelated question generates new results; partial match supplements rather than hijacks; a repeated run executes reads only; concurrent parameter overrides stay independent; an old explanation never becomes a fresh claim about the new well.
