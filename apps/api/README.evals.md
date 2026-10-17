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

The original sample-data cases use existing read-only PostgreSQL tools:

```sh
AGENT_NAMESPACE=challenge pnpm exec tsx src/evaluation/run.ts --live --data=sample --model=provider/model --trials=3
```

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
- Wrong asset arguments and wrong asset document evidence.
- Required-source recall and citation-ID validity.
- Invalid model tool calls, execution failures and repeated call signatures.
- Candidate acceptance by the coordinator, wall time and reported token usage.

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
flags unsupported claims. Candidate and judge tokens/latency are separate. Judge calls
are additional paid calls; scores are not human-calibrated and should be inspected.
An oversized/incomplete judge packet fails explicitly; no silent evidence truncation.
Without a judge, answer criteria remain pending for human review rather than passing.

Every attempt is retained, with dataset fingerprint and fixed clock; reports include
per-case execution success counts. Inspect failures and response-review reasons rather
than relying on a blended score or best attempt. Small trial counts are a development
signal, not a reliability estimate. No model quality measurements exist until live
trials run. Never treat a mocked response as successful real-model evaluation.

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
