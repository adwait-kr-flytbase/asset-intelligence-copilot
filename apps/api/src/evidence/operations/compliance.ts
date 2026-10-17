import type { Source } from '../types.js';
import {
  type AssessmentColumn,
  type AssessmentInput,
  type AssessmentRow,
  areaName,
  date,
  makeAssessment,
  type OperationalDataset,
  type OperationalDocument,
  type OperationalRecord,
  selectedAssets,
  text,
} from './types.js';

type Entry = { row: AssessmentRow; text: string; sources: Source[] };
const hour = 3_600_000;
const day = 24 * hour;
// Policy prose dates have no offset; interpret them in the dataset's UTC clock.
const policyDate = (value: string | undefined) =>
  value ? Date.parse(`${value} 00:00:00 UTC`) : NaN;
const col = (
  key: string,
  label: string,
  valueType: AssessmentColumn['valueType'] = 'string',
): AssessmentColumn => ({ key, label, valueType });
const end = (d: OperationalDataset, i: AssessmentInput) =>
  Math.min(
    Date.parse(d.asOf),
    i.through
      ? Date.parse(i.through.length === 10 ? `${i.through}T23:59:59.999Z` : i.through)
      : Infinity,
  );
const inRange = (t: number, d: OperationalDataset, i: AssessmentInput) =>
  t <= end(d, i) && (!i.from || t >= Date.parse(i.from));
const sorted = (rs: OperationalRecord[], key: string) =>
  [...rs].sort((a, b) => date(a, key) - date(b, key));
const byAsset = (rs: OperationalRecord[], id: string) =>
  rs.filter((r) => text(r, 'asset_id') === id);
const policy = (d: OperationalDataset) =>
  d.documents.find((doc) => /OPS-1 Gas odor response/.test(doc.markdown));
const policySources = (doc: OperationalDocument | undefined) => (doc ? [doc.source] : []);
function corrected(d: OperationalDataset, r: OperationalRecord, cutoff: number) {
  const raw = { ...r.raw };
  const notes = sorted(
    d.notes.filter(
      (n) =>
        text(n, 'inspection_id') === r.id &&
        text(n, 'note_type') === 'data_correction' &&
        date(n, 'created_at') <= cutoff,
    ),
    'created_at',
  );
  for (const n of notes) raw[text(n, 'field')] = n.raw.corrected_value;
  return { raw, sources: [r.source, ...notes.map((n) => n.source)] };
}
function production(
  d: OperationalDataset,
  asset: OperationalRecord,
  inspection: OperationalRecord,
  cutoff: number,
) {
  const at = date(inspection, 'inspected_at');
  const history = Array.isArray(asset.raw.type_history)
    ? (asset.raw.type_history as Record<string, unknown>[])
    : [];
  const applicable = history.find(
    (h) =>
      Date.parse(String(h.from)) <= at &&
      (!h.to || at <= Date.parse(`${String(h.to).slice(0, 10)}T23:59:59.999Z`)),
  );
  const type = String(applicable?.well_type ?? asset.raw.well_type ?? '');
  const manual = d.documents.find((doc) => doc.markdown.includes(`OM-${type}`));
  const rule = manual?.markdown.match(
    /at least\s*\*\*(\d+(?:\.\d+)?)\s*°C above\s*(?:\*\*)?\s*ambient/i,
  );
  const c = corrected(d, inspection, cutoff);
  const ambient = c.raw.ambient_temp_c;
  const wellhead = c.raw.wellhead_temp_c;
  const delta =
    typeof ambient === 'number' && typeof wellhead === 'number' ? wellhead - ambient : null;
  return {
    type,
    ambient,
    delta,
    producing: rule && delta !== null ? delta >= Number(rule[1]) : null,
    threshold: rule ? Number(rule[1]) : null,
    sources: [...c.sources, ...policySources(manual)],
  };
}

