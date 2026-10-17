> Historical research snapshot from 17 October 2026. Preserved for technology reasoning and primary links. References to the retired lab, split-screen UX, local capture paths or an A2UI baseline are historical, not current implementation instructions. See ../decisions.md and ../architecture.md for the retained Fieldwork design. Vendor capabilities were checked at the original research date; adoption must recheck relevant versions. Raw third-party page captures are intentionally not bundled.

# Practical generative UI frameworks: evidence review

Research date and source access date: **2026-10-17**. Scope: first-party documentation and repositories; no installation, execution, or performance measurement. Observations describe published interfaces, not independently proven reliability. Recommendations below are explicitly judgment calls. Source identifiers F01–F27 map to the evidence ledger.

## Findings that change the shortlist

Two lifecycle changes make older comparisons misleading. **Tambo Cloud is closing on October 31, 2026**; new signups are already closed, and hosted data is scheduled for deletion November 30. Its October 1 announcement says self-hosted users must maintain it themselves. Meanwhile, **Thesys now labels C1 documentation an archive and directs new projects to OpenUI**. Tambo's still-accessible docs homepage advertises Cloud, so the dated shutdown announcement takes precedence for procurement decisions. The Thesys finding is a documentation transition, not evidence that the C1 endpoint has already shut down. [F12, F15, F16]

The practical architectural choice is who controls composition: application code mapping tools to widgets; a model assembling a constrained vocabulary; or a model generating executable interface code. These approaches coexist. AI SDK UI supplies the first baseline; json-render, assistant-ui's `present`, and OpenUI add composition; CopilotKit connects agent execution and declarative surfaces. LangGraph's documented UI mechanism packages developer-written React components with graph deployments. These are complementary layers, not a set of interchangeable protocol implementations. [F01, F04, F07, F10, F18, F21]

## Vercel AI SDK UI and the RSC trap

**Observation.** The current generative UI guide maps typed tool parts in `UIMessage.parts` to application React components. A server runs `streamText`; `useChat` consumes the message stream. The sample switches between input available, output available, and output error states. The model chooses a tool and produces its inputs; developers own the widget and layout. This is adaptive component selection, without requiring arbitrary layout synthesis. The guide currently identifies itself as v7 documentation, so examples copied from older SDK articles need version checking. [F01]

AI SDK is an open-source, provider-agnostic TypeScript toolkit; its repository also documents direct provider packages alongside the default gateway route. Adopting the library therefore does not inherently require using Vercel's inference gateway. That distinction matters when comparing library ownership with hosted inference dependency. [F03]

**Critical caveat.** RSC remains explicitly experimental. The migration guide recommends AI SDK UI for production and lists inability to abort server-action streams, remount flicker on completion, suspense-related crashes, quadratic transfer with streamable UI, and closed-stream update problems. These are documented limitations, not fresh reproductions in this research. The old appealing `streamUI` demos should not be treated as the preferred production architecture. [F02]

**Recommendation.** Use AI SDK UI as a baseline where product screens and meaningful interactions are known. Add a composition renderer only when users need combinations the application cannot reasonably predesign. Preserve serializable message/tool state independently of React instances, and verify current-version persistence and resume behavior before deployment.

## json-render: application-owned vocabulary and patch stream

**Observation.** json-render is Apache-2.0 software in Vercel Labs. Its catalog describes allowed components and actions, while a registry connects those descriptions to actual platform implementations. Its repository lists web and native renderers plus document, video, email, terminal, and other targets. This breadth demonstrates intent and available packages; it does not establish equal maturity or identical semantics across targets. [F04]

The React schema uses a flat `root` plus `elements` map, with child references rather than deeply nested component objects. Specs can be generated, saved, or handwritten, and `validateSpec` checks structural problems. The documentation says the framework is schema-agnostic; the familiar flat tree is a renderer schema, not the only conceivable document shape. [F05]

