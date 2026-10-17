import {
  type AppEvidence,
  type ApplicationPanel,
  panelSchema,
  readRecipeSchema,
} from '@repo/contracts';
import type { AgentDataResult } from '../agents/results.js';

export function locationPanel(
  result: Pick<
    Extract<AgentDataResult, { kind: 'asset-locations' }>,
    'parameters' | 'payload' | 'warnings' | 'coverage' | 'id' | 'integrity'
  >,
  evidence: AppEvidence[],
  id: string,
  presentation = 'geo',
) {
  const input = result.parameters as {
    assetId?: string;
    assetIds?: string[];
    area?: string;
    limit: number;
  };
  const evidenceFor = (recordId: string) =>
    evidence.filter((item) => item.recordId === recordId).map((item) => item.id);
  const features = result.payload.rows.map((row) => {
    const lat = row.latitude?.trim() ? Number(row.latitude) : NaN;
    const lon = row.longitude?.trim() ? Number(row.longitude) : NaN;
    const valid =
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180;
    return {
      type: 'Feature' as const,
      id: row.assetId,
      geometry: valid ? { type: 'Point' as const, coordinates: [lon, lat] } : null,
      properties: {
        assetId: row.assetId,
        eventId: null,
        label: `${row.name} (${row.assetId}) — ${row.area}`,
        observedAt: null,
        volumeBbl: null,
        status: 'unknown' as const,
        evidenceIds: evidenceFor(row.assetId),
      },
    };
  });
  return withLocationRecipe(
    panelSchema.parse({
      id,
      kind: presentation,
      state: features.length ? 'ready' : 'empty',
      title: 'Asset locations',
      parameters: {
        ...(input.assetIds ? { assetIds: input.assetIds } : {}),
        scope: input.assetId
          ? { kind: 'asset', assetId: input.assetId }
          : input.area
            ? { kind: 'area', area: input.area }
            : { kind: 'fleet' },
        limit: input.limit,
      },
      columns: [
        { key: 'assetId', label: 'Well', valueType: 'string' },
        { key: 'area', label: 'Area', valueType: 'string' },
        { key: 'latitude', label: 'Latitude', valueType: 'decimal' },
        { key: 'longitude', label: 'Longitude', valueType: 'decimal' },
      ],
      rows: result.payload.rows.map((row) => ({
        assetId: row.assetId,
        area: row.area,
        latitude: row.latitude,
        longitude: row.longitude,
        evidenceIds: evidenceFor(row.assetId),
      })),
      evidenceIds: evidence.map((item) => item.id),
      warnings: [
        ...result.warnings,
        ...(features.some((feature) => !feature.geometry)
          ? ['Some assets have no valid recorded coordinates; no location was inferred.']
          : []),
      ],
      coverage: result.coverage,
      resultBinding: {
        resultId: result.id,
        ...result.integrity,
        operation: 'locateAssets',
        metric: 'asset-location',
        quantity: 'recorded-asset-location',
        timeZone: 'UTC',
        nullPolicy: 'unknown-not-zero',
      },
      ...(presentation === 'geo' ? { geo: { type: 'FeatureCollection', features } } : {}),
    }),
  );
}

/** Add replay metadata for recorded inventory maps, including results persisted before binding existed. */
export function withLocationRecipe(panel: ApplicationPanel): ApplicationPanel {
  if (
    panel.recipe ||
    panel.resultBinding?.metric !== 'asset-location' ||
    panel.resultBinding.quantity !== 'recorded-asset-location' ||
    !['locateAssets', 'composeResults'].includes(panel.resultBinding.operation)
  )
    return panel;
  const recipe = readRecipeSchema.safeParse({
    operation: 'asset-locations',
    presentation: panel.kind,
    parameters: panel.parameters,
  });
  return recipe.success ? { ...panel, recipe: recipe.data } : panel;
}
