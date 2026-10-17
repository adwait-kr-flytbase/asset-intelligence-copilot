import type { Source } from '../types.js';
import { assessCurrentStatus } from './compliance.js';
import {
  type AssessmentInput,
  areaName,
  makeAssessment,
  type OperationalAssessment,
  type OperationalDataset,
  type OperationalRecord,
  text,
} from './types.js';

const cutoff = (value: string) =>
  Date.parse(value.length === 10 ? `${value}T23:59:59.999Z` : value);
const objects = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
    : [];

/** Well ownership overrides area defaults; historical ownership is evaluated at the dataset date. */
function teamId(data: OperationalDataset, asset: OperationalRecord): string {
  const current = objects(asset.raw.team_history)
    .filter(
      (h) =>
        Date.parse(String(h.from)) <= cutoff(data.asOf) &&
        (!h.to || cutoff(String(h.to)) >= cutoff(data.asOf)),
    )
    .sort((a, b) => Date.parse(String(b.from)) - Date.parse(String(a.from)))[0];
  return String(
    current?.team_id ??
      asset.raw.team_id ??
      data.areas.find((a) => a.id === text(asset, 'area_id'))?.raw.team_id ??
      '',
  );
}
function assetsFor(data: OperationalDataset, input: AssessmentInput) {
  return data.assets.filter(
    (asset) =>
      (!input.assetIds || input.assetIds.includes(asset.id)) &&
      (!input.area ||
        [text(asset, 'area_id'), areaName(data, asset)].some(
          (v) => v.toLowerCase() === input.area!.toLowerCase(),
        )) &&
      (!input.team ||
        [
          teamId(data, asset),
          ...data.teams.filter((t) => t.id === teamId(data, asset)).map((t) => text(t, 'name')),
        ].some((v) => v.toLowerCase() === input.team!.toLowerCase())),
  );
}
function coverage(result: OperationalAssessment, count: number) {
  result.coverage.assetsEvaluated = count;
  // makeAssessment uses generic metadata ownership; use this module's historical ownership count.
  if (result.facts[0])
    result.facts[0].text = `${result.title}: ${result.coverage.totalRows} matching records across ${count} evaluated wells.`;
  return result;
}

export type PumpRecallInput = AssessmentInput & { currentStatus?: 'not-producing' | 'producing' };

