# AI SDK runtime and backend delivery boundary

Status: AI SDK choice and backend-only scope confirmed by the user on 17 October
2026. Exact agent topology, persistence/orchestration mechanism, generative UI
schemas and presentation protocol remain design work.

## Decision and rationale

Use AI SDK for the agent runtime. The user rejected Eve because of its perceived
Vercel dependence and prefers the direct SDK approach. This is a platform/control
preference, not a claim that Eve cannot be self-hosted. Existing Hono/Node and AI SDK
UI-message streaming remain the implementation foundation.

Do not infer approval for WorkflowAgent, a Node upgrade, Nitro, another workflow
engine or a deployment platform. Research identified these options and integration
costs; each still needs a concrete reason and compatibility verification.

## Worktree boundary

This worktree handles backend agent execution, domain tools, HTTP/stream endpoints,
backend persistence integration and coordinated browser-safe wire contracts. The
independent ingestion work remains with its existing owner and accepted CLI boundary.

The other worktree owns frontend implementation. Stop when progress requires changing
renderers, components, hooks, frontend state or other apps/web code, and provide an
integration handoff describing the required behavior. Defining backend payloads,
stream semantics and shared contract fixtures is coordination work; it does not
transfer frontend ownership here.

## Generative UI integration direction

Follow [the contract](../contracts.md). Keep authoritative runtime schemas and wire
types in packages/contracts, with representative synthetic fixtures. Publish additive
contract changes in focused shared commits for both worktrees; retain existing
variants while the consumers migrate. A local commit is a coordination artifact;
remote push/deployment still needs user direction.

The contract design should specify:

- Typed artifact variants and schema versions, stable result/artifact identity and
  explicit revision/update semantics.
- Traceable evidence, observation/as-of times, units, applicable rules/corrections,
  uncertainty and missing-data coverage.
- Progress, partial results, completion, failure and cancellation semantics, keeping
  transient execution events distinct from persisted artifacts.
- Action requests and responses, including target/draft version, validation errors,
  authoritative outcomes and replay/concurrency handling where effects occur.
- Persistence and reload behavior: reopening a result should recover its recorded
  data and evidence rather than recreate it from generated prose.

These are design criteria, not a claim that these fields or endpoints currently
exist. Keep the AI SDK UI-message protocol; the frontend maps validated payloads to
its components. A2UI adoption remains open. Contracts describe useful domain results
and actions without exposing provider internals, server implementations or generated
executable UI code.

## Delivery expectation

Before backend integration is handed off, provide schemas/types, example payloads,
stream/action sequencing, error semantics, compatibility/migration notes and a
reproducible request. Verify backend responses against the agreed contracts. Coordinate
renderer behavior with the frontend owner before treating a proposed schema as settled.

Supporting research: .context/product-foundations/ai-sdk-latest-examples.md,
agent-ui-research.md and eve-agent-experience-research.md. These ignored files record
investigation; this decision is the durable statement of the user's selected direction.