export function assessGasResponses(data: OperationalDataset, input: AssessmentInput = {}) {
  const sop = policy(data);
  const valid =
    !!sop &&
    /24 hours/.test(sop.markdown) &&
    /12 hours/.test(sop.markdown) &&
    /1 Jan 2027/.test(sop.markdown);
  const entries: Entry[] = [];
  for (const asset of selectedAssets(data, input)) {
    for (const n of byAsset(data.notes, asset.id).filter(
      (n) =>
        text(n, 'note_type') === 'operator_note' &&
        /(?:smell(?:ed)?\s+gas|gas\s+(?:smell|odou?r)|rotten[ -]egg|H2S\s+monitor\s+alarm)/i.test(
          text(n, 'text'),
        ) &&
        inRange(date(n, 'created_at'), data, input),
    )) {
      const at = date(n, 'created_at');
      const candidates = [
        ...byAsset(data.maintenance, asset.id).map((r) => ({
          r,
          at: date(r, 'started_at'),
          kind: 'maintenance',
        })),
        ...byAsset(data.inspections, asset.id)
          .filter((r) => text(r, 'method') === 'manual')
          .map((r) => ({ r, at: date(r, 'inspected_at'), kind: 'manual inspection' })),
      ]
        .filter((r) => r.at > at && r.at <= end(data, input))
        .sort((a, b) => a.at - b.at);
      const next = candidates[0];
      const allowed = valid ? (at < Date.parse('2027-01-01') ? 24 : 12) : null;
      const elapsed = next ? (next.at - at) / hour : null;
      const status =
        allowed === null
          ? 'unavailable policy'
          : elapsed !== null
            ? elapsed <= allowed
              ? 'within deadline'
              : 'missed'
            : end(data, input) > at + allowed * hour
              ? 'missed — no response'
              : 'pending';
      entries.push({
        row: {
          assetId: asset.id,
          area: areaName(data, asset),
          noteId: n.id,
          reportedAt: text(n, 'created_at'),
          note: text(n, 'text'),
          responseId: next?.r.id ?? null,
          responseKind: next?.kind ?? null,
          responseAt: next ? new Date(next.at).toISOString() : null,
          elapsedHours: elapsed,
          allowedHours: allowed,
          deadlineAt: allowed === null ? null : new Date(at + allowed * hour).toISOString(),
          metDeadline:
            allowed === null
              ? 'Unavailable'
              : elapsed !== null
                ? elapsed <= allowed
                  ? 'Met'
                  : 'Missed'
                : end(data, input) > at + allowed * hour
                  ? 'Missed'
                  : 'Pending',
          status,
        },
        text: `${asset.id} gas report ${n.id}: ${status}; ${next ? `${next.r.id} after ${elapsed?.toFixed(2)} hours` : 'no subsequent field response recorded'}.`,
        sources: [n.source, ...(next ? [next.r.source] : []), ...policySources(sop)],
      });
    }
  }
  return makeAssessment(
    data,
    input,
    'gas-responses',
    'Gas odor field response assessment',
    [
      col('assetId', 'Well'),
      col('area', 'Area'),
      col('reportedAt', 'Reported', 'timestamp'),
      col('note', 'Operator observation'),
      col('responseId', 'First response'),
      col('responseAt', 'Response start', 'timestamp'),
      col('elapsedHours', 'Hours elapsed', 'decimal'),
      col('allowedHours', 'Deadline hours', 'integer'),
      col('deadlineAt', 'Response deadline', 'timestamp'),
      col('metDeadline', 'Met / Missed'),
      col('status', 'Assessment'),
    ],
    entries,
    valid ? [] : ['OPS-1 response policy missing or unparseable; deadlines cannot be assessed.'],
  );
}

