> Historical research snapshot from17October2026. References to retired lab code, split layouts, local captures or an A2UI baseline are historical; current decisions/architecture in the parent folder take precedence. Vendor findings are dated, not a fresh compatibility guarantee. Raw third-party captures are not bundled.

# Operator GenUI experience: desktop, mobile, history and future voice

Research date: **2026-10-17**. Scope: current first-party product documentation, human–AI interaction guidance and the existing lab. This is research and a proposed product direction, not an implementation or an approved final design. No operator study, comparative usability benchmark, or real-model experience evaluation was performed.

## Recommendation

Keep the desktop conversation beside a persistent investigation view. Make **the investigation**, with its questions, result versions, evidence and scope, the durable unit of work. For mobile, preserve that unit through a single-column conversation with rich inline results and an expandable full-screen view. Future speech should operate on this same state and history, with brief spoken summaries and visible data, rather than becoming a disconnected voice chatbot.

The user explicitly likes the Lovable-like split, wants an uncomplicated operator experience and scrollable chat history, and has clarified **desktop and mobile as primary targets**, with future voice and minimal unnecessary interactions. This supersedes the initial desktop-first/tablet-friendly working assumption.

The lab is not the final experience. Its controls expose experiments and renderer settings, its conversation renders only the last six messages, and it persists only the last complete canvas snapshot. Those choices helped test the rendering boundary; they do not implement operator navigation or durable conversation history.

## Evidence and what it means

The [companion product review](product-ux-patterns-2026-10-17.md) covers six experiences with direct official references. The observations below distinguish documented capabilities from our application-specific inferences.

| Reference | Documented pattern | Useful lesson for this application |
| --- | --- | --- |
| Lovable | Chat/preview split; historical versions link to originating messages; snapshot inspection and explicit return to latest | Link every substantial answer to its result and show when a historic result is open. Do not copy code/deployment chrome into an operator tool. |
| Microsoft Data Formulator 0.7 | Data Thread records questions, intermediate findings and charts; supports revisiting/branching analyses alongside an editable canvas | The thread should preserve analytical context, rather than functioning only as a disposable prompt list. Keep analyst/code controls out of the default operator surface. |
| Claude Artifacts / Gemini Canvas | Persistent result spaces and contextual/direct edits alongside conversation | Let operators ask about a selected well, point or interval; common changes should also have simple controls. |
| Hex | Thread-based visual analysis with inspectable work; a documented GenApp boundary is that rendered filters/selections are not automatically agent context | Explicitly synchronize current scope and the selected result with the agent. Screen proximity does not imply shared context. |
| ThoughtSpot Spotter | Resumable history, with a documented behavior of refetching live data and possible divergence from old saved analysis | Opening the original historical answer and refreshing with current data must be different operations. |
| Power BI Copilot | Inspectable interpretation/filters; documented data questions do not inherit report slicers | Keep interpreted field/well/date/metric scope visible and send that scope explicitly to the backend. |
| Gemini Live | Voice/text continuation, interruption, captions and revisitable transcripts | Voice should share investigation state/history with text and support interruption without destroying the result. Availability differs by device/account. |

