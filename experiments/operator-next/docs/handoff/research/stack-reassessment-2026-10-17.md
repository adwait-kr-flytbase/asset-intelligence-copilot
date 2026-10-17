> Historical research snapshot from 17 October 2026. Preserved for technology reasoning and primary links. References to the retired lab, split-screen UX, local capture paths or an A2UI baseline are historical, not current implementation instructions. See ../decisions.md and ../architecture.md for the retained Fieldwork design. Vendor capabilities were checked at the original research date; adoption must recheck relevant versions. Raw third-party page captures are intentionally not bundled.

# Stack reassessment after the operator UX clarification

2026-10-17. Interpreting “Copilot SDK” as CopilotKit. Research plus existing-lab implementation inspection; no CopilotKit runtime was installed or benchmarked.

## Recommendation

Keep the usable operator shell, authoritative data, trusted widgets and exact answer history as application requirements. Compare CopilotKit as the agent/application interaction layer before choosing the production transport. Continue the existing AI SDK + official A2UI lab as the working baseline. These technologies occupy different layers and can coexist.

| Responsibility | Current lab pattern | CopilotKit option | A2UI's role |
| --- | --- | --- | --- |
| Model/query execution | Lab Hono owns synthetic results; current optional provider uses compatible HTTP. AI SDK owns UI message streaming. | Hono runtime and AI SDK execution are documented integration options; domain tools remain backend-owned. | Does not replace agent execution or data authority. |
| Screen context | Explicit current area, selected well and result ID in request; small app-owned schema. | `useAgentContext` plus shared state and frontend tools offer a standard integration vocabulary. Custom adapters must still wire them into execution. | Can bind presentation data/actions; does not automatically know the surrounding application. |
| Dynamic representations | Validated plan → backend canonical wire → official A2UI React, or same widgets directly. | A2UI middleware and catalog renderer integration documented; current lab renderer/catalog compatibility untested. | Portable declarative presentation; no guarantee of truthful values or good chart choice. |
| Custom operator UI | App-owned split desktop, Conversation/Data mobile, evidence and persistent composer. | Headless APIs can preserve the same shell. No need to adopt a generic chat sidebar. | Renderer and component catalog, not the navigation or investigation workflow. |
| History | App-owned browser-local threads and exact completed snapshots for the synthetic demo. | OSS runner persistence and managed thread-list APIs are distinct; can also keep app-owned history APIs/UI. | Surface updates alone do not define immutable historical evidence/result versions. |
| Failure recovery | App-owned run gate, immutable answer snapshots, partial rollback, validation and schema recovery. | Standard run/stop/events reduce some plumbing but equivalent cancellation, old-result and thread-isolation behavior must be tested. | Still needs version/catalog validation and rendering containment. |
| Voice | Not implemented; same conversation/context/result model is the target. | Current documentation shows transcription into chat, not proof of full-duplex voice. | Can display resulting data; not a speech transport. |

The earlier “AI SDK is sufficient” judgment needs qualification. It supports this experience, but context, browser actions, shared state and history require application code. Those are now central product needs, so CopilotKit deserves a concrete comparison. Conversely, installing CopilotKit does not automatically deliver enterprise history, authorization, correct metrics or operator usability.

## Decision experiment

Build a separate interaction adapter using the same questions, widgets, authoritative results and shell. Check selected-well follow-ups, representation changes, browser evidence actions, Stop/thread switching, exact old-result reopening, refresh, reload and mobile navigation. Measure code/adapter complexity and failure behavior; test our v0.9.1 DataView bindings/actions explicitly. Choose adoption based on that evidence. No framework migration is implied by the current UI iteration.

## Primary sources

- [CopilotKit custom-agent / AI SDK integration](https://docs.copilotkit.ai/backend/custom-agent)
- [Hono/server adapters](https://docs.copilotkit.ai/runtime-server-adapter)
- [Headless UI](https://docs.copilotkit.ai/custom-look-and-feel/headless-ui)
- [Application context](https://docs.copilotkit.ai/reference/hooks/useAgentContext)
- [Managed useThreads boundary](https://docs.copilotkit.ai/reference/hooks/useThreads)
- [A2UI setup](https://docs.copilotkit.ai/generative-ui/a2ui)
- [AI SDK persistence is application-owned](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence)
- [Detailed audited capabilities and version caveats](copilotkit-capability-audit-2026-10-17.md)
