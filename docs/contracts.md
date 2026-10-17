# Frontend/backend contract

Authoritative definitions: `packages/contracts/src/index.ts`. Shared example payloads:
`packages/contracts/src/fixtures.ts`. The package exports source TypeScript; Vite and
tsx compile it directly, and the API build bundles it. It needs no build watcher.

## Persisted application runtime

The data-backed application runtime uses additive `ApplicationMessage`,
`ApplicationResult`, `ReadRecipe` and saved-view contracts in `application.ts`, with
synthetic examples in `application-fixtures.ts`. See [application API](application-api.md)
for the cookie persona session, chat submit envelope, paginated lists, lazy result
loading, evidence, map coordinates and deterministic save/refresh operations.
The fixture envelope and `CopilotMessage` below remain valid for the fixture runtime;
configure the frontend transport for the runtime being used.

## HTTP boundary

| Route | Request / response |
| --- | --- |
| `GET /api/health` | JSON `{ "status": "ok", "mode": "fixture" }` |
| `POST /api/chat` | JSON envelope below → AI SDK UI-message SSE response |

```json
{
  "userId": "U-fixture",
  "conversationId": "foundation-demo",
  "messages": [
    { "id": "m-1", "role": "user", "parts": [{ "type": "text", "text": "Check the connection" }] }
  ]
}
```

The SDK transport can include additional transport fields. The API requires nonempty
user/conversation IDs and 1–100 messages, validates message parts with the SDK and
bounds the whole request to 64 KiB. Invalid requests return JSON 400; oversized bodies
return 413. Unknown paths return JSON 404. Evolve limits deliberately when real history
is introduced. User IDs here establish request scope, not authenticated identity.

## Stream and visuals

Use `DefaultChatTransport` and AI SDK helpers, not a custom SSE dialect. Compatible
`ai`/`@ai-sdk/react` versions are pinned in app manifests. Text and `data-visual`
parts flow through `CopilotMessage`. Source references travel inside each visual.

The initial visual is `kind: "well-status"` with `assetId`, `producing`, finite
`temperatureDeltaC`, ISO `observedAt`, and a nonempty `sources` array (`id`, `label`,
`path`). `WELL-FIXTURE` and `INS-FIXTURE` are synthetic and never reference actual
sample records. Do not interpret the demo payload as backend domain calculations.

Add table/chart/map/heatmap variants when implementing their first consumer. Use a
discriminated union when more than one kind exists. Keep result values, time windows,
units, citation references and applicable rules/corrections traceable as the contract
expands. Validation/loading/error states belong in the renderer, not generated code.

## Evolution between worktrees

Make a focused shared commit for additive schemas/types and representative fixtures.
Carry it into both branches, then implement the app-specific consumers independently.
Keep old variants valid until both sides have migrated; coordinate required-field
removal/renaming. No app runtime, DB, model client or UI component belongs here.

Before real memory, replace fixture identity and conversation handling. Persist
structured answers with schema versions so reloading does not recreate different
charts; retain original/corrected evidence. Chat persistence does not automatically
implement shared well knowledge or enforce private-history ownership.
