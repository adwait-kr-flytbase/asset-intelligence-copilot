# Current decisions and their reasoning

This is the current decision record. The user approved Fieldwork and explicitly requested deleting the earlier demo. Historical research and retired logs are retained as evidence of exploration, not competing implementation instructions.

| Decision | Reason and consequence |
| --- | --- |
| Keep only Fieldwork in `experiments/operator-next` | The user prefers this experience. Remove old code/dependencies/services instead of leaving multiple confusing review URLs; preserve useful handoff material and data already embedded here |
| Keep real apps and public contracts untouched during prototyping | Frontend/backend develop independently. This experiment is reviewable without changing production boundaries or forcing a new shared API |
| Match React/Vite, TanStack Router/Query and AI SDK stack | Learn on the actual frontend stack. Use a nested project and lockfile so dependency experiments do not change root tooling |
| Hono provides the demo backend | Validate HTTP/stream/read contracts with a real service, not only static screenshots; no source import across apps |
| Continuous conversation is primary | The user rejected the permanent split/dashboard pattern. History provides context while each result appears inline |
| Compact result → optional focused same result | Rich inspection needs space, but every question should not rearrange the whole page. Expand does not rerun a pipeline or replace the original result |
| Text-only answers are valid | Explanations and factual answers may need citations rather than another chart; avoid forcing component generation |
| Assets and Saved views are real destinations | Operators can browse directly and reuse work without writing every navigation action as a prompt |
| Selection becomes visible removable context | Lower repeated typing and preserve investigation focus; explicit new well/all-well requests override old scope |
| Focus follows its own displayed scope | Asking “about this result” must not silently query all assets or a different previously selected well |
| Keep completed results immutable | Old values, evidence, sources, scope and timestamps must remain associated; failure/loading cannot relabel old data |
| Append follow-ups, do not silently replace focus | The operator chooses when to return to the new answer. A delayed read cannot reopen a dismissed focus |
| Save view requires an explicit action | Chat history, current selection and a useful unsaved response are not consent to create a reusable view |
| Save a typed read recipe, not narrative/cache | New well/date data must come from fresh reads. Dataset, metric, area/subset, predicates and requested presentation remain explicit |
| Manual Apply/Refresh and named reuse share the read executor | Useful controls do not need model layout regeneration. Refresh uses applied parameters, not invalid unsubmitted drafts |
| Preserve predicates rather than today's matching rows | A saved area spill/non-production/containment query should re-evaluate fresh records instead of freezing its current matches or broadening into another analysis |
| Literal saved names resolve before punctuation aliases | Names can include punctuation. Unrelated questions must not accidentally invoke an earlier saved analysis |
| Backend owns domain truth and evidence | Production, downtime, corrections and compliance cannot be inferred from chart appearance or stale asset status |
| Approve typed renderer catalog instead of arbitrary generated code | The agent selects meaningful representations while frontend components remain consistent, inspectable and contained. No executable model-authored SQL/JS imports |
| Use AI SDK UI-message streaming, not RSC | Fit the application boundary; chat owns the live stream and Query owns ordinary reads. App code still owns context, persistence and identity |
| No A2UI/CopilotKit requirement for this prototype | Protocol/interaction libraries do not establish data truth or UX quality. Fieldwork uses canonical typed artifacts directly; it does not claim A2UI compatibility. CopilotKit remains a conditional future adapter comparison, not a rejected capability claim |
| Preserve dated framework research without adopting every technology | A2UI describes surfaces, AI SDK execution/streaming and CopilotKit agent/application interaction. They are different layers. Recheck versions and test the exact catalog/lifecycle before a production decision |
| Google/ChatGPT inform interaction patterns, not UI cloning | Question-specific representations and compact-to-focus exploration are useful; native products, developer SDK capabilities and experiments must be distinguished |
| Light theme with restrained indigo | The user prefers light. Prior teal lab styling was rejected; use calmer landmarks, readable hierarchy and meaningful operational colors |
| No decorative controls | No fake microphone, upload, Apply-correction or approval action. Future voice should share visible context and deliberate on-screen review |
| Maps use validated coordinates and discrete observations | Volume symbols encode bbl, not spill extent. Thermal point differences are not a geographic raster; no fabricated missing coordinates or imagery |
| Charts expose raw readings, gaps, table and local transforms | Operators need inspectable numbers. Wellhead minus ambient is explicit; classification uses the applicable backend manual, never absolute heat alone |
| Formal corrections differ from ordinary claims | Preserve originals, attribution and disputes. A note alone does not erase a recorded spill or silently resolve disagreement |
| Late completion remains historical breach | A closed passing verification after its deadline is not evidence that the deadline was met; show closure and lateness together |
| Separate synthetic and local sample modes | Demo output is labelled. Optional sample reads validate real source shapes while original files stay ignored, unchanged and server-side |
| Example questions are minimum capabilities | Use generic operations over wells/areas/windows/rules/documents, not runtime expected-answer tables. Demo language routing remains explicitly bounded |
| Declare incomplete backend features | Browser history is not authenticated private memory; correction review is not a committed change; bounded SOP evaluation is not complete compliance |
| Validate identity, closure and interruption at boundaries | Late/cross-run evidence, invalid geography and executable fields must not become trusted visuals. Rendering failure should preserve source access |
| Keep one handoff folder | This directory collects current implementation, components, contracts, research, original saved-view inputs, verification and retired decision provenance for the next agent |

Production choices still open: model/provider and coordinator integration, accepted shared contract variants, authentication/authorization, enterprise memory and recipe persistence, action capabilities/audit, full calculation/document extraction coverage, approved map hosting, attachments and richer evidence granularity. These are real integration work, not hidden behind the demo styling.
