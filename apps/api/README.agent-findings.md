# Live agent findings — 17 October 2026

## Latest: accuracy-first implementation and final evaluation

Implemented question planning/scope guards, registered fact/passage publication, exact
stored relationship tracing, typed incident/deadline assessment, per-operation consistent
reads and additive application artifact semantics. The model selects supported references;
it cannot invent the published numerical facts, chart points or map coordinates.

Final Haiku5.5 round: **11/11 final answers approved by Codex against actual evidence;
9/11 strict overall execution passes**. Two runs made a schema-invalid call, were blocked
before execution, then recovered: compliance used an unsupported question-part enum;
relationship tracing passed a reportId instead of the required asset/window. Their final
answers were accurate, but the strict gate intentionally retains those failures. Previous
attempts remain recorded; no best-of selection is claimed. This small development sample
does not establish production reliability or completeQ1–Q18 support.

Seven sample questions and four changed-data controls cover current status/attributed
notes, equality under an unseen manual threshold, missing data, report explanation,
corrected spills, ranking, incident obligations, temperature series and linked incident
records. Independent raw October inspection values27.4/3.2/3.2°C and explicit foreign-key
links were checked in the two added capability cases. Runtime code contains no case IDs
or sample answers. Every final response has a hash-bound evaluator review sidecar.

Four actual application panels were evaluated (ranking, corrected-spill map, status and
temperature series); all matched originating domain results with resolvable evidence.
Text-only answers correctly reported artifact grading not-applicable. No frontend pixel
rendering was changed or tested; the UI owner must consume the additive semantics.

Observed successful candidate-response cost for the final11 trials was **$0.0561641**,
with no paid judge. This excludes earlier debugging trials, separate HTTP/query-embedding
smokes and failed/cancelled provider work. Responses took about4–12seconds in that round.

Read-only domain/application smokes also confirmed:
- A one-row spill map retained full6-spill/15.1bbl totals, explicit truncation and correction evidence.
- WS-07 uses actual June13 work completion: dueJune16; retained report authoredJune15 is reported on-time, not an overdue open obligation.
- Scoped live hybrid retrieval returned the exact May028 back-order report first after
  lexical-recall/fusion improvement. An earlier semantic ranking missed it; search remains
  discovery, not exhaustive evidence or absence proof. Stored report links remain preferred.

Focused verification:21 model-outcome/evaluator checks, API/contracts typechecks, application
and standalone agent builds. No new application test suite, migration or dependency added.

Final sample run: `1792235789556-6309ebe0-4d10-4a4b-a7d1-e5e2d8212bd5`.
Final controls: `1792235789561-c2ff8efc-9775-4e4a-9043-00fd9ce31f04`.
Detailed combined evaluator summary: `.context/accuracy-first-implementation/final-evaluator-summary.json`.
Plan/ledger: `.context/accuracy-first-implementation/plan.md`.

Known limits: question-part coverage checks declared intent/capabilities, not natural-language
entailment; source records may be wrong; source hashes prove identity, not physical truth.
Rule bindings support the declared company protocols and fail closed outside them. Semantic
retrieval is optional and profile-bound. Arbitrary numerical corrections, policy writes,
private recall and new procedural UI components remain outside this implementation.


## Earlier: Haiku 5.5 and final-answer evaluation

Default model is now `anthropic/claude-haiku-5.5` at the user's direction; all three
roles inherit it unless explicitly overridden. Availability was verified on
[OpenRouter](https://openrouter.ai/anthropic/claude-haiku-5.5/). This selection does
not imply that the model or application has passed every capability.

Two rounds of nine real trials were retained: five sample-data questions and four
changed-data controls each round. No paid judge was used. Codex inspected the actual
answers against raw tool outputs and the independent rubric, then recorded a review
for every trial. Reviewer sidecars bind to the exact trial hash and include criterion
verdicts, exact answer excerpts, reasons and unsupported claims. They remain separate
from immutable raw trials and original summaries, which may still say review pending.

| Latest round | Tool/evidence | Final evaluator verdict | Reason |
| --- | --- | --- | --- |
| Alternate type/equality | Pass | Pass | Uses 20.5-degree equality and attributes the newer unconfirmed note. |
| Status/conflicting note | Pass | Pass | Correct delta/threshold, attributed claim and observation timestamp. |
| Linked synthetic report | Pass | Pass | Back-ordered part and seven extra days, future completion kept planned. |
| Missing well | Pass | Pass | Withholds unknown status and does not substitute another asset. |
| Area downtime | Fail | Fail | Correct 49/42/42 results, but bare citation IDs cause coordinator rejection. |
| Corrected spills | Pass | Fail | Correct 6/15.1 totals, but prose falsely says no correction changed totals; actual tool excluded one false positive. |
| Current sample well | Pass | Fail | Correct 3.2/15 and attribution, but claims the note is the only explanation on file despite bounded history. |
| Sample report | Pass | Fail | Correct back-order explanation, then invents that the extra delay occurred after the repair was done. |
| Spill obligations | Fail | Fail | Verification calculator fails on missing trigger evidence; answer substitutes hand arithmetic, lacks operative-clause citations and contradicts its annual-test account. |

Latest round: **7/9 strict tool/evidence, 4/9 final answers approved**. Initial round:
8/9 tool/evidence, also 4/9 final answers approved. These rounds used evolving prompts
and are not an equal-code reliability benchmark. Preserve regressions rather than
selecting whichever attempt passed. Prompt tightening improved the changed-data
controls but did not establish overall improvement.

Successful provider responses reported $0.0308079 initially and $0.0282197 on the
second round ($0.0590276 observed total, 18 trials). Failed/cancelled provider work may
not be included. Routine calls took roughly 2–7 seconds; compliance took 14–29 seconds.
This is a focused development check, not a reliability estimate or all-Q1–Q18 coverage.

Final-output checks now cover all nine executable cases and require an accepted,
nonempty, normally completed answer. These checks catch omissions and associations,
not entailment. The evaluator review is an additional mandatory gate for an overall
pass. See [evaluation commands and review format](README.evals.md).

The general prompt now emphasizes claim-local citations, bounded-history limits,
observation timestamps, author attribution, accurate agreement/conflict descriptions,
separate repair/delay measures and correct deadline triggers. No sample answers were
added to runtime prompts. Remaining failures are intentionally **not** marked fixed.

Retained latest sample run: `1792233104466-17c6a295-2a88-415b-8471-e479576c3425`;
latest controls: `1792233105598-a29a708f-d9ad-4e46-b102-d7e97f9e1b93`.
Initial runs: `1792233011012-79da1261-73b1-42bc-b3a9-f70b855cb293` and
`1792233033371-8b26d807-ad2a-4947-8aa3-336e63ab6e65`. All live under
`.context/backend-evidence-slice/eval-runs/`; each trial has `.review.json` and
`.review.json.validated.json` companions. No extra model calls are needed to review them.

## Earlier: open-weight comparison and application boundary

At this earlier stage, development default was `deepseek/deepseek-v4-flash`, independently configurable
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
