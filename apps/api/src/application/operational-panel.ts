import { type AppEvidence, panelSchema } from '@repo/contracts';
import type { AgentDataResult } from '../agents/results.js';
import type { OperationalQuery } from '../evidence/operations/service.js';

export function assessmentPanel(
  result: Pick<
    Extract<AgentDataResult, { kind: 'operational-assessment' }>,
    'id' | 'payload' | 'parameters' | 'integrity'
  >,
  evidence: AppEvidence[],
  id: string,
  presentation = 'table',
) {
  const input = result.parameters as OperationalQuery,
    payload = result.payload;
  let shortened = false;
  const idsFor = (ids: string[]) =>
    evidence.filter((e) => ids.includes(e.recordId)).map((e) => e.id);
  const parameters = {
    scope: input.area
      ? { kind: 'area' as const, area: input.area }
      : input.assetIds?.length === 1
        ? { kind: 'asset' as const, assetId: input.assetIds[0]! }
        : { kind: 'fleet' as const },
    ...(input.assetIds && input.assetIds.length <= 200 ? { assetIds: input.assetIds } : {}),
    ...(input.team ? { team: input.team } : {}),
    ...(input.from && input.through
      ? { window: { from: input.from, through: input.through } }
      : {}),
    limit: input.limit ?? 100,
  };
  const rows = payload.rows.map(({ _sourceIds, ...raw }) => {
    const row = { ...raw };
    for (const column of payload.columns) {
      if (column.valueType === 'decimal' && typeof row[column.key] === 'number')
        row[column.key] = String(row[column.key]);
      if (column.valueType === 'string' && Array.isArray(row[column.key]))
        row[column.key] = (row[column.key] as string[]).join(', ');
      if (typeof row[column.key] === 'string' && (row[column.key] as string).length > 12000) {
        row[column.key] =
          (row[column.key] as string).slice(0, 11800) +
          '… [display text abbreviated; supporting source records remain attached]';
        shortened = true;
      }
    }
    return { ...row, evidenceIds: idsFor(Array.isArray(_sourceIds) ? _sourceIds : []) };
  });
  return panelSchema.parse({
    id,
    kind: presentation,
    state: payload.rows.length ? 'ready' : 'empty',
    title: payload.title,
    parameters,
    columns: payload.columns,
    rows,
    evidenceIds: evidence.map((e) => e.id),
    warnings: [
      ...payload.warnings,
      ...(shortened
        ? [
            'Long evidence descriptions are abbreviated for display; aggregates use the complete input and supporting records remain attached.',
          ]
        : []),
    ],
    coverage: payload.coverage,
    resultBinding: {
      resultId: result.id,
      ...result.integrity,
      operation: 'assessOperations',
      metric: input.topic,
      quantity: input.topic,
      ...(presentation === 'ranking'
        ? {
            valueField:
              input.topic === 'regional-temperatures'
                ? 'meanWellheadC'
                : input.topic === 'repair-priorities'
                  ? 'score'
                  : input.topic === 'inspection-summary'
                    ? (input.orderBy ?? 'mean')
                    : payload.columns.find((column) =>
                        ['decimal', 'integer'].includes(column.valueType),
                      )?.key,
          }
        : {}),
      timeZone: 'UTC',
      nullPolicy: 'unknown-not-zero',
    },
    recipe: {
      operation: 'operational-assessment',
      parameters,
      presentation,
      assessment: {
        topic: input.topic,
        ...(input.measure ? { measure: input.measure } : {}),
        ...(input.groupBy ? { groupBy: input.groupBy } : {}),
        ...(input.timeGrain ? { timeGrain: input.timeGrain } : {}),
        ...(input.orderBy ? { orderBy: input.orderBy } : {}),
        ...(input.query ? { query: input.query } : {}),
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.currentStatus ? { currentStatus: input.currentStatus } : {}),
      },
    },
    ...(presentation === 'bar'
      ? { bar: { categoryField: 'area', seriesField: 'reason', valueField: 'share', unit: '%' } }
      : {}),
  });
}
