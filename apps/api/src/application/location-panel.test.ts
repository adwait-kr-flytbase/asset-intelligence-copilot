import type { AppEvidence } from '@repo/contracts';
import { readRecipeSchema } from '@repo/contracts';
import { expect, test } from 'vitest';
import { resultIntegrity } from '../agents/result-integrity.js';
import { locationPanel, withLocationRecipe } from './location-panel.js';

const source = {
  id: 'WELL-0001',
  label: 'Well',
  path: 'assets/WELL-0001/asset.json',
  sourceId: 'version-1',
  locator: { line: 1 },
};
const evidence: AppEvidence = {
  id: 'evidence-1',
  recordId: source.id,
  label: source.label,
  path: source.path,
  sourceVersionId: source.sourceId,
  locator: source.locator,
  excerpt: '{}',
  excerptTruncated: false,
};
const parameters = { assetIds: ['WELL-0001'], limit: 5 };
const coverage = {
  kind: 'asset-inventory',
  totalRows: 1,
  returnedRows: 1,
  assetsEvaluated: 1,
  truncated: false,
};
const payload = {
  status: 'found' as const,
  rows: [
    {
      assetId: 'WELL-0001',
      name: 'Well 1',
      area: 'North',
      areaId: 'N',
      latitude: '32.10000',
      longitude: '-102.50000',
      source,
    },
  ],
  sources: [source],
  warnings: [],
  coverage,
};
const panel = () =>
  locationPanel(
    {
      parameters,
      payload,
      warnings: [],
      coverage,
      id: 'location-result',
      integrity: resultIntegrity('locateAssets', parameters, payload),
    },
    [evidence],
    'map',
  );

test('location maps carry replayable scope and preserve unknown production rather than inferring it', () => {
  const result = panel();
  expect(result.recipe).toEqual({
    operation: 'asset-locations',
    presentation: 'geo',
    parameters: { scope: { kind: 'fleet' }, assetIds: ['WELL-0001'], limit: 5 },
  });
  expect(result.geo?.features[0]?.properties.status).toBe('unknown');
  expect(result.geo?.features[0]?.geometry?.coordinates).toEqual([-102.5, 32.1]);
});
test('older trusted location maps gain save metadata without changing retained records', () => {
  const original = panel();
  const { recipe: _recipe, ...legacy } = original;
  expect(withLocationRecipe(legacy).recipe).toEqual(original.recipe);
  expect(legacy).not.toHaveProperty('recipe');
  expect(withLocationRecipe({ ...legacy, resultBinding: undefined }).recipe).toBeUndefined();
});
test('location recipes reject temporal/equipment filters and incompatible visual semantics', () => {
  const recipe = panel().recipe;
  expect(recipe).toBeTruthy();
  expect(
    readRecipeSchema.safeParse({
      ...recipe,
      parameters: { ...recipe?.parameters, window: { from: '2026-01-01', through: '2026-10-17' } },
    }).success,
  ).toBe(false);
  expect(readRecipeSchema.safeParse({ ...recipe, presentation: 'matrix' }).success).toBe(false);
  expect(
    readRecipeSchema.safeParse({
      ...recipe,
      parameters: { ...recipe?.parameters, equipmentKind: 'pump' },
    }).success,
  ).toBe(false);
});
