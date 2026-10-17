import { resolveArtifactForView } from '../src/artifact-bindings.ts';
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
import { buildArtifacts } from './artifacts.ts';
import { defaultPlan, getResult } from './domain.ts';

// Bounded scripted fixture intent selection, not a production semantic planner.
export function operatorPlan(query: Query, prompt = ''): Plan {
  if (!unavailableRequest(prompt)) {
    if (/\b(correction|corrections|correct|proposed|original)\b/i.test(prompt))
      return { query, views: ['correction', 'claims', 'timeline'] };
    if (/\b(cost|costs|spend|spending|expense|expenses)\b/i.test(prompt))
      return { query, views: ['costs', 'timeline'] };
    if (
      /\b(compliance|obligation|obligations|deadline|deadlines|overdue|regulatory)\b/i.test(prompt)
    )
      return { query, views: ['obligations', 'timeline'] };
    if (/\b(claim|claims|disputed|competing|said|reports)\b/i.test(prompt))
      return { query, views: ['claims', 'timeline', 'conflicts'] };
    if (/\b(map|location|locations|geographic|geography)\b/i.test(prompt))
      return { query, views: ['map'] };
    if (/\b(heatmap|distribution|matrix)\b/i.test(prompt)) return { query, views: ['heatmap'] };
    if (/\b(ambient|wellhead|temperature|temperatures|trend|trends)\b/i.test(prompt))
      return { query, views: ['line', 'inspections'] };
    if (/\b(history|timeline|chronological|repair|repairs|maintenance)\b/i.test(prompt))
      return { query, views: ['timeline', 'claims'] };
  }
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
  const enriched = buildArtifacts(plan, rows, parameters, original.rows);
  const primary = resolveArtifactForView(enriched.artifacts, plan.views[0], parameters.wellId);
  const result = resultSchema.parse({
    ...original,
    ...(primary
      ? { title: primary.title, period: `${primary.scope.from} – ${primary.scope.to}` }
      : {}),
    rows,
    inspections,
    artifacts: enriched.artifacts,
    sources: [
      ...original.sources.filter((source) => sourceIds.has(source.id)),
      ...enriched.sources,
    ],
  });
  return makeSnapshot(runId, plan, result, 'ready', generation, {
    kind: savedView ? 'saved-view' : 'pipeline',
    evaluatedAt: new Date().toISOString(),
    parameters,
    ...(savedView ? { savedView } : {}),
    activity: [
      savedView
        ? `Read approved view “${savedView.name}” with its saved panel composition; no provider call.`
        : 'Ran the chat pipeline and read the requested synthetic source fixtures afresh.',
      `Selected ${rows.length} well(s): ${parameters.wellId}.`,
      `Read the last ${parameters.inspectionCount} weekly inspection(s) per well; missing observations remain explicit.`,
      `Filtered trend only to ${parameters.trendStart} through ${parameters.trendEnd}.`,
      'Applied original T200 ≥15°C / T350 ≥20°C production rules; downtime retains the full 24 Sep–15 Oct 2026 inspection window.',
      'Other panels declare their own source periods; fixture compliance rules are invented and correction review cannot write records.',
      `Validated ${result.sources.length} synthetic evidence records and their references.`,
    ],
  });
}

function unavailableRequest(prompt: string) {
  return /\b(forecast|predict|prediction|predictions|price|prices|budget|invoice|invoices|sop|manual|regulation|regulations)\b/i.test(
    prompt,
  );
}

export function unsupportedReplayAnswer(prompt: string) {
  const question = prompt.toLowerCase();
  const unsupported = unavailableRequest(question);
  const supported =
    /\b(location|locations|geographic|geography|distribution|matrix)\b/.test(question) ||
    /\b(inspection|inspections|overview|well|wells|production|producing|status|temperature|temperatures|ambient|wellhead|threshold|trend|trends|downtime|spill|spills|conflict|conflicts|conflicting|table|chart|map|heatmap|bar|attention|cost|costs|spend|spending|expense|expenses|repair|repairs|maintenance|compliance|obligation|obligations|deadline|deadlines|overdue|regulatory|history|timeline|chronological|claim|claims|disputed|competing|said|reports|correction|corrections|correct|proposed|original)\b/.test(
      question,
    );
  return unsupported || !supported
    ? {
        text: 'This synthetic replay supports inspections, production status, inspection-derived downtime, temperature trends, spills, recorded repair costs, invented compliance obligations, history, competing claims and read-only correction proposals. It does not contain evidence for forecasts, invoice details, real regulations or that unsupported question. Live presentation selection still uses only the synthetic fixtures.',
        sourceIds: [] as string[],
      }
    : null;
}
