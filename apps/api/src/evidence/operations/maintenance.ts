import { createHash } from 'node:crypto';
import type { Source } from '../types.js';
import type { AssessmentInput, OperationalDataset, OperationalRecord } from './types.js';
import { areaName, date, makeAssessment, selectedAssets, text } from './types.js';

const DAY = 86_400_000;
const end = (value: string) => Date.parse(value.length === 10 ? `${value}T23:59:59.999Z` : value);
const round = (value: number) => Math.round(value * 100) / 100;
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length
    ? (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.floor(sorted.length / 2)]!) / 2
    : null;
};
const byAsset = (rows: OperationalRecord[]) => {
  const result = new Map<string, OperationalRecord[]>();
  for (const row of rows) {
    const key = text(row, 'asset_id');
    result.set(key, [...(result.get(key) ?? []), row]);
  }
  return result;
};
const reportFor = (data: OperationalDataset, job: OperationalRecord) => {
  const path = text(job, 'report_file');
  return path
    ? data.documents.find(
        (doc) =>
          doc.source.path.endsWith(path) &&
          (doc.source.path.includes(text(job, 'asset_id')) || doc.markdown.includes(job.id)),
      )
    : undefined;
};
const isRepair = (job: OperationalRecord) =>
  text(job, 'maintenance_type') === 'corrective' &&
  !/spill.?clean|clean.?up|remediat/i.test(`${text(job, 'issue')} ${text(job, 'action_taken')}`);
const warningPattern =
  /rattl|squeal|fluid pound|tagging bottom|amps? hunting|tripp|ground fault|vibrat|knock|overheat|leak|high pressure alarm|gas odor|smelled gas|rotten.egg|H2S monitor alarm/i;

function correctedReadings(
  data: OperationalDataset,
  records: OperationalRecord[],
  through: number,
) {
  const corrections = data.notes
    .filter(
      (note) =>
        text(note, 'note_type') === 'data_correction' && date(note, 'created_at') <= through,
    )
    .sort((a, b) => date(a, 'created_at') - date(b, 'created_at'));
  const changes = new Map<string, Record<string, unknown>>();
  for (const note of corrections) {
    const id = text(note, 'inspection_id');
    changes.set(id, { ...changes.get(id), [text(note, 'field')]: note.raw.corrected_value });
  }
  return records
    .filter((record) => date(record, 'inspected_at') <= through)
    .map((record) => ({
      ...record,
      raw: { ...record.raw, ...changes.get(record.id) },
    }))
    .sort((a, b) => date(a, 'inspected_at') - date(b, 'inspected_at'));
}

