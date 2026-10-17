import type { AnalyticsService, FleetSelection } from './analytics.js';

export async function locateAssets(
  analytics: AnalyticsService,
  input: FleetSelection & { limit: number },
  signal?: AbortSignal,
) {
  const assets = await analytics.listAssets(input, signal);
  const rows = assets.slice(0, input.limit).map((asset) => ({
    assetId: asset.id,
    name: asset.name,
    area: asset.area,
    areaId: asset.areaId,
    latitude:
      asset.lat.trim() && Number.isFinite(Number(asset.lat)) && Math.abs(Number(asset.lat)) <= 90
        ? asset.lat
        : null,
    longitude:
      asset.lon.trim() && Number.isFinite(Number(asset.lon)) && Math.abs(Number(asset.lon)) <= 180
        ? asset.lon
        : null,
    source: asset.source,
  }));
  return {
    status: assets.length ? ('found' as const) : ('unresolved-selection' as const),
    rows,
    sources: rows.map((row) => row.source),
    warnings: assets.length ? [] : ['No assets matched the selection. No location was inferred.'],
    coverage: {
      kind: 'asset-inventory',
      assetsEvaluated: assets.length,
      totalRows: assets.length,
      returnedRows: rows.length,
      truncated: assets.length > rows.length,
    },
  };
}