export function assessBypasses(data: OperationalDataset, input: AssessmentInput = {}) {
  const sop = policy(data);
  const memos = data.documents.filter((d) => /Management of Change/.test(d.markdown));
  const approvals = memos.map((doc) => ({
    doc,
    id: doc.markdown.match(/Management of Change[^\n]*?(MOC-\d{4}-\d+)/)?.[1],
    extends: doc.markdown.match(/This memo extends (MOC-\d{4}-\d+)/)?.[1],
    wells: [...new Set(doc.markdown.match(/WELL-\d+/g) ?? [])],
    effective: policyDate(doc.markdown.match(/Effective from ([^.]+)\./)?.[1]),
    expires: policyDate(doc.markdown.match(/approval expires on ([^.]+)\./)?.[1]) + day - 1,
    issued: policyDate(doc.markdown.match(/\*\*Date:\*\* ([^\n]+)/)?.[1]),
  }));
  const warnings: string[] = [];
  if (!sop || !/OPS-2 Temporary bypass/.test(sop.markdown))
    warnings.push('OPS-2 policy missing; bypass assessments unavailable.');
  if (!memos.length || approvals.some((a) => !Number.isFinite(a.expires)))
    warnings.push(
      'Some MOC approvals are missing or unparseable; authorization may be unavailable.',
    );
  const entries: Entry[] = [];
  for (const asset of selectedAssets(data, input)) {
    const notes = sorted(
      byAsset(data.notes, asset.id).filter(
        (n) =>
          text(n, 'note_type') === 'operator_note' &&
          /bypass/i.test(text(n, 'text')) &&
          date(n, 'created_at') <= end(data, input),
      ),
      'created_at',
    );
    let installed: OperationalRecord | undefined;
    const emit = (removed?: OperationalRecord) => {
      if (!installed) return;
      const start = date(installed, 'created_at');
      const stop = removed ? date(removed, 'created_at') : end(data, input);
      if (input.from && stop < Date.parse(input.from)) return;
      const bases = approvals.filter(
        (a) => !a.extends && a.wells.includes(asset.id) && a.issued <= end(data, input),
      );
      const matching = bases.map((a) => {
        const extensions = approvals.filter((e) => e.extends === a.id && e.issued <= stop);
        const extension = extensions.sort((x, y) => y.issued - x.issued)[0];
        return {
          ...a,
          expires: extension?.expires ?? a.expires,
          sources: [a.doc.source, ...(extension ? [extension.doc.source] : [])],
        };
      });
      const approval =
        matching.find((a) => start >= a.effective && start <= a.expires) ?? matching[0];
      const violation = !approval || start < approval.effective || stop > approval.expires;
      const unknown =
        !sop ||
        !memos.length ||
        (!!approval &&
          (!Number.isFinite(approval.expires) || !Number.isFinite(approval.effective)));
      if (removed && !violation && !unknown) return;
      const status = unknown
        ? 'unavailable policy'
        : !approval
          ? 'not approved'
          : start < approval.effective
            ? 'not approved at installation'
            : violation
              ? 'expired'
              : 'allowed';
      entries.push({
        row: {
          assetId: asset.id,
          area: areaName(data, asset),
          installedAt: text(installed, 'created_at'),
          removedAt: removed ? text(removed, 'created_at') : null,
          current: !removed,
          approvalId: approval?.id ?? null,
          effectiveFrom:
            approval && Number.isFinite(approval.effective)
              ? new Date(approval.effective).toISOString().slice(0, 10)
              : null,
          expiresOn:
            approval && Number.isFinite(approval.expires)
              ? new Date(approval.expires).toISOString().slice(0, 10)
              : null,
          status,
        },
        text: `${asset.id}: ${status}, bypass from ${text(installed, 'created_at')} through ${removed ? text(removed, 'created_at') : data.asOf}.`,
        sources: [
          installed.source,
          ...(removed ? [removed.source] : []),
          ...(approval?.sources ?? []),
          ...policySources(sop),
        ],
      });
    };
    for (const n of notes) {
      if (
        /(?:took\s+(?:the\s+)?bypass\s+out|bypass\s+(?:removed|taken out|pulled)|removed\s+(?:the\s+)?bypass)/i.test(
          text(n, 'text'),
        )
      ) {
        emit(n);
        installed = undefined;
      } else if (
        /(?:bypass\s+(?:in place|installed)|put\s+(?:the\s+)?bypass\s+in|installed\s+(?:the\s+)?bypass)/i.test(
          text(n, 'text'),
        )
      )
        installed ??= n;
    }
    emit();
  }
  return makeAssessment(
    data,
    input,
    'bypasses',
    'Current bypasses and historical violations',
    [
      col('assetId', 'Well'),
      col('area', 'Area'),
      col('installedAt', 'Installed', 'timestamp'),
      col('removedAt', 'Removed', 'timestamp'),
      col('current', 'Current', 'boolean'),
      col('approvalId', 'MOC'),
      col('effectiveFrom', 'Effective'),
      col('expiresOn', 'Expiry'),
      col('status', 'Assessment'),
    ],
    entries,
    warnings,
  );
}

