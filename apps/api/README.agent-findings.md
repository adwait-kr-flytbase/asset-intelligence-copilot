# Live agent findings — 17 October 2026

## Latest: open-weight comparison and application boundary

Development default is now `deepseek/deepseek-v4-flash`, independently configurable
per role. The three core sample trials (ranking, corrected spills, current status)
passed strict tool/evidence checks with correct results and exact UI result payloads.
They reported $0.0055312575 across successful provider responses, without model judging.
This is a small development signal, not a reliability estimate or total-session bill.

The comparison also exercised Gemma 4 26B/31B, Qwen3.5-35B-A3B, DeepSeek V3.2,
GLM 4.7 Flash and GLM 5. These were exploratory runs across evolving interfaces;
counts are not an apples-to-apples model leaderboard. All failures remain recorded.

| Model/family | Observed nuance | Change / limit |
| --- | --- | --- |
| Gemma 4 26B | One host returned stop with no text/tool calls; another produced repeated invalid nested scope/date arguments. | Optional provider pin and safe response metadata; retain empty-answer rejection. |
| Gemma 4 31B | Correct values but source IDs sometimes lacked brackets; editorial brackets could look like citations. | Explicit citation instructions; backend normalization accepts known IDs with descriptive annotations, never invented references. |
| Qwen3.5 35B | Nested scope was serialized as escaped JSON. A no-tool run invented spill records and was rejected. | Flat asset/area/fleet tools and required initial evidence operation. Flat ranking then passed. |
| DeepSeek V3.2 | Correct spill result on one route; 429s, timeouts and incomplete args on others, sometimes DSML text instead of native calls. | Separate provider availability from quality. Do not parse raw model markup as executed tools. |
| GLM 4.7 Flash | Correct spill rows, but placeholder citations and a partial ranking were also observed. | Actual-scope/full-set output assertions and citation/coverage checks remain required. |
| GLM 5 | More complete compliance prose and correct ranking, but recovered tool failures, a wrong-well attempt, and off-by-one overdue arithmetic. | Bind procedure specialist scope, reuse same-well evidence, and supply a deterministic calendar calculator. Compliance remains incomplete. |
| DeepSeek V4 Flash | Core status/ranking/spills passed; changed-data candidates had malformed citation annotations. | Normalize annotations only around explicitly retrieved IDs. Exact source/claim support still needs review. |

Current source output is described in [the agent/application contract](README.agent-output.md).
Domain results now carry kind, parameters, units, coverage, warnings, source versions,
asOf/evaluatedAt and the exact typed service payload. Models cannot replace these values
with prose. Ordinary AI SDK tool-output parts carry the envelope; no new shared browser
artifact variant or frontend implementation was added.

Current compliance must remain an assessment with unknowns, not an authoritative action
list. The calculator gives conditional calendar dates and explicitly does not assess
completion or precise hour deadlines. Stronger models still made unsupported claims.
Private memory, runtime correction/policy writes and saved-view execution remain separate
application/domain capabilities. Passing core reads does not establish full Q1–Q18 support.

New reports are in `.context/backend-evidence-slice/eval-runs/`; core DeepSeek V4 report:
`1792232182158-f7591ae4-92e2-499b-a0cb-223831b54540`. Changed-data report:
`1792232311181-e8c2c507-f53e-4283-8990-eda8ffc785f8`. Original responses are preserved;
citation formatter changes can be replayed without paid generations.

## Earlier GPT investigation (historical)

Actual OpenRouter `openai/gpt-4.1` calls against the `challenge` database and four
controlled, changed-data scenarios. Fixed assessment clock: 17 October 2026. Every
attempt is retained locally. These are development observations, not a reliability
estimate or evidence that all 18 challenge capabilities work.

## What returned correctly

Eight simpler scenarios passed execution/evidence checks in the rerun. Simple
candidates took approximately 2–4 seconds (excluding additional judge calls).

| Question | Actual result | Important tool behavior |
| --- | --- | --- |
| Is WELL-0001 producing? | No at latest inspection, 15 October; delta 3.2°C below 15°C. Ryan Brooks inspected by drone. Jake Morales attributes shutdown to planned rod replacement. | `getOperationalContext`; administrative active status remains separate. Wording can still overstate a note as the established cause. |
| Top downtime in Northeast Block 7, 16 June–16 October? | WELL-0121: 49 days; WELL-0107 and WELL-0138: 42 days each. | `analyzeOperations`; full 50-well input before limiting. Seven days per non-producing inspection, not repair hours. |
| Corrected spills for WELL-0001? | Six effective events, 15.1 bbl, one formally corrected false positive excluded. | `analyzeOperations`; exact decimal result and correction provenance. |
| Why did May maintenance MNT-0001-028 take longer? | Report attributes about seven extra shut-in days to a back-ordered replacement part. | `readEvidence`; job ID now resolves through its stored report relation. |
| Changed type/threshold at equality? | Alternate well's 20.5°C delta meets its 20.5°C rule. | Actual model used changed data; expected facts never enter candidate input. |
| Conflicting running note? | Last measured delta 8.5°C is below 15°C; operator claim remains attributed and unconfirmed. | Correctly separates measurement, note and administrative status. |
| Another linked narrative? | Seven extra days from back-order, original report cited. | Model followed the returned report ID. |
| Missing well? | Status and latest inspection unknown. | Attempts lookup; invents neither another well nor non-production. |

