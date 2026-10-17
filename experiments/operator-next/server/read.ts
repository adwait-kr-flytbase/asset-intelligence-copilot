import { randomUUID } from 'node:crypto';
import {
  artifactSchema,
  operationalVisualSchema,
  parametersSchema,
  responseSchema,
  type AgentResponse,
  type Artifact,
  type Evidence,
  type OperationalVisual,
  type ReadParameters,
  type SavedView,
} from '../src/contracts';
import {
  assets,
  corrections,
  dates,
  fixtureAsOf,
  fixtureEvidence,
  fixtureFrom,
  fixtureTo,
  rawReadings,
  source,
  templates,
} from './fixtures';

type Kind = Artifact['kind'];
const unique = (ids: string[]) => [...new Set(ids)];
export function validateParameters(value: unknown): ReadParameters {
  const p = parametersSchema.parse(value);
  if (p.wellId !== 'all' && !assets.some((a) => a.id === p.wellId)) throw new Error('Unknown well');
  if (p.wellIds) {
    if (
      !p.wellIds.length ||
      new Set(p.wellIds).size !== p.wellIds.length ||
      p.wellIds.some((id) => !assets.some((a) => a.id === id))
    )
      throw new Error('Unknown or duplicate well subset');
    if (p.wellId !== 'all') throw new Error('Choose either a single well or a subset');
  }
  return p;
}
export function evidenceClosure(ids: string[], records: Map<string, Evidence>): Evidence[] {
  const included = new Map<string, Evidence>();
  const visit = (id: string) => {
    if (included.has(id)) return;
    const record = records.get(id);
    if (!record || record.visibility !== 'shared') throw new Error('Evidence unavailable');
    included.set(id, record);
    for (const dependency of [...(record.inputSourceIds || []), ...(record.supersedes || [])])
      visit(dependency);
  };
  ids.forEach(visit);
  return [...included.values()];
}
function envelope(
  artifact: Artifact,
  runId: string,
  records: Map<string, Evidence>,
  filteredDates: boolean,
): OperationalVisual {
  const resultId = randomUUID();
  return operationalVisualSchema.parse({
    kind: 'artifact',
    schemaVersion: 1,
    runId,
    resultId,
    artifactRevision: 1,
    phase: 'ready',
    readOnly: true,
    artifact: { ...artifact, id: `${artifact.id}-${resultId}` },
    meta: {
      asOf: fixtureAsOf,
      evaluatedAt: new Date().toISOString(),
      dataRevision: 'operator-next-synthetic-r1',
      timeZone: 'UTC',
      completeness: 'partial',
      warnings: [
        'Synthetic fixture records only. No actual operator data, production model, or legal determination.',
        ...(artifact.kind === 'series'
          ? [
              'Absolute temperatures are standalone invented sensor fixtures; missing wellhead observations remain null.',
            ]
          : filteredDates
            ? [
                'Date controls apply only to temperature series; this panel retains its labelled source period.',
              ]
            : []),
        ...(artifact.kind === 'geo' && artifact.points.some((p) => p.lat === null)
          ? ['LAB-W05 has no recorded coordinates and remains in the well list.']
          : []),
      ],
    },
    evidence: evidenceClosure(artifact.sourceIds, records),
  });
}
function artifactRead(
  kind: Kind,
  p: ReadParameters,
  wellIds: string[],
  runId: string,
): OperationalVisual[] {
  const selected = assets.filter((a) => wellIds.includes(a.id));
  const records = fixtureEvidence();
  const filteredDates = !!p.from || !!p.to;
  const wrap = (a: Artifact) => envelope(artifactSchema.parse(a), runId, records, filteredDates);
  const scope = (label: string, ids = wellIds, from = fixtureFrom, to = fixtureTo) => ({
    label,
    wellIds: ids,
    from,
    to,
  });
  const inspectionSources = (id: string) => [
    `LAB-INS-${id}`,
    `LAB-RULE-${assets.find((a) => a.id === id)!.type}`,
  ];
  if (kind === 'series')
    return selected.map((asset) => {
      const from = p.from || fixtureFrom,
        to = p.to || fixtureTo;
      const readings = rawReadings[asset.id].filter((r) => r.date >= from && r.date <= to);
      const geo = templates.find((v) => v.artifact.kind === 'geo')!.artifact as Extract<
        Artifact,
        { kind: 'geo' }
      >;
      const point = geo.points.find((v) => v.wellId === asset.id)!;
      return wrap({
        id: `temperatures-${asset.id}`,
        kind,
        title: `${asset.id} · wellhead and ambient`,
        scope: scope(
          'Invented sensor temperatures; selected trend dates only',
          [asset.id],
          from,
          to,
        ),
        sourceIds: [...inspectionSources(asset.id), `LAB-RAW-TEMPERATURE-${asset.id}`],
        unit: '°C',
        series: [
          {
            id: `${asset.id}-wellhead`,
            label: 'Wellhead (synthetic)',
            points: readings.map((r) => ({ date: r.date, value: r.wellhead })),
          },
          {
            id: `${asset.id}-ambient`,
            label: 'Ambient (synthetic)',
            points: readings.map((r) => ({ date: r.date, value: r.ambient })),
          },
        ],
        events:
          point.eventDate && point.eventDate >= from && point.eventDate <= to
            ? [
                {
                  id: `spill-${asset.id}`,
                  date: point.eventDate,
                  label: `Recorded spill · ${point.volumeBbl} bbl`,
                  sourceIds: [`LAB-INS-${asset.id}`],
                },
              ]
            : [],
      });
    });
  if (kind === 'correction')
    return corrections
      .filter((c) => wellIds.includes(c.wellId))
      .map((c) =>
        wrap({
          kind,
          id: `correction-${c.wellId}`,
          title: `${c.wellId} · proposed record correction`,
          scope: scope(
            'Read-only proposal recorded 15 Oct; no changes applied',
            [c.wellId],
            fixtureTo,
            fixtureTo,
          ),
          sourceIds: [`LAB-CORRECTION-${c.wellId}`],
          recordId: c.recordId,
          field: 'Labor duration',
          original: c.original,
          proposed: c.proposed,
          unit: 'minutes',
          reason: 'Synthetic operator proposal after checking a field note; awaiting human review.',
          impacts: [
            'Original record remains available.',
            'Cost totals and inspection-derived downtime have not been recalculated.',
            'This prototype cannot apply changes.',
          ],
          state: 'proposed',
        }),
      );
  if (kind === 'matrix' && p.metric === 'spill-volume') {
    const geo = templates.find((v) => v.artifact.kind === 'geo')!.artifact as Extract<
      Artifact,
      { kind: 'geo' }
    >;
    const areas = unique(selected.map((a) => a.area));
    const columns = [
      { id: '2026-09', label: 'Sep 2026' },
      { id: '2026-10', label: 'Oct 2026' },
    ];
    return [
      wrap({
        kind,
        id: 'spill-event-matrix',
        title: 'Recorded spill events by area and month',
        scope: scope(
          'Complete synthetic event register for selected wells, 24 Sep–15 Oct; zero means no recorded event in this fixture window',
        ),
        unit: 'events',
        sourceIds: selected.map((a) => `LAB-INS-${a.id}`),
        rows: areas.map((area) => ({ id: area, label: area })),
        columns,
        cells: areas.flatMap((area) =>
          columns.map((month) => {
            const areaWells = selected.filter((a) => a.area === area);
            return {
              rowId: area,
              columnId: month.id,
              value: geo.points.filter(
                (point) =>
                  areaWells.some((a) => a.id === point.wellId) &&
                  point.volumeBbl > 0 &&
                  point.eventDate?.startsWith(month.id),
              ).length,
              sourceIds: areaWells.map((a) => `LAB-INS-${a.id}`),
            };
          }),
        ),
      }),
    ];
  }
  if (kind === 'ranking' && p.metric && p.metric !== 'repair-cost') {
    const items = selected
      .map((asset) => {
        const value =
          p.metric === 'spill-volume'
            ? asset.spillBbl
            : rawReadings[asset.id].filter(
                (r) =>
                  r.wellhead !== null &&
                  Number((r.wellhead - r.ambient).toFixed(1)) < (asset.type === 'T200' ? 15 : 20),
              ).length * 7;
        const id = `LAB-CALC-${p.metric}-${asset.id}`;
        records.set(id, {
          ...source(
            id,
            `Synthetic ${p.metric} calculation · ${asset.id}`,
            'calculation',
            p.metric === 'downtime'
              ? `Method weekly-below-threshold-v1. Each observed weekly wellhead minus ambient below ${asset.type === 'T200' ? 15 : 20} °C contributes 7 days. Window ${fixtureFrom} through ${fixtureTo}; dates ${dates.join(', ')}. Missing observations excluded, not assumed producing. Estimated downtime ${value} days; no loss-volume estimate.`
              : `Recorded spill volume in ${fixtureFrom} through ${fixtureTo}: ${value} bbl. No forecast.`,
          ),
          inputSourceIds:
            p.metric === 'downtime'
              ? [...inspectionSources(asset.id), `LAB-RAW-TEMPERATURE-${asset.id}`]
              : [`LAB-INS-${asset.id}`],
        });
        return { id: asset.id, label: asset.label, value, sourceIds: [id] };
      })
      .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
    return [
      wrap({
        kind,
        id: `${p.metric}-ranking`,
        title: p.metric === 'downtime' ? 'Inspection-derived downtime' : 'Recorded spill volume',
        scope: scope('Full four-inspection source window; independent of trend date controls'),
        unit: p.metric === 'downtime' ? 'days' : 'bbl',
        metricLabel: p.metric === 'downtime' ? 'Estimated downtime' : 'Recorded spill volume',
        sourceIds: items.flatMap((i) => i.sourceIds),
        items,
      }),
    ];
  }
  const template = structuredClone(templates.find((v) => v.artifact.kind === kind)!.artifact);
  template.scope.wellIds = wellIds;
  if (template.kind === 'geo') {
    template.points = template.points
      .filter((point) => wellIds.includes(point.wellId))
      .map((point) => {
        const asset = assets.find((a) => a.id === point.wellId)!;
        const latest = rawReadings[point.wellId].at(-1)!;
        return {
          ...point,
          temperatureDeltaC:
            latest.wellhead === null ? null : Number((latest.wellhead - latest.ambient).toFixed(1)),
          temperatureThresholdC: asset.type === 'T200' ? 15 : 20,
          wellType: asset.type,
        };
      });
    template.sourceIds = unique(template.points.flatMap((point) => point.sourceIds));
  } else if (template.kind === 'matrix') {
    template.rows = template.rows.filter((row) => wellIds.includes(row.id));
    template.cells = template.cells.filter((cell) => wellIds.includes(cell.rowId));
    template.sourceIds = unique(template.cells.flatMap((cell) => cell.sourceIds));
  } else if (template.kind === 'ranking') {
    template.items = template.items.filter((item) => wellIds.includes(item.id));
    template.sourceIds = unique(template.items.flatMap((item) => item.sourceIds));
  } else if (template.kind === 'timeline') {
    template.items = template.items.filter((item) => wellIds.some((id) => item.id.endsWith(id)));
    template.sourceIds = unique(template.items.flatMap((item) => item.sourceIds));
  } else if (template.kind === 'claims') {
    template.items = template.items.filter((item) => wellIds.includes(item.wellId));
    template.sourceIds = unique(template.items.flatMap((item) => item.sourceIds));
  }
  if (template.kind === 'obligations') {
    template.items = template.items.filter((item) => wellIds.includes(item.wellId));
    template.sourceIds = unique(template.items.flatMap((item) => item.sourceIds));
  }
  return [wrap(template)];
}
function describe(visuals: OperationalVisual[]): string {
  const a = visuals[0].artifact;
  if (a.kind === 'geo') {
    const below = a.points.filter((p) => p.status === 'below-threshold');
    const missing = a.points.filter((p) => p.lat === null).length;
    return `${below.length} of ${a.points.length} selected wells are below their synthetic production threshold${below.length ? `: ${below.map((p) => p.label).join(', ')}` : ''}. ${a.points.length - missing} have recorded coordinates${missing ? `; ${missing} has no coordinates and remains in the list` : ''}. Status is based on the 15 Oct inspection; spill records cover 24 Sep–15 Oct 2026.`;
  }
  if (a.kind === 'ranking') {
    const total = a.items.reduce((sum, item) => sum + item.value, 0);
    return `${a.metricLabel}: ${total.toLocaleString('en-US')} ${a.unit} across ${a.items.length} selected wells, 24 Sep–15 Oct 2026.${a.items.length ? ` ${a.items[0].label} ranks first at ${a.items[0].value.toLocaleString('en-US')} ${a.unit}.` : ''}${a.unit === 'days' ? ' Downtime is a weekly-inspection estimate; missing observations are excluded.' : ''}`;
  }
  if (a.kind === 'series') {
    const series = visuals.flatMap((v) => (v.artifact.kind === 'series' ? v.artifact.series : []));
    const count = series.reduce(
      (sum, s) => sum + s.points.filter((p) => p.value !== null).length,
      0,
    );
    const missing = series.reduce(
      (sum, s) => sum + s.points.filter((p) => p.value === null).length,
      0,
    );
    return `${visuals.length} selected wells have ${count} available synthetic wellhead/ambient values from ${a.scope.from} through ${a.scope.to}; ${missing} missing observations remain gaps. Absolute temperatures are invented sensor fixtures, shown in °C.${count === 0 ? ' No readings fall in this range.' : ''}`;
  }
  if (a.kind === 'matrix' && a.unit === '°C')
    return `${a.rows.length} selected wells across ${a.columns.length} weekly inspections; cells show temperature difference in °C. ${a.cells.filter((c) => c.value === null).length} missing observations remain unknown. This matrix retains its full inspection window, independent of trend date controls.`;
  if (a.kind === 'matrix')
    return `${a.cells.reduce((sum, c) => sum + (c.value || 0), 0)} recorded spill events across ${a.rows.length} selected areas in the 24 Sep–15 Oct 2026 fixture window. Cells count events, not barrels; zero means no event in this synthetic register.`;
  if (a.kind === 'obligations')
    return `${a.items.length} invented checklist obligations: ${a.items.filter((i) => i.status === 'breach').length} breach, ${a.items.filter((i) => i.status === 'pending').length} pending, ${a.items.filter((i) => i.status === 'compliant').length} compliant, and ${a.items.filter((i) => i.status === 'unknown').length} unknown as of 17 Oct 2026. These statuses are demonstration rules, not legal advice.`;
  if (a.kind === 'timeline')
    return `${a.items.length} source-backed events for ${a.scope.wellIds.length} selected wells, ${a.scope.from} through ${a.scope.to}. Repairs following a fault do not establish a cause or return to service.`;
  if (a.kind === 'claims')
    return `${a.items.filter((i) => i.status === 'reported').length} reported statements and ${a.items.filter((i) => i.status === 'disputed').length} disputed statements remain separate from ${a.items.filter((i) => i.status === 'observed').length} measured observations. No report overwrites an inspection.`;
  return `${visuals.length} read-only correction proposal${visuals.length === 1 ? '' : 's'}; ${a.recordId} proposes ${a.original} → ${a.proposed} ${a.unit}. Original records remain unchanged; no approval or recalculation has occurred.`;
}
export function executeRead(
  requestId: string,
  kind: Kind,
  pInput: ReadParameters,
  savedView?: SavedView,
): AgentResponse {
  const p = validateParameters(pInput);
  if (kind === 'ranking' && savedView) {
    const metric = savedView.parameters.metric || 'repair-cost';
    if (p.metric && p.metric !== metric) throw Error('Saved read metric cannot change');
    p.metric = metric;
  }
  if (kind === 'ranking' && !p.metric) p.metric = 'repair-cost';
  if (kind === 'matrix' && savedView) {
    if (p.metric && p.metric !== savedView.parameters.metric)
      throw Error('Saved matrix measure cannot change');
    p.metric = savedView.parameters.metric;
  }
  if (kind !== 'ranking' && kind !== 'matrix') delete p.metric;
  const wellIds =
    p.wellIds || assets.filter((a) => p.wellId === 'all' || a.id === p.wellId).map((a) => a.id);
  if (!wellIds.length || wellIds.some((id) => !assets.some((a) => a.id === id)))
    throw Error('Unknown well');
  const runId = requestId;
  const visuals = artifactRead(kind, p, wellIds, runId);
  return responseSchema.parse({
    schemaVersion: 1,
    requestId,
    answer: `Synthetic fixture read. ${describe(visuals)}`,
    visuals,
    intent: kind,
    mode: 'fixture',
    parameters: p,
    ...(savedView?.presentation ? { presentation: savedView.presentation } : {}),
    ...(savedView
      ? { savedView: { id: savedView.id, revision: savedView.revision, name: savedView.name } }
      : {}),
  });
}
export function answerStatus(
  requestId: string,
  p: ReadParameters,
  wellIds: string[],
): AgentResponse {
  const runId = requestId,
    records = fixtureEvidence();
  const claims = wellIds.map((id) => {
    const asset = assets.find((a) => a.id === id)!;
    const latest = rawReadings[id].at(-1)!;
    const delta = Number((latest.wellhead! - latest.ambient).toFixed(1));
    const threshold = asset.type === 'T200' ? 15 : 20;
    return {
      id: `status-${id}`,
      text: `${id}: temperature difference ${delta} °C against the ${asset.type} threshold of ${threshold} °C, ${delta >= threshold ? 'producing' : 'below threshold'} on 15 Oct 2026. The readings establish a classification, not the physical cause.`,
      sourceIds: [`LAB-INS-${id}`, `LAB-RULE-${asset.type}`],
    };
  });
  const evidence = evidenceClosure(unique(claims.flatMap((c) => c.sourceIds)), records);
  return responseSchema.parse({
    schemaVersion: 1,
    requestId,
    answer: `Synthetic fixture read. ${claims.map((c) => c.text).join(' ')} Evaluated afresh; source basis is 17 Oct 2026 and no newer observations are available.`,
    visuals: [],
    citations: { schemaVersion: 1, runId, evidence, claims },
    intent: null,
    mode: 'fixture',
    parameters: p,
  });
}
export function resolveQuestion(prompt: string, pInput: ReadParameters) {
  const p = validateParameters(pInput);
  const mentions = unique(
    [...prompt.matchAll(/\b(?:LAB-)?W0*(\d+)\b|\bwell\s+(\d+)\b/gi)].map(
      (m) => `LAB-W${String(Number(m[1] || m[2])).padStart(2, '0')}`,
    ),
  );
  if (mentions.some((id) => !assets.some((a) => a.id === id))) throw Error('Unknown well');
  if (mentions.length === 1) {
    p.wellId = mentions[0];
    delete p.wellIds;
  } else if (mentions.length > 1) {
    p.wellId = 'all';
    p.wellIds = mentions;
  }
  const wellIds =
    p.wellIds || assets.filter((a) => p.wellId === 'all' || a.id === p.wellId).map((a) => a.id);
  const unsupported =
    (/\bproduction\b/i.test(prompt) &&
      /\b(how much|volume\w*|total|rates?|output|barrels?)\b/i.test(prompt)) ||
    /\b(forecast|predict\w*|budget|invoice\w*|legal|actual regulation\w*|real regulation\w*|production rate|barrels per day|bpd|profit\w*|weather|price\w*|apply|submit|approve|delete|dispatch|write|update|assign|save this correction)\b/i.test(
      prompt,
    );
  let kind: Kind | null = null;
  if (!unsupported) {
    if (/\b(map|locations?|where|geograph\w*)\b/i.test(prompt)) kind = 'geo';
    else if (/\b(correction\w*|propos\w*|original)\b/i.test(prompt)) kind = 'correction';
    else if (/\b(cost\w*|spend\w*|expens\w*|spent|repair bill\w*)\b/i.test(prompt)) {
      kind = 'ranking';
      p.metric = 'repair-cost';
    } else if (/\b(downtime|lost time|non.?producing days|production time)\b/i.test(prompt)) {
      kind = 'ranking';
      p.metric = 'downtime';
    } else if (/\b(compliance|obligation\w*|deadline\w*|overdue|regulatory)\b/i.test(prompt))
      kind = 'obligations';
    else if (
      /\b(claim\w*|disput\w*|conflict\w*|competing|who said|reports disagree)\b/i.test(prompt)
    )
      kind = 'claims';
    else if (
      /\b(matrix|heatmap)\b/i.test(prompt) ||
      (/\b(distribution|by area|by month|monthly|regions?|areas?|how many|counts?)\b/i.test(
        prompt,
      ) &&
        /spill/i.test(prompt))
    ) {
      kind = 'matrix';
      if (/spill/i.test(prompt)) p.metric = 'spill-volume';
      else delete p.metric;
    } else if (
      /\b(ambient|wellhead|temperatures?|trends?|sensor|readings)\b/i.test(prompt) &&
      !/\b(why|explain)\b/i.test(prompt)
    )
      kind = 'series';
    else if (
      /\b(timeline|history|chronolog\w*|what happened|repair\w*|maintenance)\b/i.test(prompt)
    )
      kind = 'timeline';
    else if (/\b(map|locations?|where|overview|attention|geograph\w*)\b/i.test(prompt))
      kind = 'geo';
    else if (/\b(spills?|spill volumes?|spill amounts?|spill ranking)\b/i.test(prompt)) {
      kind = 'ranking';
      p.metric = 'spill-volume';
    }
  }
  const status =
    !unsupported &&
    kind === null &&
    /\b(why|explain|status|producing|production|threshold|fresh\w*|stale|inspect\w*|well\w*)\b/i.test(
      prompt,
    );
  return { kind, p, wellIds, status, unsupported };
}
export function chatAnswer(
  requestId: string,
  prompt: string,
  input: ReadParameters,
): AgentResponse {
  const { kind, p, wellIds, status } = resolveQuestion(prompt, input);
  if (kind) {
    const response = executeRead(requestId, kind, p);
    const presentation = /\btable\b/i.test(prompt)
      ? 'table'
      : /\bcard\b/i.test(prompt)
        ? 'card'
        : undefined;
    return responseSchema.parse({ ...response, ...(presentation ? { presentation } : {}) });
  }
  if (status) return answerStatus(requestId, p, wellIds);
  return responseSchema.parse({
    schemaVersion: 1,
    requestId,
    answer:
      'This fixture assistant has no evidence or tool for that request. It can read synthetic well status, recorded repair costs, weekly downtime estimates, wellhead/ambient trends, spill distributions, invented checklist obligations, history, competing claims, and read-only correction proposals. Forecasts, production volumes, actual legal determinations, and record writes are unavailable.',
    visuals: [],
    intent: null,
    mode: 'fixture',
    parameters: p,
  });
}