export function assessCurrentStatus(
  data: OperationalDataset,
  asset: OperationalRecord,
  cutoff = Date.parse(data.asOf),
) {
  const inspection = sorted(
    byAsset(data.inspections, asset.id).filter((r) => date(r, 'inspected_at') <= cutoff),
    'inspected_at',
  ).at(-1);
  const note = sorted(
    byAsset(data.notes, asset.id).filter(
      (n) =>
        text(n, 'note_type') === 'operator_note' &&
        date(n, 'created_at') <= cutoff &&
        (!text(n, 'valid_to') ||
          Date.parse(`${text(n, 'valid_to').slice(0, 10)}T23:59:59.999Z`) >= cutoff) &&
        /(?:shut[ -]in|shut\s+(?:the\s+)?well\s+in|restart(?:ed)?|started\s+(?:the\s+)?well\s+(?:back\s+)?up)/i.test(
          text(n, 'text'),
        ),
    ),
    'created_at',
  ).at(-1);
  const reading = inspection ? production(data, asset, inspection, cutoff) : null;
  const plugged =
    text(asset, 'status') === 'plugged_and_abandoned' &&
    (!text(asset, 'decommissioned_on') || date(asset, 'decommissioned_on') <= cutoff);
  const noteWins =
    !!note && (!inspection || date(note, 'created_at') > date(inspection, 'inspected_at'));
  const noteProduces =
    !!note && /restart|started\s+(?:the\s+)?well\s+(?:back\s+)?up/i.test(text(note, 'text'));
  const producing = plugged
    ? false
    : noteWins
      ? policy(data)
        ? noteProduces
        : null
      : (reading?.producing ?? null);
  return {
    producing,
    status: plugged
      ? 'plugged'
      : noteWins
        ? noteProduces
          ? 'producing (unconfirmed)'
          : 'not producing (shut in)'
        : producing === null
          ? 'unavailable'
          : producing
            ? 'producing'
            : 'not producing',
    inspection,
    note: noteWins ? note : undefined,
    reading,
    sources: [
      asset.source,
      ...(reading?.sources ?? []),
      ...(noteWins && note ? [note.source] : []),
      ...policySources(policy(data)),
    ],
  };
}