Sources: [Lovable history](https://docs.lovable.dev/features/projects/history), [Data Formulator 0.7](https://www.microsoft.com/en-us/research/blog/data-formulator-0-7-ai-powered-data-analytics-for-enterprise-data/), [Hex app chat](https://learn.hex.tech/docs/explore-data/chat-with-app), [Spotter history](https://docs.thoughtspot.com/cloud/26.10.0.cl/spotter-conversation-history), [Power BI data questions](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-ask-data-question), [Gemini Live](https://support.google.com/gemini/answer/15274899?hl=en). Claude/Gemini Canvas source details and version limitations are in the companion report.

### Research-backed principles, rather than product popularity

Microsoft's Human–AI Interaction guidelines emphasize clear capabilities, contextually relevant information, efficient correction, remembering recent interactions and cautious adaptation. These support a predictable shell and visible context around generated content. They do not prescribe an optimal split-pane ratio or prove a specific product best for operators. [Microsoft HAI guidelines](https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/).

Google PAIR recommends explaining user benefits rather than underlying technology, introducing capabilities when needed and providing useful explanations that calibrate trust. For this app, that suggests operational labels and contextual evidence instead of renderer/protocol controls or a generic model-confidence percentage. [Mental models](https://pair.withgoogle.com/guidebook-v2/chapter/mental-models/), [Explainability and trust](https://pair.withgoogle.com/guidebook-v2/chapter/explainability-trust/).

DynaVis explores natural-language visualization editing that synthesizes persistent controls for subsequent adjustments. The transferable idea is that operators can ask for a capability once and then manipulate the resulting controls. This is a research prototype in visualization editing, not evidence of enterprise reliability or a reason to execute arbitrary generated code. [DynaVis paper](https://arxiv.org/abs/2401.10880).

## 1. A small, stable operator shell

Proposed default controls: **New chat**, **History**, question entry and the current investigation's scope. Results provide their own relevant actions such as **Sources**, **Show as table**, **Refresh** and **Ask about this well**. Keep developer diagnostics and protocol comparisons in a separate lab-only area.

Use familiar terms: well, area, time period, observation, correction, source. Do not expose A2UI, query plans, renderer selection, raw tool events or schema terminology in normal operation. This does not remove traceability; it puts operational explanations ahead of implementation logs.

Show a short answer first, then the most useful visual and necessary caveats. Do not automatically produce six widgets because six are available. A status question can use one compact card; a field investigation can justify coordinated map/table/trend views. Source access and conflicts remain near the relevant value even when detail is collapsed.

Stable navigation, well IDs, status meanings and action placement should persist across generated views. The model can adapt representation and composition without rearranging the entire application shell.

## 2. Desktop: a conversation that controls a working view

Conceptual layout; this is a proposed information architecture, not a final visual design:

```text
History / New chat        Investigation title          Area · Period · Data as of
┌────────────────────────┬────────────────────────────────────────────────────┐
│ Scrollable conversation│ Selected answer's working view                     │
│                        │                                                    │
│ Question               │ Main chart/table/map                              │
│ Brief answer           │ Relevant controls and linked selections           │
│ Inline visual/preview  │                                                    │
│ Open this result       │ Sources and conflicts near affected data          │
│ Follow-up              │                                                    │
│                        │ Showing result from [question/time]                │
├────────────────────────┤                                                    │
│ Ask or speak…          │                                                    │
└────────────────────────┴────────────────────────────────────────────────────┘
```

History opens on demand; avoid three permanent columns. Chat and canvas can scroll independently, while the question composer remains reachable. Support resizing/expanding the canvas with a clear route back to conversation.

The challenge requires inline visuals: keep short answers and useful visual previews inside the thread, with the larger canvas representing that same linked result. Do not reduce the conversation to text links requiring every answer to be opened elsewhere.

During a follow-up, retain the usable view and indicate what is being updated. Preserve focus, area selection and local drafts. Do not reset the complete workspace each turn. If a selected well is unavailable in the new result, explain that change instead of silently selecting a different well.

## 3. Mobile: the same investigation, one main region at a time

Recommended starting hypothesis:

- A single-column conversation contains short answers and meaningful inline cards/charts.
- A tap expands a substantive result into a full-screen investigation. A clear back control returns to the originating exchange at its previous scroll position.
- Keep an accessible ask/microphone control in the expanded view, with the active result/well context evident. Asking a question should not require repeatedly switching between separate modes.
- History is a drawer or sheet; it does not consume permanent screen width.
- Evidence opens a readable detail sheet with an obvious return to the selected point/row.
- Charts show their actual units and scope. A table alternative and selected-row detail support touch exploration; hover must not be the only path to information.
- Dense tables can offer a compact key-column view plus row details; deliberate full-table expansion may scroll horizontally. Do not drop material facts, units or conflicting evidence to fit the screen.
- Chart sizing, touch targets, readable labels, keyboard behavior and slow/disconnected network recovery need their own mobile checks. The phone layout is not a compressed desktop screenshot.

A two-tab Chat/View approach is a reasonable alternative to test, but forcing a mode switch for every follow-up adds navigation. Compare these options on real operator tasks rather than assuming one is universally superior.

Desktop/mobile continuity means the same authorized investigation and result versions can resume on another device when backend persistence exists. It does not imply live cross-device synchronization has been implemented or selected.

## 4. History has two levels and a result contract

### A. Previous investigations

Offer New chat, recent investigations and search, using useful titles such as a well/area and the investigation subject. Rename/pin can follow if retrieval tests justify them. Load older conversations on demand without imposing a permanent history wall.

### B. Full history inside an investigation

Keep all exchanges, result links and material scope changes. Loading older messages must preserve scroll position. New streamed content should not pull the user away from a message they are reading; offer **Jump to latest**. Announce meaningful status updates without moving keyboard focus or announcing every token. This follows accessibility guidance on status communication; specific scroll behavior is our recommendation. [W3C status messages](https://www.w3.org/WAI/WCAG21/Understanding/status-messages).

Each substantial answer should link to a specific result version. Selecting **Open result** restores its visual, interpretation, source basis and period. Merely scrolling the conversation should not silently change the canvas or the context of the next question.

An old open result needs a clear historical indicator and **Back to latest**. If the operator wants to ask from that state, an explicit **Continue from this answer** can attach that result as follow-up context without requiring a visible branching graph.

### What needs to survive

Proposed persistence semantics, not an approved public API:

| Record | Durable meaning |
| --- | --- |
| Conversation | Owner/scope, title, creation/update time and ordered messages |
| Message | Author, text, timestamp, interpreted scope and associated result-version references |
| Result version | Values or durable scoped result handle, schema/catalog version, time window, observation/data timestamps, units, sources, rules/corrections and conflicts |
| Presentation state | Supported visual description and material filters/selected entities necessary to reproduce the view |
| Follow-up | Which prior result/context the request actually refers to |

Saving visible messages is different from supplying bounded, authorized context to an agent. Neither requires repeatedly passing the full result payload and entire transcript to the model. The backend owns durable history and access; the frontend owns retrieval/scroll/navigation and local drafts. Private conversation recall must remain separate from shared well knowledge and formal corrections.

### Original answer versus current truth

**Open original result** shows what was answered then, subject to present access and retention policies. **Refresh with latest records** explicitly recomputes and creates a new version. It must not silently replace the numbers underlying historical prose.

If a later correction affects an old answer, retain its provenance and show that it has been superseded or that newer information exists. A stale historic snapshot must not appear to be the current operational status. A presentation-only change retains result identity and values; new data/filters that change the analyzed set require a new derived result/revision.

## 5. Context that the operator can see and the agent receives

The current area, wells, time interval/time zone, metric/units, selected result and observation/data time must be explicit. A compact summary can say “Northeast Block 7 · Last 30 days · Observed through 15 Oct.” Defaults can come from the operator's authorized assignment or last-used preference, but must be visible and easy to change.

A request such as “compare these three” must carry the selected entity IDs/result reference. Do not infer selection from screenshot pixels or assume a visual filter automatically updates agent memory. Differentiate temporary hover, selection for a question, local display filtering and a backend recomputation.

Use fewer model turns when a clear UI control can accomplish the task: source drilldown, sorting, visual/table switching and changing an already understood filter. Ask a short clarification only when ambiguity materially changes the answer. Minimum interaction count is a constraint alongside correctness, not permission to guess a well ID, unit or correction scope.

## 6. Future voice: a channel into the same investigation

No voice implementation is requested now. Design the state/history contract so it can support these behaviors later.

Gemini Live demonstrates interruptible speech, captions, transcripts and switching between voice and text in the same conversation. Google Cloud voice guidance emphasizes reducing unnecessary steps, using existing context and repairing only the misunderstood information. These are useful patterns, not a recommendation to choose Google's voice stack. [Gemini Live](https://support.google.com/gemini/answer/15274899?hl=en), [Voice-agent design](https://docs.cloud.google.com/dialogflow/cx/docs/concept/voice-agent-design).

Proposed voice flow:

1. Operator taps the microphone and asks a complete question. Indicate listening/processing/speaking distinctly and allow stopping at any point. Typing stays available.
2. Resolve the same authorized well/area/date context as text input. Show a transcript or recognized-entity summary so a misheard well ID, date or unit is visible.
3. Speak a brief answer and material limitation; display the clean chart/table/map and evidence concurrently. Do not read an entire table or depend on the user seeing a chart to understand the spoken conclusion.
4. Allow interruption and targeted refinement: “Only Block 7,” “show those wells on a map,” “why that one?” A tap on a point should establish the selected entity before a voice follow-up.
5. Store voice turns/result references in the same private conversation history. The operator can resume by typing or open the result later.

For an unambiguous read-only lookup, repeat interpreted scope naturally in the answer instead of inserting confirmation at every step. For a materially ambiguous well/number or a durable correction, clarify/read back the exact target, value, units and scope before committing. For example, correcting one reading and changing a type-wide rule have different effects. This applies established implicit/explicit confirmation distinctions to our domain. [Conversation confirmations](https://developers.google.com/assistant/conversation-design/confirmations) is legacy platform guidance used here for enduring dialogue principles, not a claim about platform availability.

Start a later voice experiment with deliberate microphone activation rather than background listening; assess noise, accents, protective equipment, connectivity, privacy and recognition repair with representative operators. Do not assume a quiet-room voice demo establishes field usability. Correcting one recognized entity should preserve the rest of the question.

Illustrative dialogue (no real answer/count implied):

> Operator: “Which wells in Block 7 need attention?”
>
> Assistant: Gives a short evidence-backed summary with the observation date; the screen shows the selected wells and key exceptions.
>
> Operator: “Show their downtime over the last month.”
>
> Assistant: Reuses those explicit well IDs and displays the comparison, with the exact dates visible.
>
> Operator taps a well and asks: “Why was this one down?”
>
> Assistant: Opens the relevant explanation and sources in the same investigation.

## 7. Changes to validate next in the lab

These are recommendations for a future iteration, not changes made during this research:

1. Simplify the operator shell while retaining a separately accessible experiment bench.
2. Add complete scrollable message history and a selectable list of investigations. In the lab, browser-local persistence can test the experience but must remain labeled; real durable history belongs to the backend.
3. Link answers and result versions in both directions. Add clear historical/current state and explicit refresh semantics.
4. Make area/well/date/result context visibly shared with the agent and consistent across direct controls and questions.
5. Build the mobile information architecture alongside desktop, including evidence and history, before attempting voice integration.
6. Test voice through sample dialogues and low-fidelity interaction trials first; add real audio only after the state/context/repair behavior is clear.

## 8. How to judge ease of use

Compare the existing lab against the simplified experience using the same data and questions. Do not use attractive screenshots or click count alone as the outcome.

| Task | What to observe |
| --- | --- |
| Ask which wells need attention | Time to a correctly scoped answer; whether the operator understands data age |
| Select a well and ask why | Extra navigation, correct entity reference, time to supporting evidence |
| Change chart to table | Values/sources preserved; unnecessary model calls avoided |
| Return to yesterday's investigation | Ability to find it, restore the correct result and distinguish historic/current data |
| Read old messages while an update arrives | Lost scroll position/focus, accidental view switches, ability to return to latest |
| Continue an investigation on mobile | Readability, tap/keyboard effort, preserved selection and source access |
| Interrupt a slow/failed answer | Existing result and draft preserved; clear recovery |
| Future voice: misheard well ID | Repair turns, wrong-target actions prevented, unaffected context preserved |

Record success/failure, mistaken scope assumptions, wrong-result selection, necessary versus unnecessary interactions, first useful answer, source retrieval and task-resumption effort. Run observation sessions with actual operators before claiming task-time or error-rate improvements. No fixed width ratio, card count, or universally best GenUI experience is established by this research.

## Limitations and source freshness

The products above target different audiences: software builders, document creators and analysts are not oil-field operators. Feature documentation establishes capabilities/limits, not comparative UX superiority. Product availability can depend on account, plan, release and device. Recheck selected features before adoption. The study did not measure operator preference, field noise, network resilience, real-model generation quality or accessibility conformance.

Application code was inspected only to identify current lab gaps; it was not changed. Protocol/backend architecture research remains in the existing technical report. A2UI/AI SDK choice does not by itself supply history, reliable shared context or this operator experience.
