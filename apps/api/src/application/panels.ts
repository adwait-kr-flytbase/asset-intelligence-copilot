import {
  type AppEvidence,
  type ApplicationPanel,
  type ReadParameters,
  type ReadRecipe,
  readRecipeSchema,
} from '@repo/contracts';
import { resultIntegrity } from '../agents/result-integrity.js';
import type { AnalysisInput } from '../evidence/analytics.js';
import { metricCatalogue } from '../evidence/metrics.js';
import type { Source } from '../evidence/types.js';
import { evidenceIds } from './evidence.js';

export type PanelDescriptor = {
  id: string;
  title: string;
  recipe?: ReadRecipe;
  presentation?: ApplicationPanel['kind'];
  result?: { id: string; integrity: ReturnType<typeof resultIntegrity> };
};
export { parseAnalysis } from '../evidence/result-schema.js';

import type { ValidAnalysis } from '../evidence/result-schema.js';
export const parametersFor = (input: AnalysisInput): ReadParameters => ({
  ...(input.assetIds ? { assetIds: input.assetIds } : {}),
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
    descriptor.presentation ??
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
    resultBinding: {
      resultId: descriptor.result?.id ?? descriptor.id,
      ...(descriptor.result?.integrity ??
        resultIntegrity(
          'analyzeOperations',
          { ...input, from: input.window?.from, through: input.window?.through },
          output,
        )),
      operation: 'analyzeOperations',
      metric: input.metric,
      quantity: metricCatalogue[input.metric].quantity,
      ...('field' in metricCatalogue[input.metric]
        ? { valueField: (metricCatalogue[input.metric] as { field: string }).field }
        : {}),
      timeZone: 'UTC',
      nullPolicy: 'unknown-not-zero',
    },
    ...(output.totals ? { totals: output.totals } : {}),
    ...(output.correctionAudit
      ? {
          corrections: output.correctionAudit.map(({ sources, ...change }) => ({
            ...change,
            evidenceIds: evidenceIds(sources, evidence),
          })),
        }
      : {}),
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
    panel.mapCoverage = {
      returnedEvents: features.length,
      mappedEvents: positions.length,
      unmappedEvents: features.length - positions.length,
      distinctMappedAssets: new Set(
        features.filter((feature) => feature.geometry).map((feature) => feature.properties.assetId),
      ).size,
      markerMeaning: 'spill-event',
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
    panel.seriesSemantics = {
      quantity: 'temperature-difference-from-ambient',
      valueField: 'deltaC',
      timeField: 'observedAt',
      timeZone: 'UTC',
      interpolation: 'none',
      missing: 'gap',
      cadence: 'discrete-inspections',
      returnedSeries: byAsset.size,
      displayedSeries: Math.min(100, byAsset.size),
    };
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
