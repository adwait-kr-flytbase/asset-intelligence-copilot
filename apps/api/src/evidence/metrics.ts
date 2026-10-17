/** Domain meanings exposed to agents and presentation adapters; no provider/UI dependency. */
export const metricCatalogue = {
  'current-status': {
    quantity: 'measured-production-classification',
    unit: 'boolean',
    grain: 'asset/latest-inspection',
    presentations: ['status', 'table'],
    definition:
      'Compare wellhead minus ambient against the applicable type manual; unknown is not false.',
  },
  'temperature-history': {
    quantity: 'temperature-difference-from-ambient',
    field: 'deltaC',
    unit: '°C',
    grain: 'asset/inspection',
    presentations: ['series', 'table'],
    definition:
      'Discrete inspection readings, not continuous telemetry. Null breaks the line; UTC timestamps.',
  },
  downtime: {
    quantity: 'inspection-derived-downtime',
    field: 'downtimeDays',
    unit: 'days',
    grain: 'asset/window',
    presentations: ['ranking', 'table'],
    definition:
      'Seven days per measured non-producing inspection, not maintenance duration; preserve tied values.',
  },
  spills: {
    quantity: 'effective-spill-events',
    field: 'volumeBbl',
    unit: 'bbl',
    grain: 'asset/inspection',
    presentations: ['geo', 'matrix', 'table'],
    definition:
      'Formal supported false positives excluded. Full-scope totals precede row limiting; unknown volume is not zero.',
  },
  'repair-costs': {
    quantity: 'recorded-repair-cost',
    field: 'totalUsd',
    unit: 'USD',
    grain: 'asset/window',
    presentations: ['ranking', 'table'],
    definition: 'Recorded maintenance amounts selected by work start date; exact decimal sum.',
  },
  'repeat-repairs': {
    quantity: 'corrective-repair-count',
    field: 'correctiveEvents',
    unit: 'count',
    grain: 'asset/equipment/window',
    presentations: ['ranking', 'table'],
    definition: 'Corrective repairs grouped by equipment; scheduled work is excluded.',
  },
} as const;
