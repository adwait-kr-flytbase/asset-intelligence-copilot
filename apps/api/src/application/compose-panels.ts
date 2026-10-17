import { type ApplicationPanel, panelSchema, readRecipeSchema } from '@repo/contracts';
import { digest } from '../agents/result-integrity.js';
import { sumDecimals } from '../evidence/analytics.js';

const unique = <T>(items: T[]) => [
  ...new Map(items.map((item) => [JSON.stringify(item), item])).values(),
];
const assets = (panel: ApplicationPanel) =>
  [
    ...new Set([
      ...(panel.parameters.assetIds ?? []),
      ...(panel.parameters.scope.kind === 'asset' ? [panel.parameters.scope.assetId] : []),
      ...panel.rows.flatMap((row) => (typeof row.assetId === 'string' ? [row.assetId] : [])),
      ...(panel.geo?.features.map((feature) => feature.properties.assetId) ?? []),
    ]),
  ].sort();

/** Compose compatible, disjoint immutable results. Never aggregate across quantities or windows. */
export function composePanels(panels: ApplicationPanel[], separate = false): ApplicationPanel[] {
  if (separate) return panels;
  const groups = new Map<string, ApplicationPanel[]>();
  for (const panel of panels) {
    const eligible =
      ['geo', 'table', 'ranking', 'series'].includes(panel.kind) &&
      panel.state === 'ready' &&
      panel.resultBinding &&
      panel.coverage &&
      !panel.coverage.truncated &&
      assets(panel).length;
    const key = eligible
      ? JSON.stringify({
          kind: panel.kind,
          metric: panel.resultBinding?.metric,
          quantity: panel.resultBinding?.quantity,
          columns: panel.columns,
          window: panel.parameters.window,
          filter: panel.parameters.equipmentKind,
          groupBy: panel.recipe?.groupBy,
        })
      : panel.id;
    const group = groups.get(key) ?? [];
    if (
      !group.some(
        (existing) =>
          existing.resultBinding?.contentHash === panel.resultBinding?.contentHash &&
          existing.kind === panel.kind,
      )
    )
      group.push(panel);
    groups.set(key, group);
  }
  const composed: ApplicationPanel[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    if (group.length === 1) {
      composed.push(first);
      continue;
    }
    const assetIds = group.flatMap(assets);
    // An overlapping or truncated scope cannot be summed without a new domain calculation.
    if (
      new Set(assetIds).size !== assetIds.length ||
      group.reduce((n, p) => n + p.rows.length, 0) > 500 ||
      group.reduce((n, p) => n + (p.geo?.features.length ?? 0), 0) > 500
    ) {
      composed.push(...group);
      continue;
    }
    if (!first.resultBinding) {
      composed.push(...group);
      continue;
    }
    const inputResultIds = group.flatMap(
      (panel) =>
        panel.resultBinding?.inputResultIds ??
        (panel.resultBinding ? [panel.resultBinding.resultId] : []),
    );
    const rows = unique(group.flatMap((panel) => panel.rows));
    if (first.kind === 'ranking' && first.resultBinding?.valueField) {
      const field = first.resultBinding.valueField;
      rows.sort((a, b) => Number(b[field]) - Number(a[field]));
    }
    const parameters = {
      ...first.parameters,
      scope: { kind: 'fleet' as const },
      assetIds: [...new Set(assetIds)].sort(),
      limit: Math.min(
        500,
        group.reduce((n, p) => n + p.parameters.limit, 0),
      ),
    };
    const resultBinding = {
      ...first.resultBinding,
      resultId: `composition:${digest(inputResultIds)}`,
      inputResultIds,
      contentHash: digest({
        inputs: group.map((panel) => panel.resultBinding),
        rows,
        geo: group.flatMap((panel) => panel.geo?.features ?? []),
        series: group.flatMap((panel) => panel.series ?? []),
      }),
      sourceManifestHash: digest(group.map((panel) => panel.resultBinding?.sourceManifestHash)),
      operation: 'composeResults',
      calculationVersion: 'disjoint-composition-v1',
    };
    const recipe = group.every((panel) => !!panel.recipe)
      ? readRecipeSchema.safeParse({ ...first.recipe, parameters })
      : undefined;
    const panel = {
      ...first,
      id: `${first.id}:combined`,
      title: `${first.title} (${parameters.assetIds.length} wells)`,
      parameters,
      rows,
      resultBinding,
      evidenceIds: [...new Set(group.flatMap((panel) => panel.evidenceIds))],
      warnings: [...new Set(group.flatMap((panel) => panel.warnings))],
      coverage: {
        kind: 'composed-disjoint-results',
        assetsEvaluated: group.reduce((n, p) => n + (p.coverage?.assetsEvaluated ?? 0), 0),
        totalRows: group.reduce((n, p) => n + (p.coverage?.totalRows ?? 0), 0),
        returnedRows: group.reduce((n, p) => n + (p.coverage?.returnedRows ?? 0), 0),
        truncated: false,
      },
      ...(first.geo
        ? {
            geo: {
              type: 'FeatureCollection' as const,
              features: unique(group.flatMap((panel) => panel.geo?.features ?? [])),
            },
          }
        : {}),
      ...(first.series ? { series: group.flatMap((panel) => panel.series ?? []) } : {}),
      ...(first.totals
        ? {
            totals: {
              spillCount: group.reduce((n, p) => n + (p.totals?.spillCount ?? 0), 0),
              totalBbl: sumDecimals(group.map((p) => p.totals?.totalBbl ?? '0')),
              excludedFalsePositives: group.reduce(
                (n, p) => n + (p.totals?.excludedFalsePositives ?? 0),
                0,
              ),
              unknownVolumeEvents: group.reduce(
                (n, p) => n + (p.totals?.unknownVolumeEvents ?? 0),
                0,
              ),
            },
          }
        : {}),
      ...(first.corrections
        ? { corrections: unique(group.flatMap((panel) => panel.corrections ?? [])) }
        : {}),
      ...(first.mapCoverage
        ? {
            mapCoverage: {
              returnedEvents: group.reduce((n, p) => n + (p.mapCoverage?.returnedEvents ?? 0), 0),
              mappedEvents: group.reduce((n, p) => n + (p.mapCoverage?.mappedEvents ?? 0), 0),
              unmappedEvents: group.reduce((n, p) => n + (p.mapCoverage?.unmappedEvents ?? 0), 0),
              distinctMappedAssets: new Set(
                group.flatMap(
                  (panel) =>
                    panel.geo?.features
                      .filter((feature) => feature.geometry)
                      .map((feature) => feature.properties.assetId) ?? [],
                ),
              ).size,
              markerMeaning: 'spill-event' as const,
            },
          }
        : {}),
    };
    delete panel.recipe;
    if (recipe?.success) panel.recipe = recipe.data;
    composed.push(panelSchema.parse(panel));
  }
  return composed;
}
