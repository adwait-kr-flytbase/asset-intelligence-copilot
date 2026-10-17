> Historical research snapshot from 17 October 2026. Preserved for technology reasoning and primary links. References to the retired lab, split-screen UX, local capture paths or an A2UI baseline are historical, not current implementation instructions. See ../decisions.md and ../architecture.md for the retained Fieldwork design. Vendor capabilities were checked at the original research date; adoption must recheck relevant versions. Raw third-party page captures are intentionally not bundled.

# Product UX patterns for an operator-facing generative workspace

Research date: 2026-10-17. Scope: six current product experiences, using official documentation. This is product-pattern research, not a usability benchmark or evidence that any product is universally best. Capabilities are plan-, version-, and device-dependent. Recommendations below are our inferences for this application, not vendor claims.

## Main conclusion

A chat beside a persistent working view is a credible direction. The harder and more consequential interaction design is preserving the relationship between the conversation, the displayed result, its filters, its source evidence, and its historical state. Treat each conversation as an investigation with revisitable results. Do not treat the right-hand view as a disposable latest response.

## Documented product behavior

### 1. Lovable: conversation and preview, with navigable lineage

The desktop editor places chat on the left and interactive preview on the right; chat can be hidden to expand the view. Small windows collapse controls; the mobile app uses swipeable views. The editor sidebar offers recent and starred work. [Editor documentation](https://docs.lovable.dev/features/projects/editor).

Every change creates a version. A version can be inspected as a snapshot, bookmarked, and linked back to its originating message. “Back to latest” leaves historical inspection. Reverting preserves the chat; code rollback does not undo database changes. [Version history](https://docs.lovable.dev/features/projects/history).

A response menu can preview the app as it existed after that message and copy a message link. [Project chat](https://docs.lovable.dev/features/projects/chat).

**Operator lesson:** take the message-to-result link and explicit historical-view indicator. Leave builder controls, code tabs, and deployment controls out of the operator experience. Viewing an old result must never imply rolling back operational data.

### 2. Claude Artifacts: substantial results have a persistent place beside conversation

Artifacts open beside the conversation and can be revisited and shared. Users can ask for changes or select a section to target an edit. Editing an earlier message creates another chat version with its own artifacts. iOS and Android support asking for, viewing, and editing artifacts; sharing settings require web/desktop. The current documentation distinguishes legacy artifacts from newer template-based artifacts; do not assume historic version controls have identical behavior across them. [Artifacts help](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them).

**Operator lesson:** “Ask about this well / interval / row” should attach the selected target explicitly. A substantive investigation merits its own view, while short answers can stay in conversation.

### 3. Gemini Canvas: direct manipulation and conversational refinement coexist

Canvas supports updates through chat and direct editing, with automatic saving. “Select & ask” targets an app section; selected document text can be refined. Document controls include Previous Version and Next Version. These version controls are documented in the document-editing section, so this source should not be read as guaranteeing identical app-version history. Shared Canvas links open in the web app, not the Gemini mobile app. [Canvas help](https://support.google.com/gemini/answer/16047321?hl=en).

**Operator lesson:** simple controls and contextual questioning can coexist; do not require a prompt to change every date or sort order. Offer a constrained representation switch that keeps the same result values and evidence.

### 4. Hex: conversational analytics with a path to inspect underlying work

Threads are accessible from a dedicated list and a recent-work section. Answers combine tables, pivots, and visualizations; tool activity collapses after completion but can be expanded. Users can explore result cells and change visualizations, or continue with natural-language follow-ups. Source projects and cells can be cited. [Threads](https://learn.hex.tech/docs/explore-data/threads).

Chat with App uses a conversational sidebar; the same conversation can continue in the full Threads interface. It can change app inputs/filters and produce additional analyses. Important boundary: for a Generative App, the agent does not automatically know the rendered screen state, filters, selected inputs, or visible area; the user must currently provide that context. [Chat with App](https://learn.hex.tech/docs/explore-data/chat-with-app).

**Operator lesson:** synchronize explicit selected scope with the agent. A chat and a view sharing screen space does not prove they share context. Hide execution details initially, while making evidence and calculation explanations easy to reach.

### 5. ThoughtSpot Spotter: resumable investigations, with a live-history caveat

When enabled by an administrator, chats auto-save into a collapsible rail, receive automatic titles, sort by recent activity, and can be renamed and pinned. On reopening, Spotter refetches live data; it stores higher-level context rather than historical output data or temporary artifacts. Its docs warn that refreshed data and old saved analysis can be out of sync. Access controls are checked again when a chat loads. [Spotter 3 chat history, Cloud 26.10](https://docs.thoughtspot.com/cloud/26.10.0.cl/spotter-conversation-history).

The mobile 4.6 documentation allows chart/table switching in conversation but says answer interaction does not support filter changes or drill-downs. This is a version-specific limitation, not a universal statement about mobile analytics. [Mobile Spotter](https://docs.thoughtspot.com/mobile/4.6.0/mobile-ask-sage).

**Operator lesson:** history needs a clear contract: “what I saw then” versus “refresh with current data.” Reusing an old question is not equivalent to reproducing the original answer.

### 6. Power BI Copilot: interpretation is inspectable; curation can coexist with generation

Users can inspect selected fields, measures, and filters in “How Copilot arrived at this,” open data details, and enlarge visuals. Fabric IQ adds inspectable analysis steps/query results and switches among visual, table, and query views. A documented limitation is that data questions do not inherit report page filters or slicers. [Ask data questions](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-ask-data-question).

Verified answers are human-approved visual responses matched to trigger phrases. They display a verification indicator, matched phrase, summary, and underlying interpretation/filters. Important boundary: this feature has security/filter limitations and is not returned when Fabric IQ is enabled. [Verified answers](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-prepare-data-ai-verified-answers).

**Operator lesson:** show the interpreted scope and source basis, and distinguish curated/approved content from fresh generation. Do not label a generated calculation as verified merely because its layout was validated.

## Recommended interaction contract for this application's next UX experiment

These are design hypotheses to test with operators, not established usability results.

1. **Start with the question, not a dashboard constructor.** A plain question field, the current field/date scope, and a few operational examples such as “Which wells need attention?” are enough. Keep experimental protocol/settings controls outside the normal flow.
2. **Use two primary desktop areas.** A scrollable conversation and a larger investigation view. Put past investigations in a collapsible drawer to avoid three permanently competing columns. Let the operator expand the view or return to conversation without losing selections.
3. **Support both kinds of history.** Conversation history lists named investigations, with recent/pinned entries and search. Message history within an investigation retains every exchange and result reference, including failures and retries where relevant. Scrolling older messages should not silently replace the active view.
4. **Link both ways.** Each substantive message has an “Open result” control. The view identifies the originating question and lets the user return to that exchange. Historical views show their observation period, generation time, and “Back to latest” control.
5. **Show scope in plain language.** Field, selected wells, time interval/time zone, units, important filters, and data timestamp are visible near the view. The request and result carry this scope, rather than relying on the model to infer the visible screen. Distinguish local hover/selection from a change that reruns analysis.
6. **Preserve a result while it updates.** Keep the last usable result visible during a follow-up, mark progress, and publish a validated replacement. A failed chart must not erase the data table, evidence, or the previous successful answer. Avoid moving charts during reading.
7. **Define update versus new result.** “Show this as a table” is a representation of the same result, preserving values/evidence. “Only Well 14” creates a derived result. An unrelated operational question creates a new investigation or an explicitly named result; do not silently overwrite earlier work. Offer a small result selector when one investigation has several substantial outputs.
8. **Separate historical replay from refresh.** Opening a past result shows the original snapshot when permissions and retention allow. Refresh is explicit and creates a new result version with new source timestamps. Current authorization must still govern access to historic records.
9. **Make evidence accessible from the thing it explains.** Select a point, row, warning, or calculated value to see relevant source records and calculation basis. Keep contradictions and missing data near the affected result, with detail available on demand. Avoid a permanent wall of raw logs.
10. **Adapt the workspace on small screens.** Test one main region at a time with clear “Conversation” and “Investigation” destinations, selection/context carried across them, and visible current-result identity. Do not squeeze desktop panes into unreadable columns. The cited products demonstrate multiple mobile adaptations, not one proven winner.

## What the evidence does not establish

The official sources establish supported features and documented limitations. They do not establish that split panes reduce operator error, the ideal chat/view width ratio, the optimal number of cards, or whether automatic view switching is welcome in this domain. Nor do they prove that rendered layout generation is more useful than selecting a tested view template.

Test with representative tasks: find today's at-risk wells; refine to a particular field; explain one suspect point from sources; change chart to table without changing numbers; return to yesterday's investigation and identify data age; recover after a renderer failure; and complete an equivalent task on a narrow screen. Observe task completion, mistaken scope assumptions, wrong-result selection, time to source evidence, history retrieval, and lost context. Compare the current lab against the simplified workspace with the same data and questions.