SpecStream sends JSONL JSON Patch operations using JSON Pointer paths. A compiler applies completed patches to progressively build the spec. `useUIStream` adds React state, errors, and abort behavior; starting a new send cancels the prior request. Streaming is consequently an explicit data protocol rather than executing model-produced JSX. [F06]

Runtime state is a separate concern: the React API exposes a state store with path access and updates. `useChatUI` supports messages containing both text and specs, while `useJsonRenderMessage` extracts specs from AI SDK message parts. This enables standalone generation or embedding within an existing AI SDK conversation. [F08]

Action handlers belong to the application registry/provider. The quickstart explicitly supplies `submit` and `navigate` handlers, along with visibility and validation providers. This is useful control, but allowing an action name is not a business authorization policy. A generated dashboard should still invoke server endpoints that verify actor, resource, and parameters. [F09]

**Recommendation.** Shortlist json-render when the differentiator is assembling existing domain components into dashboards or investigative workspaces. Benchmark catalog size, invalid patches, incomplete children, update stability, and persisted-spec migrations. Treat the README's promise of predictable output as positioning: schema-shaped generation still needs validation and recovery.

## CopilotKit: declarative surfaces inside an agent application

**Observation.** CopilotKit is an MIT-licensed frontend stack with React, Angular, mobile, and collaboration-channel positioning. That is broader than a renderer. The A2UI overview describes fixed-schema generation, where a JSON-defined UI receives agent data, and dynamic-schema generation, where a secondary model generates schema and data. Both use the same renderer, but latency and controllability differ. [F10, F11]

The dynamic path illustrates a real streaming boundary: `generate_a2ui` causes a secondary model to emit `render_a2ui` arguments through LangGraph tool-argument events. Middleware waits for the component schema to complete, then creates the surface and streams complete data items into it. Therefore “progressive” does not mean the first component always appears with the first tokens; schema completion is an initial gate. A progress renderer covers that phase. [F13]

Angular documentation adds a typed catalog of Zod component props and stable catalog identifiers, application-owned styling, and incomplete-stream recovery. This is useful evidence that integrations have renderer-specific lifecycle concerns beyond speaking an A2UI message shape. [F14]

**Recommendation.** Consider CopilotKit when shared agent/application state and agent-framework integration are central. Use fixed schemas for repeated operational workflows and reserve dynamic composition for genuinely varied exploration. Check the exact framework, backend adapter, protocol version, and recovery features together; an A2UI claim in one channel does not guarantee equivalent behavior in every channel.

## assistant-ui: conversation shell, tools, and growing composition options

**Observation.** assistant-ui's current documentation distinguishes four patterns: custom tool widgets, model-composed `present` layouts, generic `generative-ui` message parts, and LangGraph UI messages. This distinction avoids treating every rich tool result as a general composition system. `present` takes a component-name/props tree, ships a default vocabulary of 35 components, and permits custom Zod-defined component libraries. Its documented `present` and generic primitive tree shapes are explicitly not interchangeable. [F07]

The API index covers action dispatch, serialization/rendering, A2UI conversion, and Slack/Teams conversion. This supports an interesting portability direction: application-owned UI semantics can feed several delivery channels, with channel-specific translation. It is evidence of documented APIs, not proof of lossless conversion across all components. [F22]

The repository is MIT-licensed and identifies Assistant Cloud as optional managed persistence and analytics. Separately, Generative Frame offers a tool integration for streamed widgets, spec mode with JSONL patches, and a repair/screenshot loop. These features expand the architecture beyond the older “chat primitives only” description; they also introduce different security and lifecycle questions from a normal trusted React widget. [F23, F24]

**Recommendation.** Shortlist assistant-ui for an existing React conversational product needing strong control over the chat surface and tool rendering. Evaluate the newer composition package separately from the established conversation shell: the guide shows a `^0.0.4` package example, so the overall project's maturity should not be assumed to apply to each new subpackage. Prefer its typed vocabulary when predictable operations dominate, and assess sandbox policy before model-written widget code.

## Tambo: useful interaction model, explicit maintenance risk