export function assessStatusDisagreements(data: OperationalDataset, input: AssessmentInput = {}) {
  const sop = policy(data);
  const entries: Entry[] = [];
  const warnings: string[] = [];
  if (!sop || !/OPS-3 Status evidence precedence/.test(sop.markdown))
    warnings.push('OPS-3 policy missing; status precedence unavailable.');
  for (const asset of selectedAssets(data, input)) {
    const inspection = sorted(
      byAsset(data.inspections, asset.id).filter(
        (r) => date(r, 'inspected_at') <= end(data, input),
      ),
      'inspected_at',
    ).at(-1);
    const note = sorted(
      byAsset(data.notes, asset.id).filter(
        (n) =>
          text(n, 'note_type') === 'operator_note' &&
          date(n, 'created_at') <= end(data, input) &&
          (!text(n, 'valid_to') ||
            Date.parse(`${text(n, 'valid_to').slice(0, 10)}T23:59:59.999Z`) >= end(data, input)) &&
          /(?:shut[ -]in|shut\s+(?:the\s+)?well\s+in|restart(?:ed)?|started\s+(?:the\s+)?well\s+(?:back\s+)?up)/i.test(
            text(n, 'text'),
          ),
      ),
      'created_at',
    ).at(-1);
    const p = inspection ? production(data, asset, inspection, end(data, input)) : null;
    const plugged =
      text(asset, 'status') === 'plugged_and_abandoned' &&
      (!text(asset, 'decommissioned_on') || date(asset, 'decommissioned_on') <= end(data, input));
    const noteWins =
      note && (!inspection || date(note, 'created_at') > date(inspection, 'inspected_at'));
    const noteProduces = note
      ? /restart|started\s+(?:the\s+)?well\s+(?:back\s+)?up/i.test(text(note, 'text'))
      : false;
    const produces = plugged ? false : noteWins ? noteProduces : (p?.producing ?? null);
    const status = plugged
      ? 'plugged'
      : noteWins
        ? noteProduces
          ? 'producing (unconfirmed)'
          : 'not producing (shut in)'
        : produces === null
          ? 'unavailable'
          : produces
            ? 'producing'
            : 'not producing';
    const recorded = text(asset, 'recorded_status');
    const disagrees =
      !!note && p?.producing !== null && p?.producing !== undefined && p.producing !== noteProduces;
    if (p?.producing === null)
      warnings.push(
        `${asset.id}: applicable production manual or temperature reading unavailable.`,
      );
    if (!disagrees) continue;
    entries.push({
      row: {
        assetId: asset.id,
        recordedStatus: recorded,
        assessedStatus: status,
        latestInspection: inspection?.id ?? null,
        inspectedAt: inspection ? text(inspection, 'inspected_at') : null,
        deltaC: p?.delta ?? null,
        thresholdC: p?.threshold ?? null,
        wellType: p?.type ?? text(asset, 'well_type'),
        inspectionShows:
          p?.producing === null ? 'unavailable' : p?.producing ? 'producing' : 'not producing',
        area: areaName(data, asset),
        operatorNote: note ? text(note, 'text') : null,
        noteAt: note ? text(note, 'created_at') : null,
      },
      text: `${asset.id}: latest inspection ${inspection?.id} indicates ${p?.producing ? 'producing' : 'not producing'}, latest applicable status note ${note?.id} says ${noteProduces ? 'restarted' : 'shut in'}. Current status is ${status} because ${plugged ? 'permanent closure overrides prior readings' : noteWins ? 'the operator status note is newer than the inspection (OPS-3)' : 'the inspection is newer than the operator status note (OPS-3)'}.`,
      sources: [
        asset.source,
        ...(p?.sources ?? []),
        ...(note ? [note.source] : []),
        ...policySources(sop),
      ],
    });
    if (p?.producing === null)
      warnings.push(
        `${asset.id}: applicable production manual or temperature reading unavailable.`,
      );
  }
  return makeAssessment(
    data,
    input,
    'status-disagreements',
    'Inspection and operator status disagreements',
    [
      col('assetId', 'Well'),
      col('area', 'Area'),
      col('inspectionShows', 'Inspection shows'),
      col('recordedStatus', 'Recorded status'),
      col('assessedStatus', 'Evidence status'),
      col('wellType', 'Type at reading'),
      col('inspectedAt', 'Latest reading', 'timestamp'),
      col('deltaC', 'Temperature difference °C', 'decimal'),
      col('thresholdC', 'Manual threshold °C', 'decimal'),
      col('operatorNote', 'Later status note'),
      col('noteAt', 'Note timestamp', 'timestamp'),
    ],
    entries,
    [...new Set(warnings)],
  );
}

