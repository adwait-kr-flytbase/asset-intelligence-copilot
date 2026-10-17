import type { ExecutionEvent, ModelObservation } from '../agents/coordinator.js';
import type { EvalCase } from './cases.js';

export type Trial = {
  observation: ModelObservation | null;
  trace: ExecutionEvent[];
  latencyMs: number;
  accepted: boolean;
};
const ratio = (numerator: number, denominator: number) =>
  denominator ? numerator / denominator : null;
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Expected arrays are unordered subsets: equivalent tie ordering and extra evidence are valid. */
function matches(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) && expected.every((item) => actual.some((row) => matches(row, item)))
    );
  if (expected && typeof expected === 'object')
    return (
      !!actual &&
      typeof actual === 'object' &&
      Object.entries(expected).every(([key, value]) => matches(object(actual)[key], value))
    );
  return Object.is(actual, expected);
}

/** Deterministic execution/evidence metrics; no claim that text matching proves grounding. */
export function scoreTrial(test: EvalCase, trial: Trial) {
  const modelCalls = trial.observation?.toolCalls ?? [];
  const starts = trial.trace.filter((event) => event.type === 'tool-start');
  const results = trial.trace.filter((event) => event.type === 'tool-result');
  const errors = trial.trace.filter((event) => event.type === 'tool-error');
  const dataResults = results.filter((event) => event.dataResult);
  const resultEnvelopeIssues = dataResults.flatMap((event) => {
    const envelope = event.dataResult;
    if (!envelope) return [];
    return envelope.schemaVersion !== 1 ||
      envelope.toolCallId !== event.toolCallId ||
      envelope.readOnly !== true ||
      JSON.stringify(envelope.payload) !== JSON.stringify(event.output)
      ? [event.toolCallId]
      : [];
  });
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ');
  const responseChecks = (test.responseChecks ?? []).map((check) => ({
    id: check.id,
    met:
      !!trial.observation &&
      check.anyOf.some((fact) =>
        normalize(trial.observation?.text ?? '').includes(normalize(fact)),
      ),
  }));
  const toolChecks = (test.toolChecks ?? []).map((check) => ({
    id: check.id,
    met: starts.some(
      (start) =>
        [check.toolName].flat().includes(start.toolName) &&
        (!check.input || [check.input].flat().some((expected) => matches(start.input, expected))) &&
        results.some(
          (result) =>
            result.toolCallId === start.toolCallId &&
            (!check.output || matches(result.output, check.output)),
        ),
    ),
  }));
  const goals = test.toolGoals.map((goal) => ({
    id: goal.id,
    met: starts.some(
      (start) =>
        goal.anyOf.includes(start.toolName) &&
        results.some((result) => result.toolCallId === start.toolCallId),
    ),
  }));
  const sources = new Set(trial.observation?.sources.map((source) => source.id) ?? []);
  const evidence = test.sourceGroups.map((group) => ({
    id: group.id,
    met: group.anyOf.some((id) => sources.has(id)),
  }));
  const citations = [
    ...new Set(
      [...(trial.observation?.text ?? '').matchAll(/\[([^\]\n]+)\]/g)].flatMap((match) =>
        match[1] ? [match[1]] : [],
      ),
    ),
  ];
  const invalidCitations = citations.filter((id) => !sources.has(id));
  const wrongScope = modelCalls.filter((call) => {
    const input = object(call.input);
    const selectedAsset = input.assetId ?? object(input.scope).assetId;
    return test.assetId && typeof selectedAsset === 'string' && selectedAsset !== test.assetId;
  });
  // Inspect actual returned narrative evidence as well as requested filters.
  const wrongEvidence = results.filter((result) => {
    const output = object(result.output);
    const documents = Array.isArray(output.documents) ? output.documents : [];
    const hits = Array.isArray(output.hits) ? output.hits : [];
    return [output.document, ...documents, ...hits].some((item) => {
      const asset = object(item).assetId;
      return !!test.assetId && typeof asset === 'string' && asset !== test.assetId;
    });
  });
  const signatures = starts.map((start) =>
    JSON.stringify([
      start.toolName,
      Object.entries(object(start.input)).sort(([a], [b]) => a.localeCompare(b)),
    ]),
  );
  const executionEvidencePassed =
    trial.accepted &&
    goals.every((goal) => goal.met) &&
    toolChecks.every((check) => check.met) &&
    evidence.every((group) => group.met) &&
    !invalidCitations.length &&
    !wrongScope.length &&
    !wrongEvidence.length &&
    !resultEnvelopeIssues.length &&
    !errors.length &&
    modelCalls.every((call) => !call.invalid);
  return {
    executionEvidencePassed,
    dataResults: dataResults.length,
    resultEnvelopeIssues,
    // This deliberately excludes response correctness: review/judging is a separate result.
    toolGoalCoverage: ratio(goals.filter((goal) => goal.met).length, goals.length),
    goals,
    toolChecks,
    toolCheckCoverage: ratio(toolChecks.filter((check) => check.met).length, toolChecks.length),
    requiredSourceRecall: trial.observation
      ? ratio(evidence.filter((group) => group.met).length, evidence.length)
      : null,
    evidence,
    citationValidity: ratio(citations.length - invalidCitations.length, citations.length),
    invalidCitations,
    modelToolCalls: trial.observation ? modelCalls.length : null,
    executedToolCalls: starts.length,
    invalidToolCalls: trial.observation ? modelCalls.filter((call) => call.invalid).length : null,
    toolFailureRate: ratio(errors.length, starts.length),
    wrongAssetArguments: wrongScope.length,
    wrongAssetEvidence: wrongEvidence.length,
    repeatedCallSignatures: signatures.length - new Set(signatures).size,
    latencyMs: trial.latencyMs,
    tokens: trial.observation?.usage ?? null,
    // Missing usage/cost is unknown, never zero. Pricing is not guessed.
    costUsd: null,
    responseChecks,
    responseFactCoverage: ratio(
      responseChecks.filter((check) => check.met).length,
      responseChecks.length,
    ),
    responseReview: { status: 'pending' as const, criteria: test.responseCriteria },
  };
}
