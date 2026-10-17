> Historical research snapshot from 17 October 2026. Preserved for technology reasoning and primary links. References to the retired lab, split-screen UX, local capture paths or an A2UI baseline are historical, not current implementation instructions. See ../decisions.md and ../architecture.md for the retained Fieldwork design. Vendor capabilities were checked at the original research date; adoption must recheck relevant versions. Raw third-party page captures are intentionally not bundled.

# CopilotKit + A2UI capability audit

Date: 2026-10-17. Research only; no packages installed and no runtime compatibility test. “Copilot SDK” is interpreted as **CopilotKit**, given the A2UI discussion; Microsoft/GitHub Copilot SDK is a different product. Current documentation is living documentation, not proof that the exact published versions selected later support every illustrated feature.

## Recommendation

**CopilotKit merits a bounded lab comparison as the interaction layer. Retain AI SDK as a possible backend implementation and retain the application-owned operator shell and authoritative result model.** This is more useful than treating the decision as replacing AI SDK with A2UI: A2UI describes surfaces, AI SDK handles model/stream operations, and CopilotKit supplies agent/application interaction primitives.

The reason to consider CopilotKit is the operator requirement that a selected well, result and time range should be available for follow-up questions, and that generated controls should participate in an ongoing investigation. Its advantage is a coherent interaction vocabulary, rather than inherently better chart quality or guaranteed enterprise reliability. Adoption remains conditional on testing our catalog, histories and failure semantics. This is a recommendation/inference, not a measured performance result.

## Verified capabilities and boundaries

