> Historical research snapshot from17October2026. References to retired lab code, split layouts, local captures or an A2UI baseline are historical; current decisions/architecture in the parent folder take precedence. Vendor findings are dated, not a fresh compatibility guarantee. Raw third-party captures are not bundled.

# Generative UI: current-state assessment

Assessed **2026-10-17**. Scope: existing research, repository integration boundary, and a focused refresh of primary documentation. This supplements the existing [report](report.md) and [framework comparison](frameworks.md), rather than replacing them. No framework was installed or benchmarked. Recommendations are proposals, not adopted decisions.

## Existing research and application state

The existing packet already covers the important landscape: component/tool rendering; declarative composition; executable generated interfaces; embedded apps; A2UI, AG-UI, MCP Apps and A2A; framework choices; recent research and an evaluation plan. Its claim ledger, retained source bodies and independent review make it substantially more useful than an unqualified framework list. The same-day focused source refresh below corroborates its consequential availability claims.

The repository has progressed beyond a stack-selection question. `apps/web/package.json` pins React 19.3.1, AI SDK 7.0.143 and `@ai-sdk/react` 4.0.147. The backend pins the same AI SDK and uses Hono. `packages/contracts/src/index.ts` already defines `CopilotMessage` with typed `data-visual` parts and a validated `well-status` visual. `docs/contracts.md` explicitly chooses AI SDK UI-message SSE and `DefaultChatTransport`; `apps/web/AGENTS.md` excludes arbitrary generated executable JSX/HTML. The chosen boundary supports frontend-owned renderers with backend-owned agent execution.

The parent assessment found the existing source hashes intact, four research links broken by relocation, and a stale §8 statement implying no application/stack has been selected. Those are documentation maintenance issues, not evidence that the research's overall architecture recommendation is invalid. Runtime verification could not run because dependencies were absent (`ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`); this assessment makes no passing-build claim.

## Verified primary-source refresh

| Layer | Current documented behavior/status | Implication for this worktree |
| --- | --- | --- |
| AI SDK UI | Typed custom data is carried in UI messages over SSE. Ordinary data parts remain in message history; transient parts use `onData`; matching part IDs reconcile updates. | The existing transport can carry evolving visuals and separate temporary progress without introducing another stream protocol. [Custom data](https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data) |
| AI SDK generative UI | The official guide maps tool outputs to React components; the model selects tools and developers implement widgets. Current docs identify the v7 family. | Component selection is a supported baseline for this exact frontend/backend split. [Guide](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces) |
| AI SDK RSC | Explicitly experimental; the migration guide recommends AI SDK UI for stable production. | Existing Vite + UI-message architecture aligns with the documented production direction. [Migration guide](https://ai-sdk.dev/docs/ai-sdk-rsc/migrating-to-ui) |
| A2UI | The homepage marks 0.9.1 current production and 1.0 candidate. The maintained matrix marks React 0.9.1 stable and 1.0 planned. | A candidate spec does not establish React renderer availability. Pin protocol, renderer and domain catalog together before any experiment. [Versions](https://a2ui.org/), [Renderers](https://a2ui.org/reference/renderers/) |
| AG-UI | Defines agent/frontend interaction and lists supported integrations, including A2UI and MCP Apps. | Consider it for an actual agent-framework integration need; it is a different layer from defining well-chart props. [Overview](https://docs.ag-ui.com/introduction) |
| MCP Apps | Tool descriptions reference `ui://` HTML resources; supporting hosts render apps in sandboxed iframes. | Relevant to distributing well tools inside assistant hosts. A standalone React SPA does not need an MCP Apps host to render its own charts. [Official overview](https://modelcontextprotocol.io/extensions/apps/overview) |
| json-render | A catalog constrains components/actions and a registry renders model-produced descriptions. | A possible composition layer if the copilot needs novel combinations of existing widgets. [Introduction](https://json-render.dev/docs) |
| Tambo | Repository announces Cloud API shutdown October 31, 2026, closed signups and hosted data deletion November 30; self-hosting remains available. | Avoid selecting the closing Cloud service; self-hosting creates maintenance obligations. [Repository notice](https://github.com/tambo-ai/tambo) |
| Thesys | Its documentation index labels C1 an archive and directs new projects to OpenUI; OpenUI documents separation of generation and reactive execution. | Compare current OpenUI if evaluating composition, rather than assuming legacy C1 is the unchanged current offering. [Official index](https://docs.thesys.dev/llms.txt), [OpenUI architecture](https://www.openui.com/docs/openui-lang/architecture) |

These are documented capabilities and status claims, not independent evidence of reliability, comparative speed or compatibility with this app's pinned packages. Living pages can change.

## What “state of the art” means for this product

The useful frontier is **model-selected and optionally model-composed trusted components, with incremental updates, explicit actions and restorable state**. Generating arbitrary code is another branch of the field; it is not required to deliver adaptive charts, maps, heatmaps, tables or correction controls here. This is an engineering judgment based on the application boundary and surveyed approaches, not a universal framework ranking.

There are two separate contracts: the domain answer (values, units, time interval, evidence, corrections/conflicts) and its presentation (which supported widgets, layout, actions and lifecycle). A2UI or another UI description can standardize the second. It cannot infer the first correctly on its own. The backend must supply calculated, evidence-linked facts; the frontend must preserve their meaning and provenance.

## Recommended next step for the Generative UI branch

1. Build the trusted visual vocabulary and evidence interaction with fixture streams first. Expand the current shared visual schema additively when implementing each first consumer; keep shared schema commits coordinated with the backend.
2. Add explicit pending, partial, ready, empty and failed rendering behavior. Use stable message/part/visual identifiers so updates do not reset controls or duplicate a result. Keep temporary tool progress separate from durable answer artifacts.
3. Define action semantics with the backend: a filter can remain local; recomputation needs a query; submitting a correction needs a validated server command. A renderer-local state change is not durable well memory.
4. Evaluate one optional composition layer against the same small domain catalog only if fixed component selection cannot express the intended investigative experience. json-render fits application-owned React composition; A2UI fits a requirement for portable surface descriptions. AG-UI fits a requirement to standardize richer agent interaction. These choices need not be bundled together.
5. Validate one complete scenario: receive an evidence-backed result, refine it, cancel an in-flight replacement, reopen the conversation and preserve the artifact's values/sources. Measure first useful render and correctness; a syntactically valid component tree alone is insufficient.

The current research is sufficient to begin that bounded implementation discovery. The unresolved issue is the concrete visual/action contract and operator experience, not a missing broad survey or an established universally best framework.
