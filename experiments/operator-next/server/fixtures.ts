import {
  assetsSchema,
  operationalVisualSchema,
  type Artifact,
  type Evidence,
  type OperationalVisual,
} from '../src/contracts';
import snapshot from './fixture-snapshot.json';

// Copied declarative compatibility snapshot. This app never imports another app's source.
export const templates: OperationalVisual[] = snapshot.visuals.map((v) =>
  operationalVisualSchema.parse(v),
);
export const fixtureFrom = '2026-09-24';
export const fixtureTo = '2026-10-15';
export const fixtureAsOf = '2026-10-17T00:00:00Z';
export const dates = ['2026-09-24', '2026-10-01', '2026-10-08', '2026-10-15'];
const geo = templates.find((v) => v.artifact.kind === 'geo')!.artifact as Extract<
  Artifact,
  { kind: 'geo' }
>;
const areas = [
  'North ridge',
  'North ridge',
  'South basin',
  'South basin',
  'North ridge',
  'South basin',
];
const types = ['T200', 'T350', 'T200', 'T350', 'T200', 'T350'];
export const assets = assetsSchema.parse(
  geo.points.map((p, i) => ({
    id: p.wellId,
    label: p.label,
    area: areas[i],
    type: types[i],
    status: p.status,
    spillBbl: p.volumeBbl,
    lat: p.lat,
    lon: p.lon,
  })),
);
// Absolute temperatures are explicitly invented sensor fixtures, not measured source data.
// Values match the earlier standalone raw-fixture method; null is retained for W04.
export const rawReadings: Record<
  string,
  { date: string; ambient: number; wellhead: number | null }[]
> = {
  'LAB-W01': [
    { date: dates[0], ambient: 23, wellhead: 42 },
    { date: dates[1], ambient: 22, wellhead: 26 },
    { date: dates[2], ambient: 21, wellhead: 25 },
    { date: dates[3], ambient: 20, wellhead: 23.2 },
  ],
  'LAB-W02': [
    { date: dates[0], ambient: 23.7, wellhead: 47.7 },
    { date: dates[1], ambient: 22.7, wellhead: 40.7 },
    { date: dates[2], ambient: 21.7, wellhead: 44.7 },
    { date: dates[3], ambient: 20.7, wellhead: 42.8 },
  ],
  'LAB-W03': [
    { date: dates[0], ambient: 24.4, wellhead: 42.4 },
    { date: dates[1], ambient: 23.4, wellhead: 42.4 },
    { date: dates[2], ambient: 22.4, wellhead: 39.4 },
    { date: dates[3], ambient: 21.4, wellhead: 39.2 },
  ],
  'LAB-W04': [
    { date: dates[0], ambient: 25.1, wellhead: 48.1 },
    { date: dates[1], ambient: 24.1, wellhead: null },
    { date: dates[2], ambient: 23.1, wellhead: 32.1 },
    { date: dates[3], ambient: 22.1, wellhead: 30.5 },
  ],
  'LAB-W05': [
    { date: dates[0], ambient: 25.8, wellhead: 41.8 },
    { date: dates[1], ambient: 24.8, wellhead: 32.8 },
    { date: dates[2], ambient: 23.8, wellhead: 40.8 },
    { date: dates[3], ambient: 22.8, wellhead: 39.3 },
  ],
  'LAB-W06': [
    { date: dates[0], ambient: 26.5, wellhead: 50.5 },
    { date: dates[1], ambient: 25.5, wellhead: 51.5 },
    { date: dates[2], ambient: 24.5, wellhead: 49.5 },
    { date: dates[3], ambient: 23.5, wellhead: 48.7 },
  ],
};
export const corrections = assets.map((asset, index) => ({
  wellId: asset.id,
  recordId: `REPAIR-${asset.id}`,
  original: String(100 + index * 10),
  proposed: String(105 + index * 10),
}));
export function source(
  id: string,
  label: string,
  kind: Evidence['kind'],
  excerpt: string,
  recordId = id,
): Evidence {
  return {
    id,
    label,
    kind,
    recordId,
    revision: 'fixture-r1',
    path: `synthetic-fixtures/${kind}/${recordId}.json`,
    excerpt,
    visibility: 'shared',
    observedAt: fixtureAsOf,
  };
}
export function fixtureEvidence() {
  const records = new Map<string, Evidence>();
  for (const visual of templates)
    for (const e of visual.evidence) records.set(e.id, structuredClone(e));
  for (const asset of assets) {
    const readings = rawReadings[asset.id];
    records.set(
      `LAB-RAW-TEMPERATURE-${asset.id}`,
      source(
        `LAB-RAW-TEMPERATURE-${asset.id}`,
        `Synthetic raw-temperature record · ${asset.id}`,
        'inspection',
        `Standalone invented sensor fixture for ${asset.id}. Absolute temperatures are constructed synthetic values, not actual observations or reconstructed measurements. ${readings.map((p) => `${p.date}: ambient ${p.ambient} °C, wellhead ${p.wellhead === null ? 'not observed' : p.wellhead + ' °C'}`).join('; ')}.`,
      ),
    );
  }
  for (const c of corrections)
    records.set(
      `LAB-CORRECTION-${c.wellId}`,
      source(
        `LAB-CORRECTION-${c.wellId}`,
        `Synthetic correction proposal · ${c.wellId}`,
        'correction',
        `Synthetic repair record ${c.recordId}: original labor duration ${c.original} minutes; proposed ${c.proposed} minutes. Proposal only: no write, approval, or recalculation has occurred. Original retained.`,
        c.recordId,
      ),
    );
  return records;
}
