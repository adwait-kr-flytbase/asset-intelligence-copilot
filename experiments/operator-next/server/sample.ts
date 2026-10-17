import { randomUUID, createHash } from 'node:crypto';
import {
  assetsSchema,
  operationalVisualSchema,
  parametersSchema,
  responseSchema,
  type AgentResponse,
  type Artifact,
  type Evidence,
  type ReadParameters,
  type SavedView,
} from '../src/contracts';
import {
  correctedSpills,
  loadSample,
  readRepairReport,
  sampleAvailable,
  type Inspection,
  type SampleData,
  type SampleWell,
} from './sample-data';

const today = '2026-10-17',
  asOf = '2026-10-17T00:00:00Z';
const iso = (value: string) => value.slice(0, 10);
const unique = (ids: string[]) => [...new Set(ids)];
const delta = (i: Inspection) => Number((i.wellhead_temp_c - i.ambient_temp_c).toFixed(1));
const addDays = (date: string, n: number) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d.toISOString());
};
export { sampleAvailable };
function windowFor(prompt: string, p: ReadParameters, wells: SampleWell[]) {
  const latest =
    wells
      .flatMap((w) => w.inspections.map((i) => iso(i.inspected_at)))
      .sort()
      .at(-1) || today;
  let from = p.from || '2022-10-17',
    to = p.to || today;
  const explicit = prompt.match(/\b\d{4}-\d{2}-\d{2}\b/g);
  if (explicit?.length === 2) return { from: explicit[0], to: explicit[1] };
  if (explicit?.length === 1) return { from: explicit[0], to: explicit[0] };
  const year = prompt.match(/\b(20\d{2})\b(?!-)/)?.[1];
  if (year) {
    from = year + '-01-01';
    to = year === today.slice(0, 4) ? today : year + '-12-31';
  }
  const namedDate = prompt.match(
    /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s+(20\d{2}))?\b/i,
  );
  if (namedDate) {
    const month =
      ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
        namedDate[2].slice(0, 3).toLowerCase(),
      ) + 1;
    from =
      to = `${namedDate[3] || today.slice(0, 4)}-${String(month).padStart(2, '0')}-${namedDate[1].padStart(2, '0')}`;
  }
  const relative = prompt.match(/last\s+(\d+)\s+(days?|weeks?|months?|years?)/i);
  if (relative) {
    const n = Number(relative[1]);
    if (n > 10000) throw Error('Date window too large');
    if (relative[2].startsWith('day')) from = addDays(to, -n);
    else if (relative[2].startsWith('week')) {
      to = p.to || latest;
      from = addDays(to, -7 * (n - 1));
    } else {
      const d = new Date(to + 'T00:00:00Z');
      if (relative[2].startsWith('month')) d.setUTCMonth(d.getUTCMonth() - n);
      else d.setUTCFullYear(d.getUTCFullYear() - n);
      from = iso(d.toISOString());
    }
  }
  if (/this year/i.test(prompt)) from = today.slice(0, 4) + '-01-01';
  return { from, to };
}
function select(data: SampleData, pInput: ReadParameters, prompt = '') {
  const p = parametersSchema.parse(pInput);
  const mentions = unique(
    [...prompt.matchAll(/\bWELL-(\d+)\b/gi)].map((m) => `WELL-${m[1].padStart(4, '0')}`),
  );
  if (mentions.length === 1) {
    p.wellId = mentions[0];
    delete p.wellIds;
  } else if (mentions.length > 1) {
    p.wellId = 'all';
    p.wellIds = mentions;
  }
  if (mentions.length) delete p.area;
  const area = data.areas.find(
    (a) =>
      prompt.toLowerCase().includes(a.name.toLowerCase()) ||
      new RegExp(`\\b${a.area_id}\\b`, 'i').test(prompt),
  );
  if (area) {
    p.area = area.area_id;
    if (!mentions.length) {
      p.wellId = 'all';
      delete p.wellIds;
    }
  }
  if (p.wellIds && (new Set(p.wellIds).size !== p.wellIds.length || !p.wellIds.length))
    throw Error('Invalid well subset');
  const ids = p.wellIds || (p.wellId === 'all' ? undefined : [p.wellId]);
  if (ids?.some((id) => !data.wells.some((w) => w.metadata.asset_id === id)))
    throw Error('Unknown sample well');
  if (
    p.area &&
    !data.areas.some((a) => a.area_id === p.area || a.name.toLowerCase() === p.area!.toLowerCase())
  )
    throw Error('Unknown sample area');
  const wells = data.wells.filter(
    (w) =>
      (!ids || ids.includes(w.metadata.asset_id)) &&
      (!p.area ||
        w.metadata.area_id === p.area ||
        data.areas.find((a) => a.area_id === w.metadata.area_id)?.name.toLowerCase() ===
          p.area.toLowerCase()),
  );
  if (!wells.length) throw Error('No wells in the requested scope');
  const top = prompt.match(/\b(?:top|which|highest)\s+(\d+)\b/i)?.[1];
  if (top) p.limit = Math.min(200, Number(top));
  const window = windowFor(prompt, p, wells);
  p.from = window.from;
  p.to = window.to;
  parametersSchema.parse(p);
  return { p, wells, ...window };
}
function evidence(data: SampleData) {
  const records = new Map<string, Evidence>();
  const add = (
    id: string,
    label: string,
    path: string,
    kind: Evidence['kind'],
    text: string,
    row?: string,
    inputs?: string[],
  ) => {
    records.set(id, {
      id,
      label,
      path,
      kind,
      recordId: id,
      revision: `source-${createHash('sha256').update(path).update(text).digest('hex').slice(0, 20)}`,
      excerpt: text.slice(0, 4000) || 'No matching records in this declared source scope.',
      visibility: 'shared',
      ...(row ? { locator: { row } } : {}),
      ...(inputs ? { inputSourceIds: inputs } : {}),
    });
    return id;
  };
  const manual = (well: SampleWell) =>
    add(
      `MANUAL-${well.metadata.well_type}`,
      `${well.metadata.well_type} manual · production temperature rule`,
      `fleet/well-types/${well.metadata.well_type}.md`,
      'manual',
      data.manuals.get(well.metadata.well_type)!.section,
    );
  const inspection = (well: SampleWell, i: Inspection) =>
    add(
      i.inspection_id,
      `${well.metadata.asset_id} · inspection ${iso(i.inspected_at)}`,
      `assets/${well.metadata.asset_id}/inspections.jsonl`,
      'inspection',
      JSON.stringify(i),
      i.inspection_id,
    );
  const note = (well: SampleWell, n: SampleWell['notes'][number]) =>
    add(
      n.note_id,
      `${data.users.get(n.author_user_id) || n.author_user_id} · ${iso(n.created_at)}`,
      `assets/${well.metadata.asset_id}/context.jsonl`,
      n.note_type === 'correction' ? 'correction' : 'note',
      `${n.text} Author ${data.users.get(n.author_user_id) || n.author_user_id}; applies ${n.valid_from} through ${n.valid_to || 'open ended'}.`,
      n.note_id,
    );
  const batch = (well: SampleWell, rows: Inspection[], purpose: string) => {
    const ids: string[] = [];
    for (let n = 0; n < Math.max(1, rows.length); n += 25) {
      const chunk = rows.slice(n, n + 25);
      ids.push(
        add(
          `READ-${purpose}-${well.metadata.asset_id}-${n}`,
          `${well.metadata.asset_id} · ${purpose}`,
          `assets/${well.metadata.asset_id}/inspections.jsonl`,
          'inspection',
          chunk.length
            ? chunk
                .map(
                  (i) =>
                    `${i.inspection_id} ${i.inspected_at}; ambient ${i.ambient_temp_c} °C; wellhead ${i.wellhead_temp_c} °C; delta ${delta(i)} °C; spill ${i.spill_detected ? i.spill_est_volume_bbl + ' bbl' : 'not detected'}.`,
                )
                .join('\n')
            : `No matching ${purpose} inspections in the declared date range.`,
          chunk.length
            ? `${chunk[0].inspection_id}…${chunk.at(-1)!.inspection_id}`
            : 'empty-selection',
        ),
      );
    }
    return ids;
  };
  return { records, add, manual, inspection, note, batch };
}
type EvidenceTools = ReturnType<typeof evidence>;
function wrap(
  data: SampleData,
  requestId: string,
  a: Artifact,
  e: EvidenceTools,
  warnings: string[] = [],
) {
  const required = new Set(a.sourceIds);
  for (const id of required) {
    const record = e.records.get(id);
    if (!record) throw Error('Unresolved sample evidence');
    for (const dep of record.inputSourceIds || []) required.add(dep);
  }
  const evidenceRecords = [...required].map((id) => e.records.get(id)!);
  const dataRevision = `${data.revision}-${createHash('sha256')
    .update(
      evidenceRecords
        .map((record) => record.revision)
        .sort()
        .join('|'),
    )
    .digest('hex')
    .slice(0, 12)}`;
  return operationalVisualSchema.parse({
    kind: 'artifact',
    schemaVersion: 1,
    runId: requestId,
    resultId: randomUUID(),
    artifactRevision: 1,
    phase: 'ready',
    readOnly: true,
    artifact: { ...a, id: `${a.id}-${randomUUID()}` },
    meta: {
      asOf,
      evaluatedAt: new Date().toISOString(),
      dataRevision,
      timeZone: 'UTC',
      completeness: 'partial',
      warnings: [
        'Local challenge sample data; fictional operational documents, not actual operating or legal advice.',
        ...warnings,
      ],
    },
    evidence: evidenceRecords,
  });
}
function scope(wells: SampleWell[], from: string, to: string, label: string) {
  return { wellIds: wells.map((w) => w.metadata.asset_id), from, to, label };
}
function result(
  requestId: string,
  p: ReadParameters,
  answer: string,
  visuals: AgentResponse['visuals'],
  intent: AgentResponse['intent'],
  extra: Partial<AgentResponse> = {},
): AgentResponse {
  return responseSchema.parse({
    schemaVersion: 1,
    requestId,
    answer,
    visuals,
    intent,
    mode: 'sample',
    parameters: p,
    ...extra,
  });
}
function contextualReason(data: SampleData, well: SampleWell, e: EvidenceTools) {
  const latest = well.inspections.at(-1)!;
  const active = well.notes.filter(
    (n) =>
      n.note_type !== 'correction' &&
      n.valid_from <= iso(latest.inspected_at) &&
      (!n.valid_to || n.valid_to >= iso(latest.inspected_at)) &&
      /shut|stop|down|workover|replacement/i.test(n.text),
  );
  const open = well.maintenance.filter(
    (m) => m.started_at <= latest.inspected_at && m.completed_at > asOf,
  );
  const sourceIds = active.map((n) => e.note(well, n));
  const explanations = active.map(
    (n) => `${data.users.get(n.author_user_id) || n.author_user_id}: ${n.text}`,
  );
  for (const m of open) {
    sourceIds.push(
      e.add(
        m.maintenance_id,
        `${well.metadata.asset_id} · open repair`,
        `assets/${well.metadata.asset_id}/maintenance.jsonl`,
        'maintenance',
        JSON.stringify(m),
        m.maintenance_id,
      ),
    );
    explanations.push(`Open repair ${m.maintenance_id}: ${m.issue}; started ${iso(m.started_at)}.`);
  }
  return {
    text:
      explanations.join(' ') ||
      `No recorded reason.${latest.notes ? ` Inspector note: ${latest.notes}` : ' Check the well before inferring a cause.'}`,
    sourceIds,
  };
}
export async function sampleAssets() {
  const data = await loadSample();
  return assetsSchema.parse(
    data.wells.map((w) => {
      const i = w.inspections.at(-1)!;
      return {
        id: w.metadata.asset_id,
        label: w.metadata.name || w.metadata.asset_id,
        area: data.areas.find((a) => a.area_id === w.metadata.area_id)!.name,
        type: w.metadata.well_type,
        status:
          delta(i) >= data.manuals.get(w.metadata.well_type)!.threshold
            ? 'producing'
            : 'below-threshold',
        spillBbl: correctedSpills(w)
          .filter((s) => !s.suppressed)
          .reduce((n, s) => n + (s.inspection.spill_est_volume_bbl || 0), 0),
        lat: w.metadata.location.lat,
        lon: w.metadata.location.lon,
      };
    }),
  );
}
export async function sampleAnswer(
  requestId: string,
  prompt: string,
  input: ReadParameters,
  savedView?: SavedView,
): Promise<AgentResponse> {
  const response = await executeSample(requestId, prompt, input, savedView);
  const presentation =
    savedView?.presentation ||
    (/\btable\b/i.test(prompt) ? 'table' : /\bcard\b/i.test(prompt) ? 'card' : undefined);
  return responseSchema.parse({ ...response, ...(presentation ? { presentation } : {}) });
}
async function executeSample(
  requestId: string,
  prompt: string,
  input: ReadParameters,
  savedView?: SavedView,
): Promise<AgentResponse> {
  const data = await loadSample();
  const selected = select(data, input, prompt);
  const { p, from, to } = selected;
  p.dataset = 'sample';
  if (savedView?.kind === 'ranking') {
    const boundMetric = savedView.parameters.metric || 'downtime';
    if (p.metric && p.metric !== boundMetric) throw Error('A saved read cannot change metric');
    p.metric = boundMetric;
  }
  let wells = selected.wells;
  const e = evidence(data);
  const inWindow = (i: Inspection) => iso(i.inspected_at) >= from && iso(i.inspected_at) <= to;
  const hasSpill = /spill|release|contain/i.test(prompt) || (!prompt && p.spillOnly === true);
  const unsupported =
    /\b(remember|yesterday|correct this|remeasured|re-measured|apply|submit|approve|write|assign|delete|for everyone|our team now|new rule|record this|reading is wrong|field crew (?:re-)?measured|handheld thermal gun|note for all|forecast|predict|production rate|barrels per day)\b/i.test(
      prompt,
    );
  if (unsupported)
    return result(
      requestId,
      p,
      'This sample-data adapter is read-only. It does not implement shared writes, correction submission, authenticated private memory, new policy overrides, or forecasts. Original sample records remain unchanged.',
      [],
      null,
    );
  if (
    !savedView &&
    (/\b(manual|sop|protocol|document|report|repair report)\b/i.test(prompt) ||
      /\b(?:SR|RC)-\d{2}\b/i.test(prompt)) &&
    !/rules.*broken|breach|compliance|contain|overdue/i.test(prompt)
  )
    return sampleDocuments(data, requestId, p, wells, prompt, e);
  let kind = savedView?.kind;
  if (!kind) {
    if (/disagree|conflict|claims?|real oil|notes about/i.test(prompt)) kind = 'claims';
    else if (/\bmap\b|\blocations?\b|\bcard\b/i.test(prompt)) kind = 'geo';
    else if (/heatmap|matrix|area.*month|month.*area/i.test(prompt)) kind = 'matrix';
    else if (
      /temperature|wellhead.*air|thermal|line chart|trend/i.test(prompt) &&
      !/right now|latest|why/i.test(prompt)
    )
      kind = 'series';
    else if (hasSpill && /bar chart|rank|compar/i.test(prompt)) {
      kind = 'ranking';
      p.metric = 'spill-volume';
    } else if (
      /downtime|days.*down|down.*days|repairs?.*cost|repair expenses|spend/i.test(prompt)
    ) {
      kind = 'ranking';
      p.metric = /cost|expenses|spend/i.test(prompt) ? 'repair-cost' : 'downtime';
    } else if (
      /rules.*broken|breach|compliance|contain.*(?:limit|hours)|not contained|overdue|obligations/i.test(
        prompt,
      )
    )
      kind = 'obligations';
    else if (hasSpill && !/map|where|location/i.test(prompt)) kind = 'timeline';
    else if (/map|where|locations?|wells|overview/i.test(prompt)) kind = 'geo';
  }
  const presentation =
    savedView?.presentation ||
    (/\btable\b/i.test(prompt) ? 'table' : /\bcard\b/i.test(prompt) ? 'card' : undefined);
  if (!kind && !/producing|status|latest|inspection|why|explain|well-/i.test(prompt))
    return result(
      requestId,
      p,
      'No supported sample-data read was identified. Ask about a well, area, temperature trend, downtime, spills, recorded repair costs, document, or bounded SOP evaluation.',
      [],
      null,
    );
  if (kind === 'ranking') {
    const cost = p.metric === 'repair-cost' || /cost|expense|spend/i.test(prompt);
    const spill = p.metric === 'spill-volume';
    const unit = cost ? 'USD' : spill ? 'bbl' : 'days';
    const label = cost
      ? 'Recorded repair costs'
      : spill
        ? 'Recorded spill volume'
        : 'Inspection-derived downtime';
    p.metric = cost ? 'repair-cost' : spill ? 'spill-volume' : 'downtime';
    const items = wells
      .map((w) => {
        const rows = w.inspections.filter(inWindow);
        const down = rows.filter(
          (i) => delta(i) < data.manuals.get(w.metadata.well_type)!.threshold,
        );
        const repairs = w.maintenance.filter(
          (m) => iso(m.started_at) >= from && iso(m.started_at) <= to,
        );
        const spillRows = correctedSpills(w).filter((s) => inWindow(s.inspection));
        const inputs = spill
          ? unique([
              ...e.batch(
                w,
                spillRows.map((s) => s.inspection),
                'spill-detections',
              ),
              ...spillRows.flatMap((s) => s.corrections.map((n) => e.note(w, n))),
            ])
          : cost
            ? [
                e.add(
                  `LEDGER-${w.metadata.asset_id}`,
                  `${w.metadata.asset_id} · repair ledger`,
                  `assets/${w.metadata.asset_id}/maintenance.jsonl`,
                  'maintenance',
                  repairs
                    .map(
                      (m) => `${m.maintenance_id} started ${m.started_at}; USD ${m.cost_usd.total}`,
                    )
                    .join('\n') || 'No repairs started in this window.',
                  `${from}…${to}`,
                ),
              ]
            : [...e.batch(w, down, 'below-threshold'), e.manual(w)];
        const value = spill
          ? Number(
              spillRows
                .filter((s) => !s.suppressed)
                .reduce((n, s) => n + (s.inspection.spill_est_volume_bbl || 0), 0)
                .toFixed(1),
            )
          : cost
            ? repairs.reduce((n, m) => n + m.cost_usd.total, 0)
            : down.length * 7;
        const calc = e.add(
          `CALC-${p.metric}-${w.metadata.asset_id}`,
          `${w.metadata.asset_id} · ${p.metric}`,
          `assets/${w.metadata.asset_id}/${cost ? 'maintenance' : 'inspections'}.jsonl`,
          'calculation',
          spill
            ? `Sum retained inspection spill_est_volume_bbl after formal false-positive corrections for ${from} through ${to}: ${value} bbl.`
            : cost
              ? `Sum cost_usd.total for repair started_at dates ${from} through ${to}: USD ${value}.`
              : `Dataset Guide method: ${down.length} observed weekly inspections below ${data.manuals.get(w.metadata.well_type)!.threshold} °C above ambient × 7 days = ${value} days, ${from} through ${to}. Missing inspections add no downtime; maintenance.downtime_hours is not used.`,
          `${from}…${to}`,
          inputs,
        );
        return { id: w.metadata.asset_id, label: w.metadata.asset_id, value, sourceIds: [calc] };
      })
      .sort((a, b) => b.value - a.value || b.id.localeCompare(a.id))
      .slice(0, p.limit || 200);
    const shown = wells.filter((w) => items.some((i) => i.id === w.metadata.asset_id));
    const a: Artifact = {
      kind: 'ranking',
      id: 'sample-ranking',
      title: label,
      scope: scope(
        shown,
        from,
        to,
        'Selected record window; repairs belong by start date; downtime from weekly thermal differences',
      ),
      unit,
      metricLabel: cost
        ? 'Recorded repair cost'
        : spill
          ? 'Recorded spill volume'
          : 'Estimated downtime',
      sourceIds: unique(items.flatMap((i) => i.sourceIds)),
      items,
    };
    const answer = `${label}, ${from} through ${to}: ${items.map((i) => `${i.label}: ${i.value.toLocaleString('en-US')} ${unit}`).join('; ')}.${!cost && !spill ? ' Each observed below-threshold weekly inspection contributes 7 days; missed inspections contribute none.' : ''}`;
    if (items.length === 1 && !cost && !spill && !/chart|bar|table/i.test(prompt))
      return result(requestId, p, answer, [], null, {
        citations: {
          schemaVersion: 1,
          runId: requestId,
          evidence: [...e.records.values()].filter(
            (record) =>
              a.sourceIds.includes(record.id) ||
              [...e.records.values()].some(
                (c) => a.sourceIds.includes(c.id) && c.inputSourceIds?.includes(record.id),
              ),
          ),
          claims: [{ id: 'downtime', text: answer, sourceIds: a.sourceIds }],
        },
      });
    return result(
      requestId,
      p,
      answer,
      [wrap(data, requestId, a, e)],
      'ranking',
      presentation ? { presentation } : {},
    );
  }
  if (kind === 'series') {
    if (wells.length > 8)
      return result(
        requestId,
        p,
        'Select up to 8 sample wells for comparable temperature charts. All requested wells remain available in the asset directory; no wells were silently dropped.',
        [],
        null,
      );
    const visuals = wells.map((w) => {
      const rows = w.inspections.filter(inWindow),
        threshold = data.manuals.get(w.metadata.well_type)!.threshold;
      const expected: string[] = [];
      for (
        let date = iso(w.inspections[0].inspected_at);
        date <= to && date <= iso(w.inspections.at(-1)!.inspected_at);
        date = addDays(date, 7)
      )
        if (date >= from) expected.push(date);
      const observed = new Map(rows.map((i) => [iso(i.inspected_at), i]));
      const chartDates = unique([...expected, ...rows.map((i) => iso(i.inspected_at))]).sort();
      const missing = chartDates.filter((date) => !observed.has(date)).length;
      return wrap(
        data,
        requestId,
        {
          kind: 'series',
          id: `sample-temperature-${w.metadata.asset_id}`,
          title: `${w.metadata.asset_id} · wellhead and air`,
          scope: scope(
            [w],
            from,
            to,
            'Raw inspection temperatures; event markers identify non-producing readings',
          ),
          sourceIds: [...e.batch(w, rows, 'temperatures'), e.manual(w)],
          unit: '°C',
          series: [
            {
              id: `${w.metadata.asset_id}-wellhead`,
              label: 'Wellhead',
              points: chartDates.map((date) => ({
                date,
                value: observed.get(date)?.wellhead_temp_c ?? null,
              })),
            },
            {
              id: `${w.metadata.asset_id}-ambient`,
              label: 'Air',
              points: chartDates.map((date) => ({
                date,
                value: observed.get(date)?.ambient_temp_c ?? null,
              })),
            },
          ],
          events: rows
            .filter((i) => delta(i) < threshold)
            .map((i) => ({
              id: `down-${i.inspection_id}`,
              date: iso(i.inspected_at),
              label: `Not producing · Δ ${delta(i)} °C < ${threshold} °C`,
              sourceIds: [e.manual(w), ...e.batch(w, rows, 'temperatures')],
            })),
        },
        e,
        missing
          ? [
              `${missing} expected weekly observations are missing and shown as gaps; they add no downtime.`,
            ]
          : [],
      );
    });
    // Include event source IDs in the complete artifact evidence set.
    return result(
      requestId,
      p,
      `${wells
        .map((w) => {
          const rows = w.inspections.filter(inWindow);
          return `${w.metadata.asset_id}: ${rows.length} readings; not producing on ${
            rows
              .filter((i) => delta(i) < data.manuals.get(w.metadata.well_type)!.threshold)
              .map((i) => iso(i.inspected_at))
              .join(', ') || 'none of the observed dates'
          }`;
        })
        .join(
          '. ',
        )}. Temperatures are °C from inspection records, compared using each well-type manual.`,
      visuals,
      'series',
    );
  }
  if (kind === 'matrix') {
    const areas = data.areas.filter((area) =>
      wells.some((w) => w.metadata.area_id === area.area_id),
    );
    const months: string[] = [];
    for (let d = from.slice(0, 7); d <= to.slice(0, 7); ) {
      months.push(d);
      const date = new Date(d + '-01T00:00:00Z');
      date.setUTCMonth(date.getUTCMonth() + 1);
      d = date.toISOString().slice(0, 7);
      if (months.length > 100) throw Error('Use a window of 100 months or fewer');
    }
    const cells = areas.flatMap((area) =>
      months.map((month) => {
        const areaWells = wells.filter((w) => w.metadata.area_id === area.area_id);
        const matches = areaWells.flatMap((w) =>
          correctedSpills(w)
            .filter(
              (s) => inWindow(s.inspection) && iso(s.inspection.inspected_at).startsWith(month),
            )
            .map((s) => ({ w, ...s })),
        );
        const count = matches.filter((s) => !s.suppressed).length;
        const id = e.add(
          `COUNT-${area.area_id}-${month}`,
          `${area.name} · ${month} spill count`,
          'fleet/areas.json',
          'calculation',
          `Scope ${areaWells.length} wells (${areaWells.map((w) => w.metadata.asset_id).join(', ')}); ${from} through ${to}. ${
            matches
              .filter((s) => !s.suppressed)
              .map((s) => s.inspection.inspection_id)
              .join(', ') || 'No retained oil-spill detections'
          }. ${matches
            .filter((s) => s.suppressed)
            .map(
              (s) =>
                `${s.inspection.inspection_id} excluded by ${s.corrections.map((c) => c.note_id).join(', ')}`,
            )
            .join(
              '; ',
            )}. Result ${count} recorded spill events; correction notes are applied only to their named inspection.`,
          `${area.area_id}/${month}`,
          matches.flatMap((s) => [
            e.inspection(s.w, s.inspection),
            ...s.corrections.map((c) => e.note(s.w, c)),
          ]),
        );
        return { rowId: area.area_id, columnId: month, value: count, sourceIds: [id] };
      }),
    );
    const a: Artifact = {
      kind: 'matrix',
      id: 'sample-spills-area-month',
      title: 'Corrected spill counts by area and month',
      scope: scope(
        wells,
        from,
        to,
        'Spill event counts after explicit false-positive corrections; zero means no retained detection in these records',
      ),
      sourceIds: cells.flatMap((c) => c.sourceIds),
      unit: 'events',
      rows: areas.map((a) => ({ id: a.area_id, label: a.name })),
      columns: months.map((month) => ({
        id: month,
        label: new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(
          new Date(month + '-01T00:00:00Z'),
        ),
      })),
      cells,
    };
    return result(
      requestId,
      p,
      `${cells.reduce((n, c) => n + (c.value || 0), 0)} retained spill events, ${from} through ${to}. ${areas.map((area) => `${area.name}: ${cells.filter((c) => c.rowId === area.area_id).reduce((n, c) => n + (c.value || 0), 0)}`).join('; ')}. Formal false-positive corrections are removed; ordinary conflicting notes do not erase a detection.`,
      [wrap(data, requestId, a, e)],
      'matrix',
    );
  }
  if (kind === 'obligations')
    return sampleCompliance(data, requestId, p, wells, from, to, prompt, e);
  if (kind === 'timeline') {
    const events = wells.flatMap((w) =>
      correctedSpills(w)
        .filter((s) => inWindow(s.inspection))
        .map((s) => ({ w, ...s })),
    );
    const retained = events.filter((s) => !s.suppressed);
    const items = retained
      .map((s) => ({
        id: s.inspection.inspection_id,
        at: iso(s.inspection.inspected_at),
        title: `${s.w.metadata.asset_id} · ${s.inspection.spill_est_volume_bbl} bbl spill`,
        description: `Inspection ${s.inspection.inspection_id}. ${s.inspection.notes}`,
        category: 'spill' as const,
        sourceIds: [e.inspection(s.w, s.inspection)],
      }))
      .sort((a, b) => a.at.localeCompare(b.at));
    const suppressionSources = events
      .filter((s) => s.suppressed)
      .flatMap((s) => [
        e.inspection(s.w, s.inspection),
        ...s.corrections.map((c) => e.note(s.w, c)),
      ]);
    const sourceIds = unique([...items.flatMap((i) => i.sourceIds), ...suppressionSources]);
    if (!sourceIds.length)
      sourceIds.push(
        e.add(
          'EMPTY-SPILL-READ',
          'No spill detections in selected scope',
          'fleet/areas.json',
          'calculation',
          `Scanned ${wells.map((w) => w.metadata.asset_id).join(', ')} inspections from ${from} through ${to}; no detections.`,
        ),
      );
    const a: Artifact = {
      kind: 'timeline',
      id: 'sample-spill-list',
      title: 'Retained oil spill records',
      scope: scope(
        wells,
        from,
        to,
        'Inspection detections with formal false-positive corrections removed',
      ),
      sourceIds,
      items,
    };
    return result(
      requestId,
      p,
      `${retained.length} spills totaling ${Number(retained.reduce((n, s) => n + (s.inspection.spill_est_volume_bbl || 0), 0).toFixed(1))} bbl, ${from} through ${to}. ${events.length} detections were reviewed; ${events.filter((s) => s.suppressed).length} formal false positives excluded.${events
        .filter((s) => s.suppressed)
        .map(
          (s) =>
            ` ${s.inspection.inspection_id} removed by ${s.corrections.map((c) => c.note_id).join(', ')}.`,
        )
        .join('')}`,
      [wrap(data, requestId, a, e)],
      'timeline',
      presentation ? { presentation } : {},
    );
  }
  if (kind === 'claims') return sampleClaims(data, requestId, p, wells, from, to, e);
  if (kind === 'geo') {
    delete p.metric;
    p.spillOnly = hasSpill;
    const onlyDown =
      /not producing|non.produc|need attention|below.threshold/i.test(prompt) ||
      (!prompt && p.status === 'below-threshold');
    p.status = onlyDown ? 'below-threshold' : 'all';
    if (onlyDown)
      wells = wells.filter(
        (w) => delta(w.inspections.at(-1)!) < data.manuals.get(w.metadata.well_type)!.threshold,
      );
    const points = wells.flatMap((w) => {
      const latest = w.inspections.at(-1)!,
        threshold = data.manuals.get(w.metadata.well_type)!.threshold;
      const reason = contextualReason(data, w, e);
      const base = [e.inspection(w, latest), e.manual(w), ...reason.sourceIds];
      const location = e.add(
        `LOCATION-${w.metadata.asset_id}`,
        `${w.metadata.asset_id} · location`,
        `assets/${w.metadata.asset_id}/metadata.json`,
        'note',
        JSON.stringify(w.metadata),
        'location',
      );
      const spills = correctedSpills(w).filter((s) => !s.suppressed && inWindow(s.inspection));
      const point = (
        id: string,
        volumeBbl: number,
        eventDate: string | null,
        sourceIds: string[],
      ) => ({
        id,
        wellId: w.metadata.asset_id,
        label: w.metadata.asset_id,
        lat: w.metadata.location.lat,
        lon: w.metadata.location.lon,
        status: delta(latest) >= threshold ? ('producing' as const) : ('below-threshold' as const),
        volumeBbl,
        eventDate,
        temperatureDeltaC: delta(latest),
        temperatureThresholdC: threshold,
        reason: reason.text.slice(0, 1000),
        recordedStatus: w.metadata.recorded_status,
        inspectedAt: latest.inspected_at,
        inspector: data.users.get(latest.inspector_user_id) || latest.inspector_user_id,
        wellType: w.metadata.well_type,
        sourceIds: unique([...base, location, ...sourceIds]),
      });
      return hasSpill
        ? spills.map((s) =>
            point(
              s.inspection.inspection_id,
              s.inspection.spill_est_volume_bbl || 0,
              iso(s.inspection.inspected_at),
              [e.inspection(w, s.inspection)],
            ),
          )
        : [
            point(
              w.metadata.asset_id,
              latest.spill_detected ? latest.spill_est_volume_bbl || 0 : 0,
              latest.spill_detected ? iso(latest.inspected_at) : null,
              [],
            ),
          ];
    });
    const reasons = onlyDown
      ? wells.map((w) => {
          const r = contextualReason(data, w, e);
          return `${w.metadata.asset_id}: Δ ${delta(w.inspections.at(-1)!)} °C; recorded status ${w.metadata.recorded_status}. ${r.text}`;
        })
      : [];
    const sourceIds = unique([...points.flatMap((point) => point.sourceIds), ...e.records.keys()]);
    if (!sourceIds.length)
      sourceIds.push(
        e.add(
          'EMPTY-GEO-READ',
          'Empty selected result',
          'fleet/areas.json',
          'calculation',
          `No ${hasSpill ? 'retained spills' : 'below-threshold wells'} in requested scope from ${from} through ${to}.`,
        ),
      );
    const actualWells = wells.length ? wells : selected.wells;
    const latestDate =
      actualWells
        .map((w) => iso(w.inspections.at(-1)!.inspected_at))
        .sort()
        .at(-1) || to;
    const a: Artifact = {
      kind: 'geo',
      id: 'sample-map',
      title: hasSpill
        ? 'Recorded real-oil spills'
        : onlyDown
          ? 'Wells below their type production threshold'
          : 'Sample well locations and thermal status',
      scope: scope(
        actualWells,
        from,
        latestDate > to ? latestDate : to,
        'Locations from metadata; latest thermal status is independent of spill date window',
      ),
      sourceIds,
      points,
    };
    return result(
      requestId,
      p,
      `${unique(points.map((pt) => pt.wellId)).length} wells${hasSpill ? ` with ${points.length} retained spill events, ${from} through ${to}` : `; ${points.filter((pt) => pt.status === 'below-threshold').length} below the manual threshold at latest inspection`}.${reasons.length ? ' ' + reasons.join('\n') : ' Displayed production class is derived from temperature difference, not the monthly register.'}`,
      [wrap(data, requestId, a, e)],
      'geo',
      presentation ? { presentation } : {},
    );
  }
  const claims = wells.slice(0, 20).map((w) => {
    const latest = w.inspections.at(-1)!,
      threshold = data.manuals.get(w.metadata.well_type)!.threshold;
    const reason = contextualReason(data, w, e);
    const text = `${w.metadata.asset_id}: ${delta(latest) >= threshold ? 'producing' : 'not producing'} at latest inspection ${latest.inspection_id}, ${latest.inspected_at}, ${latest.method}, ${data.users.get(latest.inspector_user_id) || latest.inspector_user_id}. Wellhead ${latest.wellhead_temp_c} °C minus air ${latest.ambient_temp_c} °C = ${delta(latest)} °C; ${w.metadata.well_type} threshold ${threshold} °C. Recorded status ${w.metadata.recorded_status}${(w.metadata.recorded_status === 'active') !== (delta(latest) >= threshold) ? ' conflicts with measured classification' : ''}. ${reason.text}`;
    return {
      id: `status-${w.metadata.asset_id}`,
      text,
      sourceIds: [e.inspection(w, latest), e.manual(w), ...reason.sourceIds],
    };
  });
  return result(
    requestId,
    p,
    claims.map((c) => c.text).join('\n') +
      (wells.length > 20 ? ' Select at most 20 wells for individual explanations.' : ''),
    [],
    null,
    {
      citations: { schemaVersion: 1, runId: requestId, evidence: [...e.records.values()], claims },
    },
  );
}

