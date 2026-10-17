import { visualSchema } from './index.js';

// Entirely synthetic: these IDs deliberately cannot be mistaken for dataset records.
export const fixtureVisual = visualSchema.parse({
  kind: 'well-status',
  assetId: 'WELL-FIXTURE',
  producing: false,
  temperatureDeltaC: 3.2,
  observedAt: '2026-10-15T15:30:00Z',
  sources: [{ id: 'INS-FIXTURE', label: 'Synthetic inspection', path: 'fixture://inspection' }],
});

export const fixtureText =
  'The chat stream is connected. This is synthetic fixture data, not an answer about the oil field.';