| Need | Officially documented capability | Consequence for this app |
| --- | --- | --- |
| Current selection and scope | `useAgentContext` registers serializable UI context for component lifetime; changes update context and unmount unregisters it. Values reach AG-UI as strings, with framework-specific access/injection. | Supply selected result ID, wells, area, interval/time zone, metric and presentation filters. Do not infer that any adapter automatically injects this into model instructions. [Hook reference](https://docs.copilotkit.ai/reference/hooks/useAgentContext). |
| Shared working state | v2 `useAgent` exposes AG-UI state, messages, execution status, subscriptions and state mutation. Separate thread-scoped instances require `agentId`, `runtimeAgentId` and `threadId` together. | Useful for synchronized investigation state; not an authorization boundary or durable domain database. Pin API versions rather than copying old `useCoAgent` examples. [Reference](https://docs.copilotkit.ai/reference/hooks/useAgent). |
| Browser actions | `useFrontendTool` registers typed tools with browser-side handlers. | Opening evidence, selecting wells or switching representations can become agent-callable application actions. Authoritative corrections still require validated backend operations. [Frontend tools](https://docs.copilotkit.ai/frontend-tools). |
| Human interaction | `useHumanInTheLoop` renders a tool-based question and returns the user's response; `useInterrupt` is documented for LangGraph's server-side interrupt mechanism. | Clarifications and review cards fit. A model optionally calling a review tool does not enforce mandatory approval; backend code must enforce correction authorization/approval. Do not assume LangGraph interrupt support for Hono/custom agents. [HITL guide](https://docs.copilotkit.ai/human-in-the-loop). |
| Custom desktop/mobile shell | Headless APIs expose messages, state, run and stop while allowing app-owned layout/components. | Keep our split investigation on desktop and a mobile single-region layout; prebuilt sidebars are optional. This SDK does not design the operator UX. [Headless UI](https://docs.copilotkit.ai/custom-look-and-feel/headless-ui). |

### AI SDK and Hono can remain

The current docs explicitly support `BuiltInAgent` factory mode with `type: "aisdk"`, AI SDK `streamText`, message/tool converters, and stream conversion to AG-UI. Factory mode requires the application to wire tools, context and state; merely converting messages is insufficient. The same documentation describes simple mode as AI SDK based. [Custom model runtime](https://docs.copilotkit.ai/backend/custom-agent).

The TypeScript runtime mounts in Hono using `@copilotkit/runtime/v2/hono` and `createCopilotHonoHandler`; a Fetch handler is also available. AG-UI custom agents are another path, rather than a requirement to replace our domain backend with a built-in agent. [Server adapters](https://docs.copilotkit.ai/runtime-server-adapter), [custom AG-UI agent](https://docs.copilotkit.ai/backend/custom-ag-ui-agent).

Likely architecture for a comparison: React operator shell → CopilotKit/AG-UI interaction → Hono runtime adapter → existing domain tools and AI SDK model execution. This changes the browser-facing event/interaction layer; it is not a drop-in consumption of our existing AI SDK `data-surface` envelopes. Let one layer own live conversation/run state; avoid parallel `useChat` and `useAgent` stores for one conversation.

### A2UI integration is real, version equivalence is unproven

Current generic setup enables `a2ui: {}` on `CopilotRuntime`, applying `A2UIMiddleware`, with automatic built-in frontend activity rendering. That documentation describes the integrated chat path; a custom canvas still needs explicit routing/rendering. [Setup](https://docs.copilotkit.ai/generative-ui/a2ui).

Bring-your-own-catalog uses `@copilotkit/a2ui-renderer` with Zod definitions, React renderers and `createCatalog`. The dynamic example also exposes concrete limitations: built-in layout components ignore `gap`, and a table cross-field constraint is described but not enforced by its catalog schema. These are reasons to validate our own components and data, not proof that every catalog is unsafe. Its example generates schema and data; **our design must continue supplying authoritative results through validated handles rather than accepting generated numeric facts.** [Dynamic schema/BYOC](https://docs.copilotkit.ai/generative-ui/a2ui/dynamic-schema).

Framework guides describe nested **v0.9** operations in an `a2ui_operations` envelope. The legacy A2A starter explicitly still uses a local **v0.8** renderer. React action interception can handle locally, modify, or forward actions, but the referenced Python helper lacks `action_handlers=` support and its bridge omits `dataContextPath`. These limitations must not be generalized away. [Versioned framework example](https://docs.copilotkit.ai/ms-agent-python/generative-ui/a2ui/fixed-schema), [A2A starter caveat](https://docs.copilotkit.ai/a2a/generative-ui/declarative-a2ui), [action handling](https://docs.copilotkit.ai/deepagents/generative-ui/a2ui/advanced).

Our lab pins official `@a2ui/react`/`@a2ui/web_core` **0.14.0**, speaking **v0.9.1** via `v0_9` exports. CopilotKit's renderer is a different implementation. No exact compatibility with our custom `DataView`, result bindings, surface updates or 0.9.1 validation was established. Package version and protocol version are distinct. Source: local [lab architecture](../../../experiments/generative-ui-lab/docs/architecture.md).

### History: distinguish OSS storage from the managed thread product

The open-source TypeScript SDK/runtime is MIT and works without CopilotKit services. Intelligence adds managed saved UI/streams, continuity, memory and analytics, with cloud-hosted or self-hosted deployment under separate terms. Own application/framework persistence is supported. This does not establish current prices, procurement terms or free-plan allowances. [OSS versus Intelligence](https://docs.copilotkit.ai/concepts/oss-vs-enterprise).

`InMemoryAgentRunner` loses history at restart; first-party `SqliteAgentRunner` persists runs on one instance. A custom shared-store runner or Intelligence is needed for a multi-instance persistence design. The docs warn that the default in-memory store lacks per-user ownership, so it cannot be treated as private enterprise history. [Runner reference](https://docs.copilotkit.ai/backend/agent-runner).

Known-thread restoration can replay stored events or hydrate application-owned messages. A stable `threadId` alone stores nothing. Application authentication remains application-owned. [Thread lifecycle](https://docs.copilotkit.ai/threads-lifecycle).

`useThreads` is specifically the Intelligence-backed thread list/rename/archive/delete/realtime contract. SQLite or a custom runner does not automatically provide it. Therefore “history requires paid CopilotKit” and “all history is turnkey in free CopilotKit” are both misleading. We can own history APIs/UI; managed thread services are a separate deployment/commercial choice. [useThreads](https://docs.copilotkit.ai/reference/hooks/useThreads).

Neither event replay nor shared state by itself defines our immutable result versions, evidence retention, “open original” versus “refresh”, private conversation scope, or shared correction records. Those remain our domain contracts. A result must retain its source basis and renderer/catalog version; opening old prose must not recompute today's numbers silently.

### Mobile and voice

Responsive web remains our current target. A separate React Native package/headless surface exists but does not prove our web charts/catalog work natively; the guide requires native setup and polyfills. [Native guide](https://docs.copilotkit.ai/frontends/react-native).

The current voice guide documents recording audio, posting to `/transcribe`, and sending the transcript through chat, with an application-configured transcription service. This is useful speech input, not demonstrated full-duplex spoken interaction, interruption/barge-in, spoken replies or noisy-field recognition. Our future voice UX still needs the same result/scope state and disambiguation of well identifiers. [Voice](https://docs.copilotkit.ai/voice).

## Comparison experiment that can decide adoption

Keep the same operator shell, synthetic authoritative records and trusted widgets. Compare only the interaction implementation on these tasks:

1. Ask about selected wells and date filters without repeating them; inspect exactly what the backend receives.
2. Ask for another representation while preserving result values, sources and selection.
3. Use a generated control, then a text follow-up referring to “this well”.
4. Reload/reopen a previous conversation and its exact result; explicitly refresh to a new version.
5. Cancel or disconnect during an update; reject malformed/unsupported A2UI without losing the last valid view.
6. Exercise desktop and touch navigation with a small, stable shell.

Record additional adapter code, version constraints, state bugs, recovery semantics and latency. Adopt CopilotKit if it meaningfully reduces interaction plumbing while preserving these guarantees. The current evidence supports investigating it; it does not support claiming a production migration is already validated.