async function sampleCompliance(
  data: SampleData,
  requestId: string,
  p: ReadParameters,
  wells: SampleWell[],
  from: string,
  to: string,
  prompt: string,
  e: EvidenceTools,
) {
  const spillSop = e.add(
    'SOP-SR',
    'Spill Response SOP · SR-01 to SR-04',
    'fleet/sops/spill-response-sop.md',
    'manual',
    data.sops.spill.slice(data.sops.spill.indexOf('## 3.')),
  );
  const rcSop = e.add(
    'SOP-RC',
    'Regulatory Compliance SOP · RC-04',
    'fleet/sops/regulatory-compliance-sop.md',
    'manual',
    data.sops.regulatory,
  );
  const containmentOnly = /contain/i.test(prompt) || (!prompt && p.obligation === 'containment');
  p.obligation = containmentOnly ? 'containment' : 'all';
  const items: Extract<Artifact, { kind: 'obligations' }>['items'] = [];
  const gaps: string[] = [];
  const dateAdd = (date: string, days: number) => addDays(iso(date), days);
  for (const w of wells) {
    const spills = correctedSpills(w).filter(
      (s) =>
        !s.suppressed &&
        iso(s.inspection.inspected_at) >= from &&
        iso(s.inspection.inspected_at) <= to,
    );
    for (const spill of spills) {
      const i = spill.inspection,
        inspectionSource = e.inspection(w, i);
      const repairs = w.maintenance.filter((m) => m.triggered_by_inspection_id === i.inspection_id);
      let contained: number | undefined;
      let reportSource: string | undefined;
      for (const repair of repairs) {
        const report = await readRepairReport(w.metadata.asset_id, repair);
        if (!report) continue;
        const match = report.text.match(
          /contained\s+(?:about\s+)?(\d+(?:\.\d+)?)\s+hours?\s+after/i,
        );
        if (match) {
          contained = Number(match[1]);
          reportSource = e.add(
            `REPORT-${repair.maintenance_id}`,
            `${repair.maintenance_id} · containment evidence`,
            report.path,
            'maintenance',
            report.text.split('## What happened')[1]?.split('## Root cause')[0]?.trim() || match[0],
            repair.maintenance_id,
          );
        }
      }
      if (contained !== undefined && contained > 4)
        items.push({
          id: `SR02-${i.inspection_id}`,
          wellId: w.metadata.asset_id,
          title: `SR-02 · late containment · ${w.metadata.asset_id}`,
          status: 'breach',
          dueAt: iso(i.inspected_at),
          rule: 'Spill Response SOP SR-02: stop source and contain within 4 hours of discovery.',
          observed: `Contained after about ${contained} hours in repair report; inspection ${i.inspection_id}.`,
          sourceIds: [spillSop, inspectionSource, reportSource!],
        });
      if (contained === undefined)
        gaps.push(`${i.inspection_id}: containment timing unavailable in linked reports`);
      if (containmentOnly) continue;
      if ((i.spill_est_volume_bbl || 0) >= 5) {
        const report = w.regulations.find(
          (r) =>
            r.related_inspection_id === i.inspection_id && r.event_type === 'spill_report_filed',
        );
        const deadline = (i.spill_est_volume_bbl || 0) >= 25 ? 2 : 24;
        const reportId = report
          ? e.add(
              report.event_id,
              `${report.event_id} · written spill report`,
              `assets/${w.metadata.asset_id}/regulatory-events.jsonl`,
              'regulatory',
              JSON.stringify(report),
              report.event_id,
            )
          : inspectionSource;
        if (!report || (report.hours_to_report !== null && report.hours_to_report > deadline))
          items.push({
            id: `SR01-${i.inspection_id}`,
            wellId: w.metadata.asset_id,
            title: 'SR-01 · written notice',
            status: 'breach',
            dueAt: iso(i.inspected_at),
            rule: `Written notice within ${deadline} hours of discovery for this spill class.`,
            observed: report
              ? `Written notice after ${report.hours_to_report} hours.`
              : 'No written notice is recorded in the selected asset files.',
            sourceIds: [spillSop, inspectionSource, reportId],
          });
        const dueAt = dateAdd(i.inspected_at, 60);
        const verificationEvents = w.regulations.filter(
          (r) =>
            r.related_inspection_id === i.inspection_id &&
            r.event_type === 'site_inspection' &&
            r.protocol_id === 'SR-03' &&
            r.date <= today,
        );
        const passing = verificationEvents
          .filter(
            (r) =>
              r.status === 'closed' &&
              /verified|meets.*standard|pass/i.test(r.detail) &&
              !/not verified|failed|pending/i.test(r.detail),
          )
          .sort((a, b) => a.date.localeCompare(b.date))[0];
        const late = passing && passing.date > dueAt;
        if (!passing || late) {
          const elapsed = passing
            ? Math.round((Date.parse(passing.date) - Date.parse(iso(i.inspected_at))) / 86400000)
            : undefined;
          items.push({
            id: `SR03-${i.inspection_id}`,
            wellId: w.metadata.asset_id,
            title: late
              ? 'SR-03 · late completed verification'
              : 'SR-03 · remediation verification',
            status: late || dueAt < today ? 'breach' : 'pending',
            dueAt,
            rule: 'Reportable spill remediation verified by a passing agency inspection within 60 days.',
            observed: passing
              ? `Agency verification ${passing.event_id} passed and closed on ${passing.date}, ${elapsed} calendar days after discovery (${i.inspected_at}); deadline ${dueAt}. Completion is closed, but the historical deadline breach remains.`
              : 'No closed passing agency site-inspection record is available.',
            sourceIds: [
              spillSop,
              inspectionSource,
              ...verificationEvents.map((r) =>
                e.add(
                  r.event_id,
                  r.event_id,
                  `assets/${w.metadata.asset_id}/regulatory-events.jsonl`,
                  'regulatory',
                  JSON.stringify(r),
                  r.event_id,
                ),
              ),
            ],
          });
        }
      }
    }
    if (!containmentOnly)
      for (const notice of w.regulations.filter(
        (r) =>
          r.event_type === 'notice_of_violation' &&
          r.status === 'open' &&
          r.date >= from &&
          r.date <= to,
      )) {
        const id = e.add(
          notice.event_id,
          `${notice.event_id} · open notice`,
          `assets/${w.metadata.asset_id}/regulatory-events.jsonl`,
          'regulatory',
          JSON.stringify(notice),
          notice.event_id,
        );
        if (
          !w.regulations.some(
            (r) =>
              r.event_type === 'nov_response_filed' &&
              r.related_inspection_id === notice.related_inspection_id,
          )
        )
          items.push({
            id: `RC04-${notice.event_id}`,
            wellId: w.metadata.asset_id,
            title: 'RC-04 · response to open notice',
            status: dateAdd(notice.date, 30) < today ? 'breach' : 'pending',
            dueAt: dateAdd(notice.date, 30),
            rule: 'Respond to agency notice within 30 days and track until closed.',
            observed: `No response filed; notice ${notice.event_id} remains ${notice.status}; fine USD ${notice.fine_usd}.`,
            sourceIds: [rcSop, id],
          });
      }
  }
  const a: Artifact = {
    kind: 'obligations',
    id: 'sample-obligations',
    title: containmentOnly
      ? 'Spills exceeding containment deadline'
      : 'Document-backed spill obligations',
    scope: scope(
      wells,
      from,
      [today, ...items.flatMap((i) => (i.dueAt ? [i.dueAt] : []))].sort().at(-1)!,
      'Bounded SOP/report evaluation as of 17 Oct 2026; due dates may extend beyond selected event window',
    ),
    sourceIds: unique([spillSop, rcSop, ...items.flatMap((i) => i.sourceIds)]),
    items,
  };
  const fine = wells
    .flatMap((w) => w.regulations)
    .filter(
      (r) =>
        r.event_type === 'notice_of_violation' &&
        r.status === 'open' &&
        r.date >= from &&
        r.date <= to,
    )
    .reduce((n, r) => n + r.fine_usd, 0);
  return result(
    requestId,
    p,
    `${items.filter((i) => i.status === 'breach').length} documented breach findings${containmentOnly ? ' for containment' : ''}; ${items.filter((i) => i.status === 'pending').length} pending obligations.${!containmentOnly ? ` Open notice fines: USD ${fine.toLocaleString('en-US')}.` : ''} ${items.map((i) => `${i.wellId}: ${i.title}; ${i.observed}`).join(' ')} This is a bounded read of SR-01/02/03 and RC-04, not a complete compliance audit; RCA/manual duties and conflicting narratives require further review.${gaps.length ? ` ${gaps.length} spill reports lack parsed containment timing; absence is not proof of compliance.` : ''}`,
    [
      wrap(data, requestId, a, e, [
        'Bounded compliance evaluator; not all manual/SOP protocols are implemented.',
        ...(gaps.length
          ? [`${gaps.length} spill events have no extractable containment duration.`]
          : []),
      ]),
    ],
    'obligations',
  );
}