/** A reproducible triage score, never a calibrated probability of future failure. */
export function assessRepairPriorities(data: OperationalDataset, input: AssessmentInput = {}) {
  const through = Math.min(end(input.through ?? data.asOf), end(data.asOf));
  const from = input.from ? Date.parse(input.from) : through - 31 * DAY;
  const notesByAsset = byAsset(data.notes);
  const repairsByAsset = byAsset(data.maintenance.filter(isRepair));
  const readingsByAsset = byAsset(correctedReadings(data, data.inspections, through));
  const manuals = data.documents.filter((doc) =>
    /well-types\/|OM-T\d/.test(doc.source.path + doc.markdown.slice(0, 400)),
  );
  const entries = selectedAssets(data, input)
    .flatMap((asset) => {
      if (
        text(asset, 'status') === 'plugged_and_abandoned' &&
        Date.parse(text(asset, 'decommissioned_on')) <= through
      )
        return [];
      const jobs = (repairsByAsset.get(asset.id) ?? [])
        .filter((job) => date(job, 'started_at') <= through)
        .sort((a, b) => date(b, 'started_at') - date(a, 'started_at'));
      const warnings = (notesByAsset.get(asset.id) ?? [])
        .filter(
          (note) =>
            text(note, 'note_type') === 'operator_note' &&
            date(note, 'created_at') >= from &&
            date(note, 'created_at') <= through &&
            warningPattern.test(text(note, 'text')) &&
            !jobs.some((job) => date(job, 'started_at') > date(note, 'created_at')),
        )
        .sort((a, b) => date(a, 'created_at') - date(b, 'created_at'));
      if (!warnings.length) return [];
      const readings = (readingsByAsset.get(asset.id) ?? []).slice(-4);
      const delta = readings.map(
        (record) => Number(record.raw.wellhead_temp_c) - Number(record.raw.ambient_temp_c),
      );
      const declining =
        delta.length === 4 &&
        delta.every(Number.isFinite) &&
        delta.slice(1).every((v, i) => v < delta[i]!) &&
        delta[0]! - delta[3]! >= 3;
      const esp = text(asset, 'well_type') === 'T500';
      const latest = readings.at(-1);
      const notesText = warnings.map((note) => text(note, 'text')).join(' ');
      const failure = esp && /ground fault|tripp/i.test(notesText);
      const alarmLimit = ['T350', 'T500'].includes(text(asset, 'well_type'))
        ? 95
        : text(asset, 'well_type') === 'T200'
          ? 85
          : null;
      const alarm =
        latest && alarmLimit !== null && Number(latest.raw.wellhead_temp_c) > alarmLimit;
      const repeated = jobs.filter(
        (job) =>
          date(job, 'started_at') >= through - 365 * DAY &&
          (!esp || text(job, 'equipment_kind') === 'esp_pump'),
      );
      // Fixed weights keep top-three and top-ten requests in the same order.
      const score =
        (failure ? 100 : 0) +
        (alarm ? 80 : 0) +
        (esp && declining ? 60 : 0) +
        (/gas odor|smelled gas|rotten.egg|H2S monitor alarm/i.test(notesText) ? 70 : 0) +
        (/leak|high pressure alarm/i.test(notesText) ? 30 : 0) +
        (/amps? hunting/i.test(notesText) ? 20 : 0) +
        Math.min(10, warnings.length) * 2 +
        Math.min(10, repeated.length);
      const signs = [
        failure
          ? 'Drive trips/ground fault: T500 manual treats as failure; do not repeatedly reset'
          : '',
        alarm
          ? `Latest wellhead ${latest!.raw.wellhead_temp_c} °C exceeds ${alarmLimit} °C manual limit; verify applicable type manual`
          : '',
        esp && declining
          ? `Four latest temperature deltas fall ${delta.map(round).join(' → ')} °C; ≥3 °C drop triggers a drive/insulation check within 14 days of ${text(readings[3]!, 'inspected_at')}`
          : '',
        `${repeated.length} corrective ${esp ? 'ESP ' : ''}repairs in preceding 365 days`,
        latest
          ? `Latest inspection ${latest.id} (${text(latest, 'inspected_at')}), delta ${round(delta.at(-1)!)} °C`
          : 'No inspection available',
      ];
      const last = jobs.find(
        (job) => Number.isFinite(date(job, 'completed_at')) && date(job, 'completed_at') <= through,
      );
      const quotes = warnings
        .map((note) => `${text(note, 'created_at')}: “${text(note, 'text')}”`)
        .join('\n');
      const sources = [
        asset.source,
        ...warnings.map((note) => note.source),
        ...readings.map((record) => record.source),
        ...repeated.map((job) => job.source),
        ...(last ? [last.source] : []),
        ...data.notes
          .filter(
            (note) =>
              text(note, 'note_type') === 'data_correction' &&
              date(note, 'created_at') <= through &&
              readings.some((reading) => reading.id === text(note, 'inspection_id')),
          )
          .map((note) => note.source),
        ...manuals
          .filter(
            (doc) =>
              doc.source.path.includes(text(asset, 'well_type')) ||
              doc.markdown.includes(`OM-${text(asset, 'well_type')}`),
          )
          .map((doc) => doc.source),
      ];
      return [
        {
          row: {
            rank: 0,
            well: asset.id,
            area: areaName(data, asset),
            score,
            operatorEvidence: quotes,
            otherWarnings: signs.filter(Boolean).join('; '),
            lastRepair: last
              ? `${last.id}, completed ${text(last, 'completed_at')}: ${text(last, 'issue')}`
              : 'No completed non-spill corrective repair recorded',
            priorityReason: `Triage score ${score}; ${signs.filter(Boolean).join('; ')}`,
          },
          text: `${asset.id}: score ${score}. ${quotes} ${signs.filter(Boolean).join('; ')}. Last repair: ${last ? `${last.id} ${text(last, 'completed_at')}` : 'none recorded'}.`,
          sources,
        },
      ];
    })
    .sort((a, b) => b.row.score - a.row.score || a.row.well.localeCompare(b.row.well));
  entries.forEach((entry, i) => {
    entry.row.rank = i + 1;
  });
  return makeAssessment(
    data,
    input,
    'repair_priorities',
    'Repair inspection priorities for the next 90 days',
    [
      { key: 'rank', label: 'Rank', valueType: 'integer' },
      { key: 'well', label: 'Well', valueType: 'string' },
      { key: 'area', label: 'Area', valueType: 'string' },
      { key: 'operatorEvidence', label: 'Operator-note evidence', valueType: 'string' },
      { key: 'otherWarnings', label: 'Other warning signs', valueType: 'string' },
      { key: 'lastRepair', label: 'Last repair', valueType: 'string' },
      { key: 'score', label: 'Triage score', valueType: 'integer' },
      { key: 'priorityReason', label: 'Priority reason', valueType: 'string' },
    ],
    entries,
    [
      `Warnings observed ${new Date(from).toISOString()} through ${new Date(through).toISOString()}; a subsequent started non-spill corrective repair resolves earlier notes for this screen, even if still in progress.`,
      'Heuristic triage, not a calibrated 90-day failure probability. Score: ESP trips/ground fault 100; temperature alarm 80; gas warning 70; T500 four-reading decline ≥3 °C 60; leak/pressure 30; hunting amps 20; 2 per warning note (max 20); 1 per recent corrective event (max 10). Ties use well ID.',
      'Inspection trends are limited to latest four readings; missing data, changing operating conditions, and repairs can confound them. A field assessment must confirm equipment condition.',
    ],
  );
}