**Observation.** Tambo registers normal React components with descriptions and schemas; the agent selects components and streams props. It distinguishes generated conversation components from interactables already on the page, which the agent can inspect and update. This lets conversational control reach existing dashboards rather than only adding cards inside chat. [F17]

Its component-state hook addresses a subtle gap: ordinary React local state is invisible to the agent. `useTamboComponentState` makes values available to follow-up messages and rehydrates them when history renders again. This is a good conceptual pattern even if choosing another implementation. [F19]

The project is MIT-licensed and self-hostable, but the shutdown announcement explicitly transfers ongoing maintenance responsibility to self-hosters. Its founder attributes the decision to insufficient adoption and a pivot; that is a vendor explanation, not independent proof that component-based generative UI is obsolete. [F12, F20]

**Recommendation.** Study Tambo for persistent interactables and state visibility; do not start a new dependency on its closing Cloud API. A self-host decision now includes ownership of backend maintenance and data migration, not merely deployment configuration.

## Thesys C1 and the current OpenUI direction

**Observation.** The accessible C1 documentation index describes a hosted generative UI API, React rendering, optional streaming, state and actions, custom components, conversation persistence, and a two-step visualization pattern. However, the detailed legacy pages failed to load through the research browser. Consequently these are index-level feature claims, not a verified review of the legacy API contracts. The same index explicitly says C1 is archived for existing production users and points new projects to OpenUI. [F15]

OpenUI is an MIT-licensed repository. Its current architecture separates generation from execution: a model produces OpenUI Lang that wires UI, queries, mutations, and reactive variables; a browser renderer executes registered tool providers without another model call for each interaction. Application API routes can retain server-side data access. This makes OpenUI a compact executable domain language with constrained capabilities, a materially different design from a JSON-only tree. [F18, F25]

Interactivity docs distinguish actions handled locally (`@Run`, `@Set`, `@Reset`) from callbacks such as continuing a conversation or opening a URL. State persistence uses `onStateUpdate` and `initialState`; field validation is also documented. This permits reactive dashboards without repeatedly regenerating them, while still returning to the model for semantic changes. [F26]

Hosted OpenUI Gateway adds streaming correction and provider fallback, while Autofix can be called after direct-provider generation and validation failure. Reliability monitoring can also attach through an observability SDK. These are optional service capabilities around the open runtime. The provider itself acknowledges unknown components, invalid props, unresolved references, truncation, and nonzero benchmark errors. Vendor token-efficiency and ranking claims should be independently tested against the intended catalog and prompts. [F27]

**Recommendation.** Evaluate current OpenUI alongside json-render for compositional interfaces, especially when local reactive execution matters. Avoid framing C1 as Thesys's unchanged current flagship, or confusing this OpenUI project with unrelated software sharing the name.

## LangGraph: graph-owned UI emission

**Observation.** LangSmith's guide colocates React components with graph code and declares bundles in `langgraph.json`. Nodes emit named UI messages through Python `push_ui_message` or TypeScript typed helpers. A reducer stores UI records; reusing an ID updates a component, and explicit delete removes it. The client uses `useStream` and `LoadExternalComponent` to load external component assets. This is shipped developer code plus generated props, not a guarantee that the model can synthesize arbitrary safe code. [F21]

**Recommendation.** Favor this path when UI components naturally belong to a graph deployment and the team already operates LangGraph/Agent Server. Decide deliberately whether to load graph-served component bundles or maintain a frontend-owned allowlisted registry. The documented tutorial establishes behavior but does not alone settle every self-hosting/license entitlement of the surrounding LangSmith platform.

## Suggested evaluation, not a universal winner

Compare three vertical slices using the same domain data: a known inspection-result card; an ad hoc multi-widget asset investigation; and a stateful filter/form that triggers an authorized action. Measure first useful render, complete render, malformed/partial output rate, unnecessary model round trips, recovery after cancellation, restored state, keyboard accessibility, and action correctness. Pin catalog, model, prompt, renderer, and protocol versions. A component tree that parses is only an intermediate success condition: the useful outcome is an interface that preserves data meaning and performs the user's intended action.

