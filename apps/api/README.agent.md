# Operator-agent POC

Three AI SDK ToolLoopAgents share read-only, namespace-scoped evidence and deterministic
calculation tools. No changes to shared contracts, database schema or frontend.

## Use it now

From `apps/api`, with the existing DATABASE_URL and OPENROUTER_API_KEY in ignored `.env`:

```sh
AGENT_NAMESPACE=challenge AGENT_AS_OF=2026-10-17T00:00:00Z pnpm exec tsx src/runtime/ask.ts "Which three wells in Northeast Block 7 had the most downtime between 16 June and 16 October 2026?"
```

The CLI prints tool progress to stderr and the final answer, typed results, evidence,
execution trace and token usage as JSON to stdout. It makes real provider calls.
`AGENT_DEBUG=1` also prints the pre-validation candidate and source IDs for debugging.

Default text/function model: `openai/gpt-4.1`. Override with OPENROUTER_MODEL;
OPENROUTER_EVIDENCE_MODEL and OPENROUTER_PROCEDURE_MODEL optionally select specialist
models. Keep keys in app-local `.env`, never commands or browser configuration.

For the independent streaming HTTP runtime:

```sh
AGENT_NAMESPACE=challenge AGENT_AS_OF=2026-10-17T00:00:00Z pnpm exec tsx src/runtime/index.ts
```

It binds 127.0.0.1:3002. Existing fixture server/entrypoint remain unchanged. Set
AGENT_PORT for another port. AGENT_TIMEOUT_MS defaults to 120000. AGENT_AS_OF is optional;
otherwise as-of is fixed at startup. Namespace is explicit server configuration.

POST `/api/chat` accepts the existing shared chat envelope and returns standard AI SDK
UI-message SSE: actual tool input/output/error events, sources, text and existing
well-status cards. Localhost development proxy origins are allowed. No UI code changes
or new shared visual variants are included. Other calculations are structured tool
results with presentation hints, ready for a coordinated renderer contract.

## Agents and tools

| Agent | Responsibility |
| --- | --- |
| Coordinator | Simple lookups directly; delegate complex investigation/assessment; synthesize supported final answer |
| Evidence investigator | History, fleet calculations, linked reports, operational explanations and unresolved evidence |
| Procedure specialist | Applicable manuals/SOPs, inherited rules, report/regulatory facts, breaches versus pending/unknown |

Specialists cannot delegate recursively. Procedure assessment requires an asset ID and
preloads its applicable original documents. Agent loops are native ToolLoopAgent;
typed Zod inputs, explicit stop conditions, two concurrent tool calls per loop, shared
forty-call budget and request cancellation. The final step is reserved for synthesis.
Actual nested events carry agent and parent-call IDs. Candidate plus specialist token
usage is aggregated for evaluation. A failed attempt can be recovered in a later step.

| Tool | Schema/data it owns |
| --- | --- |
| getOperationalContext | Well, latest inspection, derived status, human notes/corrections, latest ten maintenance/report links |
| listAssets | Canonical IDs, names, types, areas and locations; resolve human scope before analysis |
| analyzeOperations | Explicit asset/area/fleet scope, metric, inclusive UTC window, optional equipment/grouping and row limit |
| getOperationalRecords | Complete per-well maintenance/report links and regulatory events for dates; decimal strings retained |
| readRecord | Exact original JSONL inspection, maintenance, regulatory event or note by typed kind + ID |
| getApplicableProcedures | Primary manual, explicit parent inheritance and SOP originals with source versions |
| searchEvidence | Bounded lexical document discovery, filtered by asset/kind; not exhaustive event statistics |
| readEvidence | Original Markdown through exact returned document/report IDs |
| investigateEvidence / assessProcedures | Scoped specialist tasks returning findings, source IDs and actual child-call lineage |

Analysis metrics: current-status, temperature-history, downtime, spills, repair-costs
and repeat-repairs. Full filtered inputs are processed before limiting result rows;
coverage exposes truncation and records/assets evaluated. Monetary and spill totals
use decimal-string arithmetic. Downtime counts seven days per non-producing weekly
inspection; repairs are selected by start date. Missing observations/rules stay unknown.

Explicit imported formal false-positive spill corrections are applied; ordinary notes
never override readings. Other free-text corrections remain uninterpreted/provisional.
Procedural conclusions are model assessments from evidence, not a complete deterministic
compliance engine. Use the eval runner to measure actual correctness/grounding.

## Boundaries

Read-only POC: no private conversation persistence, accepted runtime correction writes,
user-policy persistence, saved-view execution or production authentication. Browser
user IDs are not authorization. All Q1–Q18 remain minimum capability targets, not a
claim that the full stateful suite passes. Current analytics address the read/aggregate
families; write/private-memory sequences still require further implementation.

Retrieval currently uses direct links and built-in PostgreSQL lexical search. The
storage/ingestion owner may add embeddings independently; this runtime does not require
them or claim semantic retrieval. EvidenceReader/AnalyticsReader keep SQL and models
replaceable. Original versions/locators remain attached to sources.

The provider adapter is narrowly text/function-call compatible; provider token streaming,
reasoning-message replay and multimodal input are not supported. It stays behind the
SDK LanguageModel interface so a maintained provider can replace it when dependencies
are coordinated. Existing UI streaming emits real tool progress and validated final text.

## Focused checks

```sh
pnpm --filter @repo/api typecheck
pnpm --filter @repo/api exec tsup --config src/runtime/build.config.ts
```

The standalone build is `dist/agent/index.js`; run from apps/api for dotenv. The normal
fixture build cleans dist, so build the agent afterward if building both.

See [model eval commands](README.evals.md) and [capability roadmap](README.capabilities.md).
No new application test suite or formal review gate is required for this POC.

SDK references: [agents](https://ai-sdk.dev/docs/agents/building-agents),
[subagents](https://ai-sdk.dev/docs/agents/subagents),
[loop control](https://ai-sdk.dev/docs/agents/loop-control).