/** Separates documented waiting time from measured chronology and unknown attribution. */
export function assessRepairDelays(data: OperationalDataset, input: AssessmentInput = {}) {
  const asOf = end(data.asOf);
  const from = Date.parse(input.from ?? `${new Date(asOf).getUTCFullYear() - 1}-01-01`);
  const through = Math.min(end(input.through ?? `${new Date(from).getUTCFullYear()}-12-31`), asOf);
  const assets = selectedAssets(data, input);
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  const notes = byAsset(
    data.notes.filter(
      (note) => text(note, 'note_type') === 'operator_note' && date(note, 'created_at') <= asOf,
    ),
  );
  type Delay = {
    area: string;
    reason: string;
    days: number | null;
    sources: Source[];
    detail: string;
  };
  const delays: Delay[] = [];
  let censored = 0;
  for (const job of data.maintenance) {
    const asset = assetMap.get(text(job, 'asset_id'));
    const started = date(job, 'started_at');
    if (!asset || started < from || started > through || !Number.isFinite(started)) continue;
    const completed = date(job, 'completed_at');
    const report = reportFor(data, job);
    if (!Number.isFinite(completed) || completed > asOf) {
      censored++;
      continue;
    }
    const nearby = (notes.get(asset.id) ?? [])
      .filter((note) => {
        const t = date(note, 'created_at');
        const validEnd = Date.parse(text(note, 'valid_to'));
        return (
          (t >= started - 45 * DAY && t <= completed + 7 * DAY) ||
          (t <= started && validEnd >= started)
        );
      })
      .sort((a, b) => date(a, 'created_at') - date(b, 'created_at'));
    const shut = nearby
      .filter(
        (note) =>
          /(?:shut[ -]?in|shut (?:the )?well in)/i.test(text(note, 'text')) &&
          !/stays shut|until|waiting|expected/i.test(text(note, 'text')) &&
          date(note, 'created_at') <= started,
      )
      .at(-1);
    const restart =
      shut &&
      nearby.find(
        (note) =>
          date(note, 'created_at') > date(shut, 'created_at') &&
          date(note, 'created_at') >= started &&
          /restarted|put back on production|brought .*back online/i.test(text(note, 'text')),
      );
    const explicit = report?.markdown.match(
      /(?:about\s+)?(\d+(?:\.\d+)?)\s+days?\s+longer than the repair itself([^\n]*)/i,
    );
    let days: number | null = explicit ? Number(explicit[1]) : null;
    let basis = explicit ? `Report states ${days} extra days${explicit[2]}` : '';
    if (shut && restart) {
      // Pair only one job per shut/restart episode; overlapping jobs are ambiguous.
      const start = date(shut, 'created_at');
      const finish = date(restart, 'created_at');
      const overlap = data.maintenance.filter(
        (other) =>
          other.id !== job.id &&
          text(other, 'asset_id') === asset.id &&
          date(other, 'started_at') < finish &&
          date(other, 'completed_at') > start,
      );
      if (!overlap.length) {
        const elapsed = (finish - start) / DAY;
        const repairDuration = (completed - started) / DAY;
        if (days === null) days = Math.max(0, elapsed - repairDuration);
        basis += `; shut-in ${text(shut, 'created_at')}, restart ${text(restart, 'created_at')}; elapsed ${round(elapsed)} days minus job interval ${round(repairDuration)} days`;
      } else basis += '; multiple jobs overlap note episode; no elapsed-time attribution';
    }
    if (days !== null && days <= 0) continue;
    // Restrict attribution to statements that explicitly discuss waiting, not ordinary parts/crew sections.
    const waitingNotes = nearby.filter(
      (note) =>
        /wait|delay|back.order|committed|impassable/i.test(text(note, 'text')) &&
        ((date(note, 'created_at') >= started && date(note, 'created_at') <= completed) ||
          (Date.parse(text(note, 'valid_from')) <= completed &&
            Date.parse(text(note, 'valid_to')) >= started)),
    );
    const waitingText = explicit?.[2] || waitingNotes.map((note) => text(note, 'text')).join(' ');
    const categories = [
      ['Parts', /(?:replacement )?parts?|back.order|supplier|vendor/i],
      ['Weather', /weather|rain|snow|ice|impassable|storm/i],
      ['Contractors', /contractor|weekday.*slot/i],
      ['Crews', /crew.*(?:committed|unavailable|wait)|wait.*crew|rig.*(?:unavailable|committed)/i],
    ]
      .filter(([, pattern]) => (pattern as RegExp).test(waitingText))
      .map(([name]) => name as string);
    const reason =
      days === null
        ? 'Unmeasured / delay not established'
        : categories.length === 1
          ? categories[0]!
          : categories.length > 1
            ? 'Multiple documented reasons'
            : 'Unknown / not attributable';
    delays.push({
      area: areaName(data, asset),
      reason,
      days,
      sources: [
        asset.source,
        job.source,
        ...(report ? [report.source] : []),
        ...waitingNotes.map((note) => note.source),
        ...(shut ? [shut.source] : []),
        ...(restart ? [restart.source] : []),
      ],
      detail: `${job.id}: ${basis || 'No explicit extra-day figure or unambiguous shut-in/restart pair'}; ${waitingText || 'no documented waiting reason'}`,
    });
  }
  const groups = new Map<string, Delay[]>();
  for (const delay of delays) {
    const key = `${delay.area}|${delay.reason}`;
    groups.set(key, [...(groups.get(key) ?? []), delay]);
  }
  const entries = [...groups.values()]
    .map((group) => {
      const first = group[0]!;
      const known = group.flatMap((item) => (item.days === null ? [] : [item.days]));
      const total = delays.filter((item) => item.area === first.area && item.days !== null).length;
      const share = known.length && total ? round((known.length / total) * 100) : null;
      const typical = median(known);
      return {
        row: {
          area: first.area,
          reason: first.reason,
          jobs: group.length,
          share,
          medianDays: typical === null ? null : round(typical),
          measuredJobs: known.length,
          unmeasuredJobs: group.length - known.length,
          evidence: group.map((item) => item.detail).join('\n'),
        },
        text: `${first.area}: ${first.reason}, ${known.length}/${total} measured delayed jobs (${share === null ? 'share unavailable' : `${share}%`}); ${group.length - known.length} unmeasured jobs; median extra days ${typical === null ? 'unknown' : round(typical)} from ${known.length} measured jobs.`,
        sources: group.flatMap((item) => item.sources),
      };
    })
    .sort(
      (a, b) => a.row.area.localeCompare(b.row.area) || (b.row.share ?? -1) - (a.row.share ?? -1),
    );
  return makeAssessment(
    data,
    input,
    'repair_delays',
    'Documented repair waiting reasons by area',
    [
      { key: 'area', label: 'Area', valueType: 'string' },
      { key: 'reason', label: 'Waiting reason', valueType: 'string' },
      { key: 'jobs', label: 'Jobs', valueType: 'integer' },
      { key: 'share', label: 'Share', valueType: 'decimal', unit: '%' },
      {
        key: 'medianDays',
        label: 'Typical extra days (median)',
        valueType: 'decimal',
        unit: 'days',
      },
      { key: 'measuredJobs', label: 'Jobs with extra-day evidence', valueType: 'integer' },
      { key: 'unmeasuredJobs', label: 'Unmeasured jobs', valueType: 'integer' },
      { key: 'evidence', label: 'Job evidence', valueType: 'string' },
    ],
    entries,
    [
      `${censored} jobs with missing/future completion are censored, excluded from completed-job medians; planned completion is not actual completion.`,
      'Shares use only completed jobs with positive documented/measured extra time, within each area. Unmeasured jobs are a separate coverage row with no share or median and do not establish a delay. Unknown/not attributable means measured extra time without a defensible reason. Jobs with measured zero extra time are excluded.',
      'Prefer explicit report extra-day statements; otherwise subtract job calendar interval from an unambiguous same-well shut-in/restart episode. Job calendar duration and downtime_hours can already contain waiting; neither is hands-on repair time. Nearby notes are contextual evidence, not proven cause; multiple causes remain separate.',
    ],
  );
}

