import {
  DEFAULT_OPERATOR_PARAMETERS,
  makeSnapshot,
  type OperatorParameters,
  operatorParametersSchema,
  type Plan,
  type Query,
  resultSchema,
  type Snapshot,
} from '../src/protocol.ts';
import type { SavedView } from '../src/view-contract.ts';
import { defaultPlan, getResult } from './domain.ts';

export function operatorPlan(query: Query): Plan {
  return query === 'attention'
    ? { query, views: ['status', 'inspections', 'line', 'conflicts'] }
    : defaultPlan(query);
}

// Every invocation reads the deterministic source anew. Definitions contain only a recipe;
// no source data, prior snapshot, generated narrative or model execution is reused.
export function executeOperatorRead(
  runId: string,
  plan: Plan,
  input: OperatorParameters = DEFAULT_OPERATOR_PARAMETERS,
  generation: Snapshot['generation'] = 'replay',
  savedView?: Pick<SavedView, 'id' | 'revision' | 'name'>,
): Snapshot {
  const parameters = operatorParametersSchema.parse(input);
  const original = getResult(plan.query);
  const selected = original.rows.filter(
    (row) => parameters.wellId === 'all' || row.id === parameters.wellId,
  );
  // Inspection count and chart dates are independent; current status and four-week
  // downtime retain their original source period regardless of either display input.
  const inspections = selected.flatMap((row) =>
    row.trend.slice(-parameters.inspectionCount).map((point) => ({
      wellId: row.id,
      date: point.date,
      deltaC: point.deltaC,
      thresholdC: row.thresholdC,
      sourceIds: [...row.sourceIds],
    })),
  );
  const rows = selected.map((row) => ({
    ...row,
    trend: row.trend.filter(
      (point) => point.date >= parameters.trendStart && point.date <= parameters.trendEnd,
    ),
  }));
  const sourceIds = new Set(rows.flatMap((row) => row.sourceIds));
  const result = resultSchema.parse({
    ...original,
    rows,
    inspections,
    sources: original.sources.filter((source) => sourceIds.has(source.id)),
  });
  return makeSnapshot(runId, plan, result, 'ready', generation, {
    kind: savedView ? 'saved-view' : 'pipeline',
    evaluatedAt: new Date().toISOString(),
    parameters,
    ...(savedView ? { savedView } : {}),
    activity: [
      savedView
        ? `Read approved view “${savedView.name}” with its saved panel composition; no provider call.`
        : 'Ran the chat pipeline and read the synthetic inspection source afresh.',
      `Selected ${rows.length} well(s): ${parameters.wellId}.`,
      `Read the last ${parameters.inspectionCount} weekly inspection(s) per well; missing observations remain explicit.`,
      `Filtered trend only to ${parameters.trendStart} through ${parameters.trendEnd}.`,
      'Applied original T200 ≥15°C / T350 ≥20°C production rules; downtime retains the full 24 Sep–15 Oct 2026 inspection window.',
      `Validated ${result.sources.length} synthetic evidence records and their references.`,
    ],
  });
}

export function unsupportedReplayAnswer(prompt: string) {
  const question = prompt.toLowerCase();
  const unsupported =
    /\b(cost|costs|repair|repairs|invoice|invoices|budget|forecast|predict|prediction|price|prices|maintenance|sop|manual|regulation|regulations)\b/.test(
      question,
    );
  const supported =
    /\b(inspection|inspections|overview|well|wells|production|producing|status|temperature|threshold|trend|downtime|spill|spills|conflict|conflicts|conflicting|table|chart|map|heatmap|bar|attention)\b/.test(
      question,
    );
  return unsupported || !supported
    ? {
        text: 'This synthetic replay supports inspection overviews, production status, inspection-derived downtime, temperature trends, spills and recorded conflicts. It does not contain evidence to answer that question. Ask about those demo records, or configure a live provider to choose a supported investigation. Live presentation selection still uses only the synthetic records.',
        sourceIds: [] as string[],
      }
    : null;
}