async function sampleDocuments(
  data: SampleData,
  requestId: string,
  p: ReadParameters,
  wells: SampleWell[],
  prompt: string,
  e: EvidenceTools,
) {
  const reportIds = unique(prompt.match(/MNT-\d+-\d+/gi) || []);
  const sections: { id: string; text: string }[] = [];
  if (reportIds.length) {
    for (const id of reportIds) {
      const w = data.wells.find((w) => w.maintenance.some((m) => m.maintenance_id === id));
      const maintenance = w?.maintenance.find((m) => m.maintenance_id === id);
      if (!w || !maintenance) continue;
      const report = await readRepairReport(w.metadata.asset_id, maintenance);
      if (report) {
        const excerpt = report.text.slice(0, 3800);
        sections.push({
          id: e.add(
            `DOC-${id}`,
            `${id} · source repair report`,
            report.path,
            'maintenance',
            excerpt,
            id,
          ),
          text: excerpt,
        });
      }
    }
  } else {
    const namedTypes = [...data.manuals.keys()].filter((type) =>
      new RegExp(`\\b${type}\\b`, 'i').test(prompt),
    );
    const types = namedTypes.length ? namedTypes : unique(wells.map((w) => w.metadata.well_type));
    const documents = [
      ...types.map((type) => ({
        id: `DOC-${type}`,
        title: `${type} operating manual`,
        path: `fleet/well-types/${type}.md`,
        text: data.manuals.get(type)!.text,
      })),
      {
        id: 'DOC-SOP-SR',
        title: 'Spill Response SOP',
        path: 'fleet/sops/spill-response-sop.md',
        text: data.sops.spill,
      },
      {
        id: 'DOC-SOP-RC',
        title: 'Regulatory Compliance SOP',
        path: 'fleet/sops/regulatory-compliance-sop.md',
        text: data.sops.regulatory,
      },
    ];
    const words = unique(prompt.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter(
      (word) =>
        ![
          'what',
          'does',
          'the',
          'say',
          'about',
          'show',
          'please',
          'well',
          'manual',
          'sop',
          'protocol',
          'rules',
          'document',
          'for',
          'and',
          'with',
          'from',
          'are',
        ].includes(word),
    );
    const candidates = documents
      .flatMap((doc) =>
        doc.text.split(/(?=^##\s)/m).map((text, index) => ({
          doc,
          text,
          index,
          score: words.reduce(
            (score, word) => score + (text.toLowerCase().includes(word) ? 1 : 0),
            0,
          ),
        })),
      )
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    for (const c of candidates) {
      const excerpt = c.text.slice(0, 3800);
      sections.push({
        id: e.add(
          `${c.doc.id}-${c.index}`,
          `${c.doc.title} · ${c.text.split('\n')[0]}`,
          c.doc.path,
          'manual',
          excerpt,
        ),
        text: excerpt,
      });
    }
  }
  if (!sections.length)
    return result(
      requestId,
      p,
      'No matching document passage or linked repair report was found for that scope. Ask for a record ID, well type, or specific SOP topic. Missing passages are not evidence of compliance.',
      [],
      null,
    );
  const answer = `Found ${sections.length} source passages in the local fictional challenge documents. ${sections.map((s) => s.text.replace(/\s+/g, ' ').slice(0, 250) + (s.text.length > 250 ? '…' : '')).join(' ')} Open Sources for the full passages and record locators. These excerpts do not constitute a complete compliance determination.`;
  return result(requestId, p, answer, [], null, {
    citations: {
      schemaVersion: 1,
      runId: requestId,
      evidence: [...e.records.values()],
      claims: sections.map((s, index) => ({
        id: `passage-${index}`,
        text: s.text,
        sourceIds: [s.id],
      })),
    },
  });
}