/** Recorded regional heat and weekly consistency first; adjusted comparisons are secondary. */
export function assessRegionalTemperatures(data: OperationalDataset, input: AssessmentInput = {}) {
  const through = Math.min(end(input.through ?? data.asOf), end(data.asOf));
  const from = input.from
    ? Date.parse(input.from)
    : Date.parse(new Date(through - 365 * DAY).toISOString().slice(0, 10));
  const assets = selectedAssets(data, input);
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  type Reading = {
    id: string;
    at: number;
    region: string;
    parentRegion: string;
    type: string;
    week: number;
    well: string;
    delta: number;
    ambient: number;
    head: number;
    source: Source;
  };
  const readings: Reading[] = [];
  for (const record of correctedReadings(data, data.inspections, through)) {
    const asset = assetMap.get(text(record, 'asset_id'));
    if (
      !asset ||
      date(record, 'inspected_at') < from ||
      record.raw.ambient_temp_c == null ||
      record.raw.wellhead_temp_c == null
    )
      continue;
    const ambient = Number(record.raw.ambient_temp_c);
    const head = Number(record.raw.wellhead_temp_c);
    if (!Number.isFinite(ambient) || !Number.isFinite(head)) continue;
    const history = Array.isArray(asset.raw.type_history)
      ? (asset.raw.type_history as Record<string, unknown>[])
      : [];
    const at = date(record, 'inspected_at');
    const historical = history.find(
      (item) => Date.parse(String(item.from)) <= at && (!item.to || end(String(item.to)) >= at),
    );
    const type = historical ? String(historical.well_type) : text(asset, 'well_type');
    const area = data.areas.find((item) => item.id === text(asset, 'area_id'));
    const parentRegion =
      (area && text(area, 'region')) || areaName(data, asset).replace(/\s+Block\s+.*$/i, '');
    const region = areaName(data, asset); // Compare named field blocks before aggregating their broader parent regions.
    readings.push({
      id: record.id,
      at,
      region,
      parentRegion,
      type,
      well: asset.id,
      week: Math.floor(at / (7 * DAY)),
      delta: head - ambient,
      ambient,
      head,
      source: record.source,
    });
  }
  const regions = [...new Set(readings.map((reading) => reading.region))].sort();
  const strata = new Map<string, Reading[]>();
  for (const reading of readings) {
    const key = `${reading.week}|${reading.type}`;
    strata.set(key, [...(strata.get(key) ?? []), reading]);
  }
  const matched = [...strata.values()].filter((group) =>
    regions.every((region) => group.some((reading) => reading.region === region)),
  );
  const cellMean = (group: Reading[], region: string) => {
    const wells = new Map<string, number[]>();
    for (const item of group.filter((reading) => reading.region === region))
      wells.set(item.well, [...(wells.get(item.well) ?? []), item.delta]);
    return mean([...wells.values()].map(mean));
  };
  const matchedMeans = new Map(
    regions.map((region) => [region, matched.map((group) => cellMean(group, region))]),
  );
  // Match SQL date_trunc('week', inspected_at AT TIME ZONE 'UTC'): Monday-based weeks.
  const rawWeeks = new Map<number, Map<string, number[]>>();
  for (const row of readings) {
    const at = row.at;
    const week = Math.floor((at - 4 * DAY) / (7 * DAY));
    const group = rawWeeks.get(week) ?? new Map<string, number[]>();
    group.set(row.region, [...(group.get(row.region) ?? []), row.head]);
    rawWeeks.set(week, group);
  }
  const comparableWeeks = [...rawWeeks.values()].filter((week) =>
    regions.every((region) => week.has(region)),
  );

  const entries = regions
    .map((region) => {
      const rows = readings.filter((reading) => reading.region === region);
      // Keep the complete scan for calculations, but bound inline evidence hydration.
      const rowIds = new Set(rows.map((row) => row.id));
      const wellIds = new Set(rows.map((row) => row.well));
      const regionalAssets = assets.filter((asset) => wellIds.has(asset.id));
      const corrections = data.notes.filter(
        (note) =>
          text(note, 'note_type') === 'data_correction' &&
          date(note, 'created_at') <= through &&
          rowIds.has(text(note, 'inspection_id')),
      );
      const manuals = data.documents.filter(
        (doc) =>
          /well-types\/|OM-T\d/.test(doc.source.path + doc.markdown.slice(0, 400)) &&
          rows.some(
            (row) => doc.source.path.includes(row.type) || doc.markdown.includes(`OM-${row.type}`),
          ),
      );
      const regionalAreas = data.areas.filter((area) =>
        regionalAssets.some((asset) => text(asset, 'area_id') === area.id),
      );
      const allSources = [
        ...new Map(
          [
            ...rows.map((row) => row.source),
            ...regionalAssets.map((asset) => asset.source),
            ...corrections.map((note) => note.source),
            ...manuals.map((doc) => doc.source),
            ...regionalAreas.map((area) => area.source),
          ].map((source) => [source.id, source]),
        ).values(),
      ].sort((a, b) => a.id.localeCompare(b.id));
      const sourceManifestSha256 = createHash('sha256')
        .update(
          JSON.stringify(
            allSources.map((source) => ({
              id: source.id,
              sourceId: source.sourceId,
              path: source.path,
              locator: source.locator,
            })),
          ),
        )
        .digest('hex');
      const sampleCount = Math.min(24, rows.length);
      const sample = Array.from(
        { length: sampleCount },
        (_, index) =>
          rows[
            sampleCount === 1 ? 0 : Math.round((index * (rows.length - 1)) / (sampleCount - 1))
          ]!,
      );
      const sampleIds = new Set(sample.map((row) => row.id));
      const sampleWells = new Set(sample.map((row) => row.well));
      const supportingSources = [
        ...new Map(
          [
            ...sample.map((row) => row.source),
            ...manuals.map((doc) => doc.source),
            ...regionalAreas.map((area) => area.source),
            ...corrections
              .filter((note) => sampleIds.has(text(note, 'inspection_id')))
              .map((note) => note.source),
            ...regionalAssets
              .filter((asset) => sampleWells.has(asset.id))
              .map((asset) => asset.source),
          ].map((source) => [source.id, source]),
        ).values(),
      ].slice(0, 80);
      const hottestWeeks = comparableWeeks.filter((week) =>
        regions.every((other) => mean(week.get(region)!) >= mean(week.get(other)!)),
      ).length;
      const standardized = matchedMeans.get(region)!;
      const wins = standardized.filter((value, i) =>
        regions.every((other) => value >= matchedMeans.get(other)![i]!),
      ).length;
      const types = [...new Set(rows.map((row) => row.type))]
        .sort()
        .map(
          (type) =>
            `${type}: ${new Set(rows.filter((row) => row.type === type).map((row) => row.well)).size} wells`,
        )
        .join('; ');
      return {
        row: {
          area: region,
          region: rows[0]?.parentRegion ?? 'Unknown region',
          wells: new Set(rows.map((row) => row.well)).size,
          readings: rows.length,
          typeMix: types,
          meanWellheadC: round(mean(rows.map((row) => row.head))),
          observedWeeks: comparableWeeks.length,
          hottestWeeks,
          hottestWeekShare: comparableWeeks.length
            ? round((100 * hottestWeeks) / comparableWeeks.length)
            : null,
          meanAmbientC: round(mean(rows.map((row) => row.ambient))),
          meanDeltaC: round(mean(rows.map((row) => row.delta))),
          adjustedDeltaC: standardized.length ? round(mean(standardized)) : null,
          sourceCount: allSources.length,
          attachedSources: supportingSources.length,
          sourceManifestSha256,
          matchedStrata: matched.length,
          hottestShare: standardized.length ? round((wins / standardized.length) * 100) : null,
        },
        text: `${region}: recorded wellhead mean ${round(mean(rows.map((row) => row.head)))} °C; hottest regional weekly mean in ${hottestWeeks}/${comparableWeeks.length} comparable observed UTC weeks (ties included). Secondary matched week/type adjusted delta ${standardized.length ? round(mean(standardized)) : 'unavailable'} °C; hottest (ties included) in ${wins}/${matched.length} matched strata. Raw wellhead mean ${round(mean(rows.map((row) => row.head)))} °C, ambient ${round(mean(rows.map((row) => row.ambient)))} °C. Mix: ${types}. Full source manifest: ${allSources.length} sources, SHA-256 ${sourceManifestSha256}; ${supportingSources.length} representative sources attached.`,
        sources: supportingSources,
      };
    })
    .sort(
      (a, b) => b.row.meanWellheadC - a.row.meanWellheadC || a.row.area.localeCompare(b.row.area),
    );
  const result = makeAssessment(
    data,
    input,
    'regional_temperatures',
    'Recorded field-block temperatures and weekly consistency',
    [
      { key: 'area', label: 'Field area / block', valueType: 'string' },
      { key: 'region', label: 'Broader region', valueType: 'string' },
      { key: 'wells', label: 'Wells', valueType: 'integer' },
      { key: 'readings', label: 'Readings', valueType: 'integer' },
      { key: 'typeMix', label: 'Well-type mix', valueType: 'string' },
      { key: 'meanWellheadC', label: 'Raw wellhead mean', valueType: 'decimal', unit: '°C' },
      { key: 'observedWeeks', label: 'Comparable observed weeks', valueType: 'integer' },
      { key: 'hottestWeeks', label: 'Weeks with hottest recorded mean', valueType: 'integer' },
      { key: 'hottestWeekShare', label: 'Share of weeks hottest', valueType: 'decimal', unit: '%' },
      { key: 'meanAmbientC', label: 'Ambient mean', valueType: 'decimal', unit: '°C' },
      { key: 'meanDeltaC', label: 'Raw mean delta', valueType: 'decimal', unit: '°C' },
      {
        key: 'adjustedDeltaC',
        label: 'Matched week/type mean delta',
        valueType: 'decimal',
        unit: '°C',
      },
      { key: 'matchedStrata', label: 'Matched week/type strata', valueType: 'integer' },
      {
        key: 'hottestShare',
        label: 'Share of matched strata hottest',
        valueType: 'decimal',
        unit: '%',
      },
      { key: 'sourceCount', label: 'Full supporting source count', valueType: 'integer' },
      { key: 'attachedSources', label: 'Representative sources attached', valueType: 'integer' },
      { key: 'sourceManifestSha256', label: 'Full source manifest SHA-256', valueType: 'string' },
    ],
    entries,
    [
      `Period ${new Date(from).toISOString()} through ${new Date(through).toISOString()}. Primary comparison uses named field areas/blocks, retaining their broader region separately. Never substitute a parent-region aggregate for a specific hottest block.`,
      'Attached evidence is representative: up to 24 chronologically evenly spaced inspection readings per region, plus sampled-well metadata, applicable manuals, area metadata and correction notes, capped at 80 sources per region. All eligible readings drive the aggregates. Full source manifests are hashed as JSON arrays of id/sourceId/path/locator sorted by source ID; this hashes source identity, not document contents.',
      'Primary comparison is at field-area/block level, not a broad regional rollup. Recorded wellhead mean over all eligible inspections. Weekly consistency compares inspection-weighted regional means in Monday-based UTC weeks observed in every region, including partial boundary weeks; ties count for every tied region. Different well-type and operating mixes can affect these recorded averages; this is not a causal explanation. Adjusted temperature difference is a secondary measure, not a substitute for recorded temperature.',
      'Delta = wellhead minus ambient. Comparison gives equal weight to matched UTC week/well-type strata present in every region, averaging within well first. This controls calendar and observed type mix; raw means are descriptive and retain different observation counts.',
      'Differences can still reflect producing/shut-in mix, well age, measurement method and reservoir conditions. This is descriptive evidence, not a causal geography effect or formal significance test. No common strata means no adjusted comparison; sparse overlap weakens consistency claims.',
    ],
  );
  const parentRollups = [...new Set(readings.map((row) => row.parentRegion))]
    .map((region) => {
      const rows = readings.filter((row) => row.parentRegion === region);
      return {
        region,
        meanWellheadC: round(mean(rows.map((row) => row.head))),
        observations: rows.length,
      };
    })
    .sort((a, b) => b.meanWellheadC - a.meanWellheadC);
  result.facts.push({
    text: `Broader regional rollup (distinct from named field blocks): ${parentRollups.map((row) => `${row.region} ${row.meanWellheadC} °C (${row.observations} inspections)`).join('; ')}. Identify the hottest field block using the area rows; a broader regional mean must not replace it.`,
    sourceIds: result.sources.map((source) => source.id),
  });
  result.executedParameters = {
    ...input,
    topic: 'regional-temperatures',
    from: new Date(from).toISOString().slice(0, 10),
    through: new Date(through).toISOString().slice(0, 10),
  };
  return result;
}
