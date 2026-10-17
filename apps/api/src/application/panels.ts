import {
  type AppEvidence,
  type ApplicationPanel,
  type ReadParameters,
  type ReadRecipe,
  readRecipeSchema,
} from '@repo/contracts';
import { z } from 'zod';
import type { AnalysisInput } from '../evidence/analytics.js';
import type { Source } from '../evidence/types.js';
import { evidenceIds, sourceSchema } from './evidence.js';

export type PanelDescriptor = { id: string; title: string; recipe?: ReadRecipe };
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const nullableDecimal = decimal.nullable();
const sources = z.array(sourceSchema);
const rowSchemas = {
  'current-status': z.object({
    assetId: z.string(),
    name: z.string(),
    area: z.string(),
    producing: z.boolean().nullable(),
    deltaC: nullableDecimal,
    thresholdC: decimal,
    observedAt: z.iso.datetime().nullable(),
    inspectionNotes: z.string(),
    sources,
  }),
  'temperature-history': z.object({
    assetId: z.string(),
    inspectionId: z.string(),
    observedAt: z.iso.datetime(),
    ambientC: decimal,
    wellheadC: decimal,
    producing: z.boolean().nullable(),
    deltaC: nullableDecimal,
    inspectionNotes: z.string(),
    spillDetected: z.boolean(),
    spillVolumeBbl: nullableDecimal,
    sources,
  }),
  downtime: z.object({
    assetId: z.string(),
    name: z.string(),
    downtimeDays: z.number().int().nonnegative(),
    nonProducingInspections: z.number().int().nonnegative(),
    inspectionCount: z.number().int().nonnegative(),
    sources,
  }),
  spills: z.union([
    z.object({
      assetId: z.string(),
      name: z.string().optional(),
      inspectionId: z.string(),
      observedAt: z.iso.datetime(),
      volumeBbl: nullableDecimal,
      lat: decimal.nullish(),
      lon: decimal.nullish(),
      sources,
    }),
    z.object({
      areaId: z.string(),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      count: z.number().int().nonnegative(),
      totalBbl: decimal,
      sources,
    }),
  ]),
  'repair-costs': z.object({
    assetId: z.string(),
    name: z.string(),
    totalUsd: decimal,
    jobCount: z.number().int().nonnegative(),
    sources,
  }),
  'repeat-repairs': z.object({
    assetId: z.string(),
    name: z.string(),
    equipmentKind: z.string(),
    correctiveEvents: z.number().int().nonnegative(),
    maintenanceIds: z.array(z.string()),
    sources,
  }),
};
const coverageSchema = z.object({
  kind: z.string(),
  assetsEvaluated: z.number().int().nonnegative().optional(),
  totalRows: z.number().int().nonnegative(),
  returnedRows: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export const analysisEnvelopeSchema = z.object({
  metric: z.enum([
    'current-status',
    'temperature-history',
    'downtime',
    'spills',
    'repair-costs',
    'repeat-repairs',
  ]),
  status: z.literal('unresolved-selection').optional(),
  sources,
  rows: z.array(z.unknown()).max(500),
  warnings: z.array(z.string()),
  coverage: coverageSchema,
});
export type ValidAnalysis = ReturnType<typeof parseAnalysis>;
export function parseAnalysis(input: AnalysisInput, output: unknown) {
  const envelope = analysisEnvelopeSchema.parse(output);
  if (envelope.metric !== input.metric) throw new Error('Analysis metric mismatch.');
  const rows = envelope.rows.map((row) => rowSchemas[input.metric].parse(row));
  if (envelope.coverage.returnedRows !== rows.length)
    throw new Error('Analysis coverage mismatch.');
  return { ...envelope, rows };
}
export const parametersFor = (input: AnalysisInput): ReadParameters => ({
  scope: input.assetId
    ? { kind: 'asset', assetId: input.assetId }
    : input.area
      ? { kind: 'area', area: input.area }
      : { kind: 'fleet' },
  ...(input.window ? { window: input.window } : {}),
  limit: input.limit,
  ...(input.equipmentKind ? { equipmentKind: input.equipmentKind } : {}),
});

export function point(
  lon: unknown,
  lat: unknown,
): { type: 'Point'; coordinates: [number, number] } | null {
  if (
    lon === null ||
    lon === undefined ||
    lat === null ||
    lat === undefined ||
    lon === '' ||
    lat === ''
  )
    return null;
  const x = Number(lon),
    y = Number(lat);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 180 && Math.abs(y) <= 90
    ? { type: 'Point', coordinates: [x, y] }
    : null;
}
export function makeAnalysisPanel(
  input: AnalysisInput,
  output: ValidAnalysis,
  descriptor: PanelDescriptor,
  evidence: AppEvidence[],
  locationSources: Map<string, Source> = new Map(),
): ApplicationPanel {
  const kind =
    descriptor.recipe?.presentation ??
    (input.metric === 'temperature-history'
      ? 'series'
      : input.metric === 'downtime' || input.metric === 'repair-costs'
        ? 'ranking'
        : input.metric === 'spills'
          ? input.groupBy === 'area-month'
            ? 'matrix'
            : 'geo'
          : 'table');
  // Chat analytics arrive with trusted execution parameters but no descriptor recipe.
  // Derive replay only when the public recipe can retain all executed semantics.
  const candidateRecipe = input.onlyNonProducing
    ? null
    : readRecipeSchema.safeParse(
        descriptor.recipe ?? {
          operation: input.metric,
          parameters: parametersFor(input),
          presentation: kind,
          ...(input.groupBy ? { groupBy: input.groupBy } : {}),
        },
      );
  const recipe = candidateRecipe?.success ? candidateRecipe.data : undefined;
  const rows: ApplicationPanel['rows'] = output.rows.map((row) => {
    const { sources: rowSources, ...values } = row;
    return {
      ...Object.fromEntries(
        Object.entries(values).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(', ') : (value ?? null),
        ]),
      ),
      evidenceIds: evidenceIds(rowSources, evidence),
    };
  });
  const decimalKeys = new Set([
    'deltaC',
    'thresholdC',
    'ambientC',
    'wellheadC',
    'volumeBbl',
    'spillVolumeBbl',
    'totalBbl',
    'totalUsd',
    'lat',
    'lon',
  ]);
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter(
    (key) => key !== 'evidenceIds',
  );
  const columns: ApplicationPanel['columns'] = keys.map((key) => {
    const sample = rows
      .map((row) => row[key])
      .find((value) => value !== null && value !== undefined);
    return {
      key,
      label: key,
      valueType: decimalKeys.has(key)
        ? 'decimal'
        : key === 'observedAt'
          ? 'timestamp'
          : typeof sample === 'boolean'
            ? 'boolean'
            : typeof sample === 'number'
              ? 'integer'
              : 'string',
      ...(['deltaC', 'thresholdC', 'ambientC', 'wellheadC'].includes(key)
        ? { unit: '°C' }
        : key === 'totalUsd'
          ? { unit: 'USD' }
          : ['totalBbl', 'volumeBbl', 'spillVolumeBbl'].includes(key)
            ? { unit: 'bbl' }
            : key === 'downtimeDays'
              ? { unit: 'days' }
              : {}),
    };
  });
  const panel: ApplicationPanel = {
    id: descriptor.id,
    title: descriptor.title,
    kind,
    state:
      output.status === 'unresolved-selection' ? 'unavailable' : rows.length ? 'ready' : 'empty',
    parameters: parametersFor(input),
    columns,
    rows,
    evidenceIds: evidenceIds([...output.sources, ...locationSources.values()], evidence),
    warnings: [...new Set(output.warnings)].slice(0, 95),
    coverage: output.coverage,
    ...(recipe ? { recipe } : {}),
  };
  if (output.warnings.length > 95)
    panel.warnings.push('Additional calculation warnings were omitted from this bounded panel.');
  if (input.onlyNonProducing)
    panel.warnings.push('This panel is filtered to measured non-producing assets.');
  if (!recipe)
    panel.warnings.push(
      'Saving and refreshing this panel is unavailable because its executed filters cannot be represented by an approved read recipe.',
    );
  if (kind === 'status') {
    const row = output.rows[0];
    if (
      input.metric !== 'current-status' ||
      output.rows.length !== 1 ||
      !row ||
      !('thresholdC' in row)
    ) {
      panel.state = 'unavailable';
      panel.warnings.push(
        'A status card requires exactly one classified asset. Use a table for this selection.',
      );
    } else
      panel.status = {
        assetId: row.assetId,
        producing: row.producing,
        deltaC: row.deltaC,
        thresholdC: row.thresholdC,
        observedAt: row.observedAt,
        recordedStatus: null,
      };
  }
  if (kind === 'geo') {
    const features: NonNullable<ApplicationPanel['geo']>['features'] = output.rows.flatMap(
      (row) => {
        if (!('inspectionId' in row) || !('volumeBbl' in row)) return [];
        const location = locationSources.get(row.assetId);
        return [
          {
            type: 'Feature' as const,
            id: `${row.assetId}:${row.inspectionId}`,
            geometry: point(row.lon, row.lat),
            properties: {
              assetId: row.assetId,
              eventId: row.inspectionId,
              label: row.name ?? row.assetId,
              observedAt: row.observedAt,
              volumeBbl: row.volumeBbl,
              status: 'unknown' as const,
              evidenceIds: evidenceIds([...row.sources, ...(location ? [location] : [])], evidence),
            },
          },
        ];
      },
    );
    const positions = features.flatMap((feature) =>
      feature.geometry ? [feature.geometry.coordinates] : [],
    );
    panel.geo = {
      type: 'FeatureCollection',
      features,
      ...(positions.length
        ? {
            bbox: [
              Math.min(...positions.map(([x]) => x)),
              Math.min(...positions.map(([, y]) => y)),
              Math.max(...positions.map(([x]) => x)),
              Math.max(...positions.map(([, y]) => y)),
            ] as [number, number, number, number],
          }
        : {}),
    };
    if (features.some((feature) => !feature.geometry))
      panel.warnings.push('Some spill events have no valid retained asset location.');
    panel.warnings.push('Spill events do not establish measured production status.');
  }
  if (kind === 'series') {
    const byAsset = new Map<string, NonNullable<ApplicationPanel['series']>[number]>();
    for (const row of output.rows) {
      if (!('ambientC' in row)) continue;
      let series = byAsset.get(row.assetId);
      if (!series) {
        series = { id: row.assetId, label: row.assetId, unit: '°C', points: [] };
        byAsset.set(row.assetId, series);
      }
      series.points.push({
        id: row.inspectionId,
        at: row.observedAt,
        value: row.deltaC,
        evidenceIds: evidenceIds(row.sources, evidence),
      });
    }
    if (byAsset.size > 100)
      panel.warnings.push(
        'Only the first 100 asset series are shown; table rows retain all returned observations.',
      );
    panel.series = [...byAsset.values()].slice(0, 100).map((series) => ({
      ...series,
      points: series.points.sort((a, b) => a.at.localeCompare(b.at)),
    }));
  }
  if (kind === 'matrix') {
    const groups = output.rows.filter((row) => 'month' in row);
    const areaIds = [...new Set(groups.map((row) => row.areaId))];
    const allMonths = [...new Set(groups.map((row) => row.month))].sort();
    const months = allMonths.slice(0, 100);
    const dense = areaIds.length * months.length <= 500;
    panel.matrix = {
      rows: areaIds.map((id) => ({ id, label: id })),
      columns: months.map((id) => ({ id, label: id })),
      cells: areaIds.flatMap((areaId) =>
        months.flatMap((month) => {
          const row = groups.find(
            (candidate) => candidate.areaId === areaId && candidate.month === month,
          );
          return !dense && !row
            ? []
            : [
                {
                  rowId: areaId,
                  columnId: month,
                  value: row ? String(row.count) : null,
                  evidenceIds: row ? evidenceIds(row.sources, evidence) : [],
                },
              ];
        }),
      ),
    };
    if (!dense || allMonths.length > 100)
      panel.warnings.push(
        'Matrix uses a bounded sparse projection; table rows retain the complete returned groups.',
      );
    panel.warnings.push(
      'Absent area/month groups are unknown, not evidence of zero spills. Matrix axes include returned groups only.',
    );
  }
  return panel;
}
