import { createHash } from 'node:crypto';
import {
  type AssessmentInput,
  date,
  makeAssessment,
  type OperationalDataset,
  type OperationalRecord,
  selectedAssets,
  text,
} from './types.js';

export const inspectionMeasures = [
  'wellhead-temperature',
  'ambient-temperature',
  'temperature-difference',
] as const;
export const inspectionDimensions = ['region', 'area', 'team', 'well', 'well-type'] as const;
export type InspectionSummaryInput = AssessmentInput & {
  measure?: (typeof inspectionMeasures)[number];
  groupBy?: (typeof inspectionDimensions)[number];
  timeGrain?: 'all' | 'week' | 'month';
  orderBy?: 'mean' | 'maximum' | 'minimum' | 'observations';
};

/** Typed reusable aggregation: the model selects fields and filters, never computes values. */
export function summarizeInspections(data: OperationalDataset, input: InspectionSummaryInput) {
  const measure = input.measure ?? 'wellhead-temperature',
    dimension = input.groupBy ?? 'region',
    grain = input.timeGrain ?? 'all';
  const through = Date.parse(input.through ? `${input.through}T23:59:59.999Z` : data.asOf);
  const from = Date.parse(
    input.from ?? new Date(through - 365 * 86400000).toISOString().slice(0, 10),
  );
  const assets = new Map(selectedAssets(data, input).map((asset) => [asset.id, asset]));
  const changes = new Map<string, Record<string, unknown>>();
  for (const note of data.notes
    .filter(
      (note) =>
        text(note, 'note_type') === 'data_correction' && date(note, 'created_at') <= through,
    )
    .sort((a, b) => date(a, 'created_at') - date(b, 'created_at'))) {
    const id = text(note, 'inspection_id');
    changes.set(id, { ...changes.get(id), [text(note, 'field')]: note.raw.corrected_value });
  }
  type Group = {
    group: string;
    period: string;
    values: number[];
    wells: Set<string>;
    sources: OperationalRecord[];
  };
  const groups = new Map<string, Group>();
  for (const original of data.inspections) {
    const at = date(original, 'inspected_at'),
      asset = assets.get(text(original, 'asset_id'));
    if (!asset || at < from || at > through) continue;
    const raw = { ...original.raw, ...changes.get(original.id) };
    const head = raw.wellhead_temp_c == null ? NaN : Number(raw.wellhead_temp_c),
      ambient = raw.ambient_temp_c == null ? NaN : Number(raw.ambient_temp_c);
    const value =
      measure === 'wellhead-temperature'
        ? head
        : measure === 'ambient-temperature'
          ? ambient
          : head - ambient;
    if (!Number.isFinite(value)) continue;
    const area = data.areas.find((area) => area.id === text(asset, 'area_id'));
    const history = Array.isArray(asset.raw.type_history)
      ? (asset.raw.type_history as Record<string, unknown>[])
      : [];
    const historical = history.find(
      (entry) =>
        Date.parse(String(entry.from)) <= at &&
        (!entry.to || Date.parse(`${entry.to}T23:59:59.999Z`) >= at),
    );
    const group =
      dimension === 'well'
        ? asset.id
        : dimension === 'area'
          ? area
            ? text(area, 'name')
            : text(asset, 'area_id')
          : dimension === 'region'
            ? area
              ? text(area, 'region') || text(area, 'name').split(' Block')[0]!
              : 'Unknown region'
            : dimension === 'team'
              ? (data.teams
                  .find((team) => team.id === text(asset, 'team_id'))
                  ?.raw.name?.toString() ?? text(asset, 'team_id'))
              : historical
                ? String(historical.well_type)
                : text(asset, 'well_type');
    const day = new Date(at);
    if (grain === 'week') day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    const period =
      grain === 'all'
        ? 'All selected dates'
        : grain === 'month'
          ? day.toISOString().slice(0, 7)
          : day.toISOString().slice(0, 10);
    const key = JSON.stringify([group, period]),
      entry = groups.get(key) ?? {
        group,
        period,
        values: [],
        wells: new Set<string>(),
        sources: [],
      };
    entry.values.push(value);
    entry.wells.add(asset.id);
    entry.sources.push(original);
    groups.set(key, entry);
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  const entries = [...groups.values()]
    .map((entry) => {
      const sum = entry.values.reduce((a, b) => a + b, 0),
        minimum = entry.values.reduce((a, b) => Math.min(a, b), Infinity),
        maximum = entry.values.reduce((a, b) => Math.max(a, b), -Infinity);
      const rows = entry.sources,
        ids = new Set(rows.map((record) => record.id));
      const sources = [
        ...rows.map((record) => record.source),
        ...data.notes
          .filter(
            (note) =>
              ids.has(text(note, 'inspection_id')) &&
              date(note, 'created_at') <= through &&
              text(note, 'note_type') === 'data_correction',
          )
          .map((note) => note.source),
      ];
      const sample = Array.from(
        { length: Math.min(24, rows.length) },
        (_, index) =>
          rows[
            Math.round((index * (rows.length - 1)) / Math.max(1, Math.min(24, rows.length) - 1))
          ]!.source,
      );
      const originalIds = new Set(rows.map((record) => record.source.id));
      const sampled = [...sample, ...sources.filter((source) => !originalIds.has(source.id))];
      const sourceManifestSha256 = createHash('sha256')
        .update(
          JSON.stringify(
            sources
              .map((source) => ({
                id: source.id,
                sourceId: source.sourceId,
                path: source.path,
                locator: source.locator,
              }))
              .sort((a, b) => a.id.localeCompare(b.id)),
          ),
        )
        .digest('hex');
      return {
        row: {
          group: entry.group,
          period: entry.period,
          mean: round(sum / entry.values.length),
          minimum: round(minimum),
          maximum: round(maximum),
          observations: entry.values.length,
          wells: entry.wells.size,
          sourceManifestSha256,
        },
        text: `${entry.group}, ${entry.period}: ${measure} mean ${round(sum / entry.values.length)} °C, range ${round(minimum)}–${round(maximum)} °C; ${entry.values.length} inspections across ${entry.wells.size} wells. Full source identity manifest SHA-256 ${sourceManifestSha256}.`,
        sources: sampled,
      };
    })
    .sort(
      (a, b) =>
        b.row[input.orderBy ?? 'mean'] - a.row[input.orderBy ?? 'mean'] ||
        a.row.group.localeCompare(b.row.group) ||
        a.row.period.localeCompare(b.row.period),
    );
  return makeAssessment(
    data,
    input,
    'inspection_summary',
    `${measure} by ${dimension}${grain === 'all' ? '' : ` and ${grain}`}`,
    [
      { key: 'group', label: dimension, valueType: 'string' },
      { key: 'period', label: 'Period (UTC)', valueType: 'string' },
      { key: 'mean', label: `Mean ${measure}`, valueType: 'decimal', unit: '°C' },
      { key: 'minimum', label: 'Minimum', valueType: 'decimal', unit: '°C' },
      { key: 'maximum', label: 'Maximum', valueType: 'decimal', unit: '°C' },
      { key: 'observations', label: 'Inspection observations', valueType: 'integer' },
      { key: 'wells', label: 'Wells', valueType: 'integer' },
      {
        key: 'sourceManifestSha256',
        label: 'Full input source manifest SHA-256',
        valueType: 'string',
      },
    ],
    entries,
    [
      `Inclusive UTC dates ${new Date(from).toISOString().slice(0, 10)} through ${new Date(through).toISOString().slice(0, 10)}. Recorded ${measure}; inspection-weighted means, with source field corrections applied. All eligible inspections drive aggregates; attached evidence contains at most24 representative inspections per group plus corrections. Full source identity manifests are hashed per group. No causal or statistical significance claim.`,
      ...(dimension === 'team'
        ? [
            'Team grouping uses recorded current asset ownership; it does not reconstruct historical team ownership.',
          ]
        : []),
    ],
  );
}
