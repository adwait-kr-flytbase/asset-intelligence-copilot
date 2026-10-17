# Model/tool evaluations

User direction: prioritize actual model tool calls and responses. No new application,
HTTP, provider-unit or database-smoke test suite. Existing foundation checks stay intact.

## Evaluate the real model

Run from `apps/api`. A preview makes zero provider calls and needs no key or database:

```sh
pnpm exec tsx src/evaluation/run.ts
pnpm exec tsx src/evaluation/run.ts --data=sample
```

For live trials, keep OPENROUTER_API_KEY in ignored app-local `.env`. Choose a
function-calling model explicitly with `--model` or OPENROUTER_MODEL. No default model
is chosen and no live calls happen without `--live`.

```sh
pnpm exec tsx src/evaluation/run.ts --live --model=provider/model --trials=3
```

Use a valid model ID in place of `provider/model`. `--data=controlled` is the default:
fresh deterministic tool data for each trial, with actual unscripted model choices.
It includes a distinct well/type with a changed threshold and equality boundary,
status with conflicting notes, a linked narrative and missing evidence.

The original sample-data cases use read-only PostgreSQL evidence and analytics tools,
including corrected spill totals and downtime rankings:

```sh
AGENT_NAMESPACE=challenge pnpm exec tsx src/evaluation/run.ts --live --data=sample --model=provider/model --trials=3
```

Models are independently configurable: `--model` chooses the coordinator/default,
`--evidence-model` and `--procedure-model` override specialists. Omitted specialist
flags inherit the selected candidate, not runtime role env overrides; this prevents
an unnoticed expensive role during cheap tests. Reports record all three IDs. `--provider=deepinfra` optionally pins a hosting provider
for candidate roles, with fallback disabled; provider availability is model-specific.
The optional judge remains independently routed. Safe provider observations record
actual host, finish reason, native tool arguments, text/reasoning character counts
(no hidden reasoning text) and provider-reported cost where available. These observations
survive partial failures; no provider price is guessed.
`--judge-model` remains separate and opt-in. A no-`--live` preview shows the selected
IDs and makes no provider requests. Example candidate: `google/gemma-4-26b-a4b-it`;
model/provider tool compatibility and quality still require live evaluation.

Optional `--case=sample-q1` selects a case; comma-separated IDs select several.
`--timeout-ms=60000` bounds each candidate/judge call. Trials are 1–10 per case,
default one. Agent step/output/tool budgets also apply. No database writes/reset/seed.
Sample expectations assume original source records and the challenge clock;
custom datasets need independent expected facts rather than reusing sample answers.

## What is scored

Each trial saves actual model calls/arguments, executed tool outputs, retrieved sources,
raw candidate text (including rejected candidates when available), completion status,
latency, time to first tool result, tool durations and reported tokens. Reports go to
ignored `.context/backend-evidence-slice/eval-runs/<run>/` in this worktree.

Automatic deterministic metrics:

- Required tool-goal coverage, allowing valid alternative tools/paths.
- Paired actual tool input/output checks: dates/scope and independent expected totals
  or ranking rows must match on the same call. Expected arrays are unordered subsets.
- Wrong asset arguments and wrong asset document evidence.
- Required-source recall and citation-ID validity.
- Invalid model tool calls, execution failures and repeated call signatures.
- Candidate acceptance by the coordinator, wall time and reported token usage.
- Explicit required response facts (such as due dates), separate from tool execution.
  Text presence catches omissions; it does not establish semantic correctness.

Repeated signatures are diagnostic, not automatically wasted work. Citation validity
means the ID was retrieved; it does not establish claim support. Execution/evidence
success is deliberately separate from response correctness. Unknown usage/cost and
empty denominators are null, not zero or perfect scores. Partial results retained when
provider failure prevents a final observation may have incomplete call/token metrics.

For automatic answer quality, enable an additional model judge explicitly:

```sh
pnpm exec tsx src/evaluation/run.ts --live --model=provider/model --judge-model=provider/judge-model --trials=3
```