async function sampleClaims(
  data: SampleData,
  requestId: string,
  p: ReadParameters,
  wells: SampleWell[],
  from: string,
  to: string,
  e: EvidenceTools,
) {
  if (wells.length > 20)
    return result(
      requestId,
      p,
      'Choose up to 20 wells for a readable claim comparison. No notes have been combined across users or written by this adapter.',
      [],
      null,
    );
  const items: Extract<Artifact, { kind: 'claims' }>['items'] = [];
  const summaries: string[] = [];
  for (const w of wells) {
    const detections = correctedSpills(w).filter(
      (s) => iso(s.inspection.inspected_at) >= from && iso(s.inspection.inspected_at) <= to,
    );
    const relevantNotes = w.notes.filter((n) =>
      detections.some(
        (s) =>
          n.inspection_id === s.inspection.inspection_id ||
          n.valid_from === iso(s.inspection.inspected_at) ||
          n.text.includes(s.inspection.inspection_id),
      ),
    );
    for (const s of detections) {
      items.push({
        id: s.inspection.inspection_id,
        wellId: w.metadata.asset_id,
        at: iso(s.inspection.inspected_at),
        author: `Inspection · ${data.users.get(s.inspection.inspector_user_id) || s.inspection.inspector_user_id}`,
        text: `Detected ${s.inspection.spill_est_volume_bbl} bbl: ${s.inspection.notes}. ${s.suppressed ? 'A formal correction removes this detection.' : 'No formal correction removes this detection; it remains in spill statistics.'}`,
        status: s.suppressed ? 'corrected' : 'observed',
        sourceIds: [e.inspection(w, s.inspection), ...s.corrections.map((n) => e.note(w, n))],
      });
      const repair = w.maintenance.find(
        (m) => m.triggered_by_inspection_id === s.inspection.inspection_id,
      );
      if (repair) {
        const id = e.add(
          repair.maintenance_id,
          `${repair.maintenance_id} · linked repair`,
          `assets/${w.metadata.asset_id}/maintenance.jsonl`,
          'maintenance',
          JSON.stringify(repair),
          repair.maintenance_id,
        );
        items.push({
          id: `claim-${repair.maintenance_id}`,
          wellId: w.metadata.asset_id,
          at: iso(repair.started_at),
          author: 'Maintenance record',
          text: `${repair.maintenance_id}: ${repair.issue}; ${repair.action_taken}. A repair does not erase conflicting notes.`,
          status: 'observed',
          sourceIds: [id],
        });
      }
    }
    for (const n of relevantNotes)
      items.push({
        id: n.note_id,
        wellId: w.metadata.asset_id,
        at: iso(n.created_at),
        author: data.users.get(n.author_user_id) || n.author_user_id,
        text: n.text,
        status:
          n.note_type === 'correction'
            ? 'corrected'
            : /confirm|sample|crude|water/i.test(n.text)
              ? 'disputed'
              : 'reported',
        sourceIds: [e.note(w, n)],
      });
    summaries.push(
      `${w.metadata.asset_id}: ${detections.filter((s) => !s.suppressed).length} detections remain, ${detections.filter((s) => s.suppressed).length} formal false positives removed. ${relevantNotes.map((n) => `${data.users.get(n.author_user_id) || n.author_user_id}: ${n.text}`).join(' ')}`,
    );
  }
  if (!items.length)
    return result(
      requestId,
      p,
      'No spill detections or linked conflicting notes were found in that scope. This does not establish whether an unrecorded spill occurred.',
      [],
      null,
    );
  const maxDate = [to, ...items.map((i) => i.at)].sort().at(-1)!;
  const minDate = [from, ...items.map((i) => i.at)].sort()[0];
  const a: Artifact = {
    kind: 'claims',
    id: 'sample-claims',
    title: 'Inspection detections and competing source claims',
    scope: scope(
      wells,
      minDate,
      maxDate,
      'Event window plus linked notes and repairs; reports remain attributed and do not silently override inspections',
    ),
    sourceIds: unique(items.flatMap((i) => i.sourceIds)),
    items,
  };
  return result(
    requestId,
    p,
    `${summaries.join('\n')} Ordinary notes are retained as attributed claims; only an explicit correction against an inspection changes spill statistics.`,
    [wrap(data, requestId, a, e)],
    'claims',
  );
}