export function assessSpillLetter(data: OperationalDataset, input: AssessmentInput = {}) {
  const letter = data.documents.find((doc) =>
    /Letter from the State Oil & Gas Commission/.test(doc.markdown),
  );
  const spillSop = data.documents.find((doc) => /Document ID: SOP-SR/.test(doc.markdown));
  const since = letter?.markdown.match(/since (\d+ \w+ \d{4})/i)?.[1];
  const due = letter?.markdown.match(/submitted by (\d+ \w+ \d{4})/i)?.[1];
  const threshold = letter?.markdown.match(/\((\d+(?:\.\d+)?) bbl or more\)/)?.[1];
  const sentence = letter?.markdown.match(/sentence "([^"]+)"/)?.[1];
  const areas = data.areas
    .filter((a) => letter?.markdown.includes(text(a, 'name')))
    .map((a) => a.id);
  const valid = letter && spillSop && since && due && threshold && sentence && areas.length;
  const entries: Entry[] = [];
  const warnings: string[] = [];
  if (!valid)
    return makeAssessment(
      data,
      input,
      'spill-letter',
      'Regulator letter soil sampling assessment',
      [],
      [],
      [
        'Regulator letter, area scope, date range, reportable threshold, lab sentence or spill SOP missing/unparseable; assessment unavailable.',
      ],
    );
  for (const asset of selectedAssets(data, input).filter((a) =>
    areas.includes(text(a, 'area_id')),
  )) {
    for (const inspection of byAsset(data.inspections, asset.id).filter(
      (r) =>
        date(r, 'inspected_at') >= policyDate(since) &&
        inRange(date(r, 'inspected_at'), data, input),
    )) {
      const c = corrected(data, inspection, end(data, input));
      if (
        !c.raw.spill_detected ||
        typeof c.raw.spill_est_volume_bbl !== 'number' ||
        c.raw.spill_est_volume_bbl < Number(threshold)
      )
        continue;
      const corrections = byAsset(data.notes, asset.id).filter(
        (n) =>
          text(n, 'inspection_id') === inspection.id &&
          /correction|false_positive/.test(text(n, 'note_type')) &&
          date(n, 'created_at') <= end(data, input),
      );
      const falsePositive = corrections.some((n) =>
        /not (?:a )?(?:crude|oil)|(?:water|mud|shadow).*(?:not|false)|false positive/i.test(
          text(n, 'text'),
        ),
      );
      const jobs = byAsset(data.maintenance, asset.id).filter(
        (j) =>
          text(j, 'triggered_by_inspection_id') === inspection.id &&
          date(j, 'started_at') <= end(data, input),
      );
      const reports = jobs.flatMap((j) => {
        const file = text(j, 'report_file');
        return file
          ? data.documents.filter(
              (doc) =>
                doc.source.path.endsWith(file) ||
                doc.id === file ||
                doc.source.path.endsWith(`/${file.split('/').at(-1)}`),
            )
          : [];
      });
      const labReports = reports.filter((doc) => {
        const section = doc.markdown.match(
          /(?:^|\n)##?\s+Spill clean-up and waste[^\n]*\n([\s\S]*?)(?=\n##?\s|$)/i,
        )?.[1];
        return section?.includes(sentence);
      });
      const status = falsePositive
        ? 'excluded — confirmed not crude oil'
        : labReports.length
          ? 'lab sentence documented'
          : end(data, input) > policyDate(due) + day - 1
            ? 'missing lab evidence — overdue'
            : 'missing lab evidence — due';
      entries.push({
        row: {
          assetId: asset.id,
          area: areaName(data, asset),
          inspectionId: inspection.id,
          discoveredAt: text(inspection, 'inspected_at'),
          volumeBbl: c.raw.spill_est_volume_bbl,
          deadline: new Date(policyDate(due)).toISOString().slice(0, 10),
          status,
          cleanupJobs: jobs.map((j) => j.id),
          cleanupReports: reports.map((d) => d.id),
        },
        text: `${asset.id} spill ${inspection.id}: ${status}. Required lab evidence by ${due}.`,
        sources: [
          ...c.sources,
          ...corrections.map((n) => n.source),
          ...jobs.map((j) => j.source),
          ...reports.map((d) => d.source),
          letter.source,
          spillSop.source,
        ],
      });
      if (!falsePositive && jobs.some((j) => text(j, 'report_file') && !reports.length))
        warnings.push(`${inspection.id}: linked clean-up report unavailable.`);
    }
  }
  return makeAssessment(
    data,
    input,
    'spill-letter',
    'Regulator letter soil sampling assessment',
    [
      col('assetId', 'Well'),
      col('area', 'Area'),
      col('inspectionId', 'Spill inspection'),
      col('discoveredAt', 'Discovered', 'timestamp'),
      col('volumeBbl', 'Corrected volume bbl', 'decimal'),
      col('deadline', 'Results due'),
      col('status', 'Lab evidence'),
      col('cleanupJobs', 'Linked clean-up jobs'),
    ],
    entries,
    warnings,
  );
}

