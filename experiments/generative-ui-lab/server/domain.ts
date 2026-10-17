import { type Plan, type Query, type Result, resultSchema } from '../src/protocol.ts';

const readings = [
  {
    id: 'LAB-W01',
    area: 'North ridge',
    type: 'T200',
    deltaC: 3.2,
    downtimeDays: 21,
    spillBbl: 0,
    lat: 31.94,
    lon: -102.26,
    values: [19, 4, 4, 3.2],
    conflicts: [
      'The asset register says running. The latest inspection is below the production threshold.',
    ],
  },
  {
    id: 'LAB-W02',
    area: 'North ridge',
    type: 'T350',
    deltaC: 22.1,
    downtimeDays: 7,
    spillBbl: 5.4,
    lat: 31.96,
    lon: -102.24,
    values: [24, 18, 23, 22.1],
    conflicts: [
      'A field correction records 5.4 bbl; the earlier estimate was 4.5 bbl. Original estimate retained.',
    ],
  },
  {
    id: 'LAB-W03',
    area: 'South basin',
    type: 'T200',
    deltaC: 17.8,
    downtimeDays: 0,
    spillBbl: 0,
    lat: 31.89,
    lon: -102.29,
    values: [18, 19, 17, 17.8],
    conflicts: [],
  },
  {
    id: 'LAB-W04',
    area: 'South basin',
    type: 'T350',
    deltaC: 8.4,
    downtimeDays: 14,
    spillBbl: 1.2,
    lat: 31.91,
    lon: -102.22,
    values: [23, null, 9, 8.4],
    conflicts: [
      'Planned shutdown reported by the supervisor; an operator says the well is running. Neither statement changes the measured temperature.',
    ],
  },
  {
    id: 'LAB-W05',
    area: 'North ridge',
    type: 'T200',
    deltaC: 16.5,
    downtimeDays: 7,
    spillBbl: 2.1,
    lat: null,
    lon: null,
    values: [16, 8, 17, 16.5],
    conflicts: [],
  },
  {
    id: 'LAB-W06',
    area: 'South basin',
    type: 'T350',
    deltaC: 25.2,
    downtimeDays: 0,
    spillBbl: 0,
    lat: 31.9,
    lon: -102.25,
    values: [24, 26, 25, 25.2],
    conflicts: [],
  },
] as const;
const dates = ['2026-09-24', '2026-10-01', '2026-10-08', '2026-10-15'];
export function defaultPlan(query: Query): Plan {
  return {
    query,
    views:
      query === 'attention'
        ? ['status', 'table', 'map', 'conflicts']
        : query === 'downtime'
          ? ['status', 'bar', 'line', 'table']
          : ['status', 'map', 'heatmap', 'table', 'conflicts'],
  };
}
export function getResult(query: Query): Result {
  const rows = readings.map((w) => ({
    id: w.id,
    area: w.area,
    type: w.type,
    producing: w.deltaC >= (w.type === 'T200' ? 15 : 20),
    deltaC: w.deltaC,
    thresholdC: w.type === 'T200' ? 15 : 20,
    downtimeDays:
      w.values.filter((v) => v !== null && v < (w.type === 'T200' ? 15 : 20)).length * 7,
    spillBbl: w.spillBbl,
    spillDate:
      w.spillBbl > 0
        ? w.id === 'LAB-W02'
          ? '2026-09-24'
          : w.id === 'LAB-W04'
            ? '2026-10-08'
            : '2026-10-01'
        : null,
    lat: w.lat,
    lon: w.lon,
    trend: w.values.map((deltaC, i) => ({ date: dates[i], deltaC })),
    sourceIds: [`LAB-INS-${w.id}`, `LAB-RULE-${w.type}`],
    conflicts: [...w.conflicts],
  }));
  const sources = [
    ...rows.map((w) => ({
      id: `LAB-INS-${w.id}`,
      label: `Synthetic inspection record · ${w.id}`,
      body: `Demo observation 15 Oct 2026. Temperature above ambient ${w.deltaC} °C. Inspection-derived downtime ${w.downtimeDays} days across the four-week window. Spill volume ${w.spillBbl} bbl${w.spillDate ? ` observed ${w.spillDate}` : ''}. Weekly temperature differences: ${w.trend.map((p) => `${p.date}: ${p.deltaC === null ? 'not observed' : `${p.deltaC} °C`}`).join('; ')}. These values are synthetic lab fixtures. ${w.conflicts.join(' ')}`,
    })),
    ...['T200', 'T350'].map((type) => ({
      id: `LAB-RULE-${type}`,
      label: `Synthetic ${type} operating rule`,
      body: `Lab rule: producing when wellhead minus ambient temperature is at least ${type === 'T200' ? 15 : 20} °C. Each observed non-producing weekly inspection contributes 7 days of downtime. Missing inspections add zero. This synthetic lab is not the real backend or dataset.`,
    })),
  ];
  return resultSchema.parse({
    id: `lab-${query}-r1`,
    query,
    revision: 1,
    synthetic: true,
    title:
      query === 'attention'
        ? 'Which wells need attention?'
        : query === 'downtime'
          ? 'Where are we losing production time?'
          : 'What do the spill records show?',
    period: '24 Sep – 15 Oct 2026',
    asOf: '2026-10-17T00:00:00Z',
    rows,
    sources,
  });
}