## Evidence ledger

All accessed **2026-10-17**. Extracts are deliberately short; each source is first-party. F identifiers remain stable for synthesis references.

| ID | Source URL | Relevant short extract / evidence |
| --- | --- | --- |
| F01 | https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces | “connecting the results of a tool call to a React component”; typed message-part example |
| F02 | https://ai-sdk.dev/docs/ai-sdk-rsc/migrating-to-ui | “AI SDK RSC is marked as experimental”; enumerated RSC limitations |
| F03 | https://github.com/vercel/ai | “provider-agnostic TypeScript toolkit”; direct provider setup |
| F04 | https://github.com/vercel-labs/json-render | “Predefined components and actions”; Apache-2.0 and package list |
| F05 | https://json-render.dev/docs/specs | “A spec is a JSON document”; flat React schema and validation |
| F06 | https://json-render.dev/docs/streaming | “JSONL-based streaming format”; JSON Patch and abort support |
| F07 | https://www.assistant-ui.com/docs/tools/generative-ui | “a component vocabulary you ship”; four-pattern distinction |
| F08 | https://json-render.dev/docs/api/react | `useStateStore`, `useChatUI`, `useJsonRenderMessage` |
| F09 | https://json-render.dev/docs/quick-start | `ActionProvider handlers`; validation and visibility providers |
| F10 | https://github.com/CopilotKit/CopilotKit | MIT license; frontend stack description |
| F11 | https://docs.copilotkit.ai/teams/ms-agent-dotnet/generative-ui/a2ui | Fixed and dynamic schema approaches; v0.9 operations |
| F12 | https://tambo.co/blog/posts/tambo-is-shutting-down | “October 31, 2026”; dated October 1 shutdown announcement |
| F13 | https://docs.copilotkit.ai/deepagents/generative-ui/a2ui/dynamic-schema | “waits for the full schema before rendering” |
| F14 | https://docs.copilotkit.ai/angular/deepagents/guides/a2ui | “typed A2UI catalogs”; incomplete-stream recovery |
| F15 | https://docs.thesys.dev/llms.txt | “C1 by Thesys documentation (archive)”; new projects directed to OpenUI |
| F16 | https://www.thesys.dev/ | “OpenUI Cloud is here” |
| F17 | https://docs.tambo.co/concepts/generative-interfaces | Generated components and interactable components |
| F18 | https://www.openui.com/docs/openui-lang/architecture | “separates generation from execution”; browser tool provider |
| F19 | https://docs.tambo.co/concepts/generative-interfaces/component-state | “React component state is private”; context and rehydration |
| F20 | https://github.com/tambo-ai/tambo | MIT license; self-hosting link and Cloud closure banner |
| F21 | https://docs.langchain.com/langsmith/generative-ui-react | `push_ui_message`, update/delete, external component bundles |
| F22 | https://www.assistant-ui.com/docs/api-reference/generative-ui | Actions, A2UI, Slack Block Kit, Teams API index |
| F23 | https://github.com/assistant-ui/assistant-ui | “MIT, with optional Assistant Cloud” |
| F24 | https://www.assistant-ui.com/generative-frame/docs | “Repair loop and screenshots”; spec mode and security-model links |
| F25 | https://github.com/thesysdev/openui | MIT license; current OpenUI source |
| F26 | https://www.openui.com/docs/openui-lang/interactivity | `@Run`, `@Set`, `onStateUpdate`, validation |
| F27 | https://www.openui.com/docs/production | “no framework was error-free”; Gateway, Autofix, monitoring |

Limitations: live mutable documentation, no source commit snapshots or local reproduction; several legacy Thesys URLs were inaccessible. No independently measured framework ranking is asserted. The source ledger preserves URLs and evidence anchors; revisit lifecycle notices before any implementation or vendor commitment.