export function assessFreezeChecks(data: OperationalDataset, input: AssessmentInput = {}) {
  const sop = policy(data);
  const section = sop?.markdown.match(/## OPS-5[\s\S]*?(?=\n## |$)/)?.[0];
  const cutoff = section?.match(/at or below\s*\*\*[−-](\d+(?:\.\d+)?)\s*°C/);
  const days = section?.match(/within\s*\*\*(\d+) days/);
  if (!sop || !cutoff || !days || !/1 Dec.*28 Feb/.test(section ?? ''))
    return makeAssessment(
      data,
      input,
      'freeze-checks',
      'Freeze protection checks',
      [],
      [],
      ['OPS-5 freeze policy missing/unparseable; assessment unavailable.'],
    );
  const entries: Entry[] = [];
  const warnings: string[] = [];
  const effective = policyDate(sop.markdown.match(/Revision 2 · Effective (\d+ \w+ \d{4})/)?.[1]);
  for (const asset of selectedAssets(data, input)) {
    for (const inspection of byAsset(data.inspections, asset.id).filter(
      (r) =>
        inRange(date(r, 'inspected_at'), data, input) &&
        (!Number.isFinite(effective) || date(r, 'inspected_at') >= effective) &&
        [11, 0, 1].includes(new Date(date(r, 'inspected_at')).getUTCMonth()),
    )) {
      const p = production(data, asset, inspection, end(data, input));
      if (typeof p.ambient !== 'number' || p.ambient > -Number(cutoff[1])) continue;
      if (p.producing === null) {
        warnings.push(
          `${inspection.id}: producing status unavailable; cannot assess freeze check requirement.`,
        );
        continue;
      }
      if (!p.producing) continue;
      if (
        text(asset, 'status') === 'plugged_and_abandoned' &&
        date(asset, 'decommissioned_on') <= date(inspection, 'inspected_at')
      )
        continue;
      const at = date(inspection, 'inspected_at');
      const job = sorted(
        byAsset(data.maintenance, asset.id).filter(
          (j) =>
            /Heat trace check/i.test(text(j, 'issue')) &&
            date(j, 'started_at') >= at &&
            date(j, 'started_at') <= end(data, input),
        ),
        'started_at',
      )[0];
      const deadline = at + Number(days[1]) * day;
      const status = job
        ? date(job, 'started_at') <= deadline
          ? 'within deadline'
          : 'late check'
        : end(data, input) > deadline
          ? 'missed — no check'
          : 'pending';
      entries.push({
        row: {
          assetId: asset.id,
          inspectionId: inspection.id,
          inspectedAt: text(inspection, 'inspected_at'),
          ambientC: p.ambient,
          deltaC: p.delta,
          wellType: p.type,
          dueAt: new Date(deadline).toISOString(),
          checkId: job?.id ?? null,
          checkAt: job ? text(job, 'started_at') : null,
          status,
        },
        text: `${asset.id} cold producing reading ${inspection.id}: ${status}; heat trace check due ${new Date(deadline).toISOString()}.`,
        sources: [asset.source, ...p.sources, ...(job ? [job.source] : []), sop.source],
      });
    }
  }
  return makeAssessment(
    data,
    input,
    'freeze-checks',
    'Freeze protection checks',
    [
      col('assetId', 'Well'),
      col('inspectionId', 'Cold reading'),
      col('inspectedAt', 'Reading time', 'timestamp'),
      col('ambientC', 'Ambient °C', 'decimal'),
      col('deltaC', 'Difference °C', 'decimal'),
      col('wellType', 'Type at reading'),
      col('dueAt', 'Check due', 'timestamp'),
      col('checkId', 'Heat trace job'),
      col('checkAt', 'Check start', 'timestamp'),
      col('status', 'Assessment'),
    ],
    entries,
    warnings,
  );
}