## Failures that matter

Initial narrative lookup returned not-found because the model supplied a maintenance
ID while the reader accepted only document IDs. Fixed with a namespace-scoped lookup
through `maintenance_reports`, preserving the original document ID/citation.

An initial compliance answer declared unrelated protocols up to date without reading
the necessary reports/history, and called an open fine outstanding debt. Instructions
now distinguish unchecked protocols and unknown payment status. These are prompt
improvements, not deterministic guarantees.

Incident-window reads previously lost later regulatory follow-ups. Reads now include
events linked to inspections in the requested window through `asOf`, and expose that
coverage explicitly. A direct June-only read includes the 14 July site inspection.

The hard compliance scenario remains unreliable. A 6.9-second candidate retrieved the
right evidence but omitted exact overdue dates and the NOV response obligation. The
judge incorrectly said these details were present. Two subsequent trials with stronger
delegation instructions produced **zero complete execution/evidence passes**:

- One recovered from a specialist failure but still omitted exact due dates (~17 s).
- One included 30 July and 10 August due dates, but invented `[spill report]` and
  `[maintenance report]` citation labels. Final validation rejected publication.

Keep these failures visible. Do not report the earlier judge-only pass as a passing
compliance capability. No unbounded prompt tweaking or best-attempt selection.

A final live HTTP smoke check successfully streamed the actual `readEvidence` call,
linked report source and completed answer. It returned the correct seven-day
back-order explanation, but added that there were no repair complications and that
the cause was strictly supply chain delay. That exclusion goes beyond the cited
statement. Straightforward factual success does not imply all narrative wording is
fully grounded; unsupported certainty remains a quality gap.

## Evaluation changes

- Check paired tool arguments and outputs against independent scope/window/totals.
- Keep execution/evidence success separate from answer correctness.
- Check required answer facts directly where practical, including exact due dates.
- Require an exact candidate quote for a judge pass; unmatched quotes become uncertain.
  Even a matching quote is not proof it supports the criterion.
- Keep source versions, locators, all tool inputs/results/errors, latency and token
  usage. Judge runs are extra calls and use the same model here; this is not an
  independent or human-calibrated judge.
- Six automated checks exercise the evaluator itself; no new application test suite.

## Product recommendation

Prioritize **typed findings and obligations**, using deterministic dates/status after
the operative rule and incident evidence are established. Suggested backend fields:
`assetId`, `protocolId`, `triggeredAt`, `dueAt`, `assessedAt`, `status`, `evidenceRefs`,
`missingEvidence`, `suggestedNextStep`. Scope/rule ambiguity must remain unknown.
Do not hardcode the sample SOPs as universal policies.

The operator should get an answer first, then a small table of overdue items with
dates and supporting evidence. Distinguish confirmed breaches, overdue requirements
without recorded completion, unknown payment, and unassessed checks. A suggested
follow-up is not an action created or completed by the system.

The same typed result can support status cards, ranked tables/charts, an obligations
list and an evidence drawer. Current backend exposes actual tool outputs and analytics
presentation hints; only well-status is a validated shared visual today. New component
contracts and saved-view UI still require coordination with the UI owner. No UI or
shared-contract changes were made here.

## Local evidence

Reports live in ignored `.context/backend-evidence-slice/eval-runs/`:

- Initial 4 sample cases: `1792230029086-33aafc55-e73b-4742-96a3-2902e15e3647`.
- Initial 4 controlled cases: `1792230029086-8bb09049-7361-402e-b5a4-443c9b952bff`.
- 5 sample reruns, including misleading compliance judge pass:
  `1792230169599-43cbbaa7-4745-4428-8884-49e8bb42e0f8`.
- 4 controlled reruns: `1792230182865-f112e449-007d-4f97-a286-6431fe5eec87`.
- 2 harder compliance trials with required fact checks and quote validation:
  `1792230247267-d77963ec-4be5-486b-b390-961c09e27f24`.

See [evaluation commands](README.evals.md) to reproduce. Neither reports nor findings
contain provider keys. Source records and database were not changed by these trials.