export function assessPumpRecall(
  data: OperationalDataset,
  input: PumpRecallInput,
): OperationalAssessment {
  const assets = assetsFor(data, input);
  const notices = data.documents.filter(
    (d) => /recall/i.test(d.markdown) && /manufacturing lots/i.test(d.markdown),
  );
  const notice = notices.sort((a, b) => b.source.path.localeCompare(a.source.path))[0];
  if (!notice)
    return coverage(
      makeAssessment(
        data,
        input,
        'pump_recall',
        'Current pump recall exposure',
        [],
        [],
        ['No supplier recall notice is available; recall exposure cannot be determined.'],
      ),
      assets.length,
    );
  const affectedSection =
    notice.markdown.match(/## What is recalled\s+([\s\S]*?)(?=\n## |$)/i)?.[1] ?? '';
  const affectedLots = [...affectedSection.matchAll(/^\s*-\s*(LOT-[\w-]+)/gm)].map((m) => m[1]!);
  const recalledModel = affectedSection.match(/([A-Za-z][\w-]*\s+RP-[\w-]+)\s+downhole/i)?.[1];
  const warnings: string[] = [];
  if (!affectedLots.length || !recalledModel)
    warnings.push(
      'Recall model or affected lots could not be parsed; no positive exposure is asserted.',
    );
  const jobs = new Map<string, OperationalRecord[]>();
  for (const job of data.maintenance) {
    const id = text(job, 'asset_id');
    const list = jobs.get(id) ?? [];
    list.push(job);
    jobs.set(id, list);
  }
  const docs = new Map(data.documents.map((d) => [d.source.path.replaceAll('\\', '/'), d]));
  const missing: string[] = [];
  const entries: Parameters<typeof makeAssessment>[5] = [];
  for (const asset of assets) {
    if (
      (text(asset, 'status') === 'plugged_and_abandoned' ||
        text(asset, 'recorded_status') === 'plugged') &&
      (!text(asset, 'decommissioned_on') ||
        cutoff(text(asset, 'decommissioned_on')) <= cutoff(data.asOf))
    )
      continue;
    if (objects(asset.raw.equipment).some((e) => e.kind === 'esp_pump')) continue;
    const history = (jobs.get(asset.id) ?? [])
      .filter((job) => {
        const completed = Date.parse(text(job, 'completed_at'));
        return (
          Number.isFinite(completed) &&
          completed <= cutoff(data.asOf) &&
          (!text(job, 'recorded_at') || Date.parse(text(job, 'recorded_at')) <= cutoff(data.asOf))
        );
      })
      .sort(
        (a, b) =>
          Date.parse(text(b, 'completed_at')) - Date.parse(text(a, 'completed_at')) ||
          b.id.localeCompare(a.id),
      );
    for (const job of history) {
      const file = text(job, 'report_file').replaceAll('\\', '/').replace(/^\.\//, '');
      const metadataDir = asset.source.path.replaceAll('\\', '/').replace(/\/[^/]+$/, '');
      const report = file
        ? (docs.get(`${metadataDir}/${file}`) ??
          [...docs.values()].find((d) =>
            d.source.path.replaceAll('\\', '/').endsWith(`/assets/${asset.id}/${file}`),
          ))
        : undefined;
      const parts = report?.markdown.match(/^\*\*Parts installed:\*\*\s*(.+)$/im)?.[1];
      const isReplacement =
        /downhole_pump|esp_pump/.test(text(job, 'equipment_kind')) &&
        /(?:replac\w*.*pump|pump.*replac\w*|ran in a new.*pump)/i.test(
          `${text(job, 'action_taken')} ${report?.markdown ?? ''}`,
        );
      if ((!parts || !/pump/i.test(parts)) && !isReplacement) continue;
      if (!parts) {
        missing.push(
          `${asset.id}: latest completed pump replacement ${job.id} lacks an accessible Parts installed line.`,
        );
        break;
      }
      const lot = parts.match(/\bLOT-[\w-]+/i)?.[0] ?? '';
      const affected =
        !!recalledModel &&
        parts.toLowerCase().includes(recalledModel.toLowerCase()) &&
        affectedLots.includes(lot);
      if (affected) {
        const status = assessCurrentStatus(data, asset, cutoff(data.asOf));
        if (input.currentStatus && status.producing !== (input.currentStatus === 'producing'))
          break;
        const lastRepair = history.find((j) => text(j, 'maintenance_type') === 'corrective');
        const cost = job.raw.cost_usd as Record<string, unknown> | undefined;
        entries.push({
          row: {
            assetId: asset.id,
            well: text(asset, 'name'),
            area: areaName(data, asset),
            pump: parts,
            lot,
            installationJob: job.id,
            installedAt: text(job, 'completed_at'),
            installationCostUsd: typeof cost?.total === 'number' ? cost.total : null,
            recordedStatus: text(asset, 'recorded_status'),
            currentStatus: status.status,
            lastRepair: lastRepair?.id ?? null,
            lastRepairedAt: lastRepair ? text(lastRepair, 'completed_at') : null,
            recallStatus: 'affected-current-installation',
          },
          text: `${asset.id} (${areaName(data, asset)}): current installed pump ${parts}; installed by ${job.id}, completed ${text(job, 'completed_at')}; current oil status: ${status.status}; last completed corrective repair: ${lastRepair ? `${lastRepair.id} (${text(lastRepair, 'completed_at')})` : 'unavailable'}. Supplier notice requires replacement; the notice alone does not require shutting in the well.`,
          sources: [
            asset.source,
            job.source,
            report!.source,
            notice.source,
            ...status.sources,
            ...(lastRepair ? [lastRepair.source] : []),
          ],
        });
      }
      break; // A later installation, including an unaffected lot, supersedes every older pump.
    }
  }
  if (missing.length)
    warnings.push(
      `${missing.length} wells have unresolved latest pump identification: ${missing.slice(0, 10).join(' ')}`,
    );
  const result = coverage(
    makeAssessment(
      data,
      input,
      'pump_recall',
      'Current pump recall exposure',
      [
        { key: 'assetId', label: 'Well', valueType: 'string' },
        { key: 'area', label: 'Area', valueType: 'string' },
        { key: 'pump', label: 'Current installed pump', valueType: 'string' },
        { key: 'lot', label: 'Lot', valueType: 'string' },
        { key: 'installationJob', label: 'Installation job', valueType: 'string' },
        { key: 'installedAt', label: 'Installed', valueType: 'timestamp' },
        {
          key: 'installationCostUsd',
          label: 'Installation job cost',
          valueType: 'decimal',
          unit: 'USD',
        },
        { key: 'currentStatus', label: 'Current oil production status', valueType: 'string' },
        { key: 'lastRepair', label: 'Last completed corrective repair', valueType: 'string' },
        { key: 'lastRepairedAt', label: 'Last repair completed', valueType: 'timestamp' },
      ],
      entries,
      warnings,
    ),
    assets.length,
  );
  if (!result.sources.some((s) => s.id === notice.source.id)) result.sources.push(notice.source);
  result.facts.push({
    text: `Recall scope: ${recalledModel ?? 'unparsed model'}, lots ${affectedLots.join(', ')}. Current completed installations determine exposure; future planned completion dates do not establish installation. See supplier notice for deadline and operating instructions.`,
    sourceIds: [notice.source.id],
  });
  return result;
}

export function assessTeamDirectory(
  data: OperationalDataset,
  input: AssessmentInput,
): OperationalAssessment {
  const assets = assetsFor(data, input);
  const entries: Parameters<typeof makeAssessment>[5] = [];
  for (const team of data.teams) {
    if (
      input.team &&
      ![team.id, text(team, 'name')].some((v) => v.toLowerCase() === input.team!.toLowerCase())
    )
      continue;
    const wells = assets.filter((asset) => teamId(data, asset) === team.id);
    if ((input.area || input.assetIds) && !wells.length) continue;
    const lead = data.users.find((u) => u.id === text(team, 'lead_user_id'));
    const members = data.users.filter((u) => text(u, 'team_id') === team.id);
    entries.push({
      row: {
        teamId: team.id,
        team: text(team, 'name'),
        lead: lead ? text(lead, 'name') : text(team, 'lead_user_id'),
        leadUserId: text(team, 'lead_user_id'),
        wellCount: wells.length,
        members: members.map((u) => `${text(u, 'name')} (${u.id}; ${text(u, 'role')})`),
      },
      text: `${text(team, 'name')} (${team.id}) is led by ${lead ? text(lead, 'name') : text(team, 'lead_user_id')} and owns ${wells.length} wells as of ${data.asOf}.`,
      sources: [
        team.source,
        ...(lead ? [lead.source] : []),
        ...members.map((u) => u.source),
        ...wells.map((w) => w.source),
      ],
    });
  }
  return coverage(
    makeAssessment(
      data,
      input,
      'team_directory',
      'Team directory and current well ownership',
      [
        { key: 'team', label: 'Team', valueType: 'string' },
        { key: 'lead', label: 'Team lead', valueType: 'string' },
        { key: 'wellCount', label: 'Wells currently assigned', valueType: 'integer' },
        { key: 'members', label: 'Members', valueType: 'string' },
      ],
      entries,
    ),
    assets.length,
  );
}

export type OperationalRecordInput = AssessmentInput & {
  kind?: 'operator_note' | 'note' | 'maintenance' | 'inspection';
  query?: string;
  topic?: string;
};
/** Literal structured-record search. Operator-note prose is returned verbatim, never paraphrased. */
export function inspectOperationalRecords(
  data: OperationalDataset,
  input: OperationalRecordInput,
): OperationalAssessment {
  const assets = assetsFor(data, input);
  const ids = new Set(assets.map((a) => a.id));
  const kind = input.kind ?? 'operator_note';
  const records =
    kind === 'maintenance'
      ? data.maintenance
      : kind === 'inspection'
        ? data.inspections
        : data.notes;
  const terms = [input.query, input.topic]
    .filter((v): v is string => !!v?.trim())
    .map((v) => v.toLowerCase().trim());
  const rows = records
    .filter((record) => {
      if (!ids.has(text(record, 'asset_id'))) return false;
      if (kind === 'operator_note' && text(record, 'note_type') !== 'operator_note') return false;
      const when = Date.parse(
        text(
          record,
          kind === 'maintenance'
            ? 'started_at'
            : kind === 'inspection'
              ? 'inspected_at'
              : 'created_at',
        ),
      );
      if (
        !Number.isFinite(when) ||
        when > cutoff(data.asOf) ||
        (input.from && when < Date.parse(input.from)) ||
        (input.through && when > cutoff(input.through))
      )
        return false;
      const haystack = JSON.stringify(record.raw).toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const entries = rows.map((record) => {
    const quote =
      kind === 'maintenance'
        ? `${text(record, 'issue')}\n${text(record, 'action_taken')}`
        : kind === 'inspection'
          ? JSON.stringify(record.raw)
          : text(record, 'text');
    return {
      row: {
        recordId: record.id,
        assetId: text(record, 'asset_id'),
        kind: text(record, 'note_type') || kind,
        date: text(
          record,
          kind === 'maintenance'
            ? 'started_at'
            : kind === 'inspection'
              ? 'inspected_at'
              : 'created_at',
        ),
        author: text(record, 'author_user_id'),
        quote,
      },
      text: `${record.id} (${text(record, 'asset_id')}): ${quote}`,
      sources: [record.source] as Source[],
    };
  });
  const result = coverage(
    makeAssessment(
      data,
      { ...input, limit: input.limit ?? 40 },
      'operational_records',
      'Structured operational record search',
      [
        { key: 'recordId', label: 'Record', valueType: 'string' },
        { key: 'assetId', label: 'Well', valueType: 'string' },
        { key: 'date', label: 'Date', valueType: 'timestamp' },
        { key: 'quote', label: 'Exact recorded text', valueType: 'string' },
      ],
      entries,
    ),
    assets.length,
  );
  // Discovery output must stay bounded even when thousands of records match.
  const shownIds = new Set(
    result.rows.flatMap((r) => (Array.isArray(r._sourceIds) ? r._sourceIds : [])),
  );
  result.sources = result.sources.filter((s) => shownIds.has(s.id));
  if (result.facts[0]) result.facts[0].sourceIds = result.sources.map((s) => s.id);
  result.warnings.push(
    'Search uses literal case-insensitive query/topic substrings in structured JSON; an empty result does not establish absence of synonymous observations.',
  );
  return result;
}