The judge receives the question, independent expected criteria, actual response and
actual tool evidence. It grades every criterion pass/fail/uncertain with reasons and
flags unsupported claims. A pass requires a verbatim supporting answer excerpt;
invented/paraphrased excerpts become uncertain. Required response-fact checks can veto
a judge pass. Candidate and judge tokens/latency are separate. Judge calls
are additional paid calls; scores are not human-calibrated and should be inspected.
An oversized/incomplete judge packet fails explicitly; no silent evidence truncation.
Without a judge, answer criteria remain pending for human review rather than passing.

Every attempt is retained, with dataset fingerprint and fixed clock; reports include
per-case execution success counts. Inspect failures and response-review reasons rather
than relying on a blended score or best attempt. Small trial counts are a development
signal, not a reliability estimate. See [live findings](README.agent-findings.md) for
observed successes and failures. Never treat a mocked response as successful
real-model evaluation.

## Minimum capabilities, generalization

`catalogue.ts` maps all Q1–Q18 to general capabilities and dependent sequences. Entries
marked target are coverage gaps, not passing tests. The executable cases in `cases.ts`
start small; expected facts never enter the coordinator's input. Controlled cases use
different IDs, values, types and threshold boundaries; extend with new time windows,
paraphrases and held-out data without special runtime routing by case ID.

The response architecture and tools must serve unseen questions, not recognize example
wording. See [capability roadmap](README.capabilities.md).

The only new automated tests validate metric arithmetic/failure detection, not app
behavior:

```sh
pnpm exec vitest run src/evaluation/metrics.test.ts
```

## Reuse recorded candidates without spending

`pnpm exec tsx src/evaluation/rescore.ts /path/to/trial.json` applies current deterministic
graders to a retained candidate, without provider/database calls or modifying the original.
It records original and grader fingerprints. Multiple input files are supported.

Current analytics uses flat asset/area/fleet tool names; graders accept both historic
nested and current flat parameter shapes when their scope/window/output is correct.
Provider errors (including 429), empty answers, invalid calls, citations and missing
answer facts are labelled separately. The compliance case checks actual deterministic
calendar deadline results and explicit containment observation/limit, not only dates.
UI result envelopes are checked against the exact actual service payload; a schema-valid
envelope alone does not establish that a narrative is supported. Cost observations cover
only successful provider responses seen by this adapter and may omit failed/cancelled requests.

## Final-answer gate and session evaluator review

Every executable case now has explicit answer checks: values and units, attribution,
method, deadlines or an honest missing-data answer. Pattern checks can associate a
well with its number on the same row; incidental numbers elsewhere are insufficient.
Equivalent hour abbreviations are accepted. `finalOutputChecksPassed` requires an
accepted, nonempty, normally finished answer with all required facts present.
This is an omission/format gate, not semantic proof: negation and unsupported extra
claims still require reading the answer against the actual evidence.

For the current Haiku runs, Codex acts as the final evaluator, without another paid
model. Reviews grade every independent rubric criterion and identify unsupported
claims. Each review binds to the SHA-256 of the exact original trial and supplies
verbatim answer excerpts plus evidence-based reasons. The original trial is retained.
Validate a prepared review from `apps/api`:

```sh
pnpm exec tsx src/evaluation/review.ts /path/to/trial.json /path/to/trial.review.json
```

Review shape:

```json
{
  "reportSha256": "64 lowercase hex characters from the original trial file",
  "reviewer": "Codex session final evaluator",
  "criteria": [{"id": "rubric criterion ID", "verdict": "pass", "answerQuote": "exact answer excerpt", "reason": "why the actual evidence supports it"}],
  "unsupportedClaims": []
}
```

Every rubric ID must occur exactly once. Verdicts may be pass, fail or uncertain;
a pass needs an actual nonempty answer quote. Empty quotes are allowed for failures
caused by omissions. The CLI writes an exclusive `.validated.json` sidecar and makes
zero model/database calls. Existing sidecars are not overwritten.

`responsePassed` requires all answer checks and all reviewer criteria passing with
no unsupported claims. `overallPassed` additionally requires execution/evidence
passing. An unreviewed answer remains pending, never an overall pass. A recovered
tool failure still fails the strict execution gate even if useful results survive.
Review reasons are the evaluator's recorded judgment, not independent proof.
