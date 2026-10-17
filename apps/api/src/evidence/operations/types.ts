import { createHash } from 'node:crypto';
import type { Source } from '../types.js';

export type OperationalRecord = { id: string; raw: Record<string, unknown>; source: Source };
export type OperationalDocument = { id: string; markdown: string; source: Source };
export type OperationalDataset = {
  asOf: string;
  assets: OperationalRecord[];
  inspections: OperationalRecord[];
  maintenance: OperationalRecord[];
  notes: OperationalRecord[];
  areas: OperationalRecord[];
  teams: OperationalRecord[];
  users: OperationalRecord[];
  documents: OperationalDocument[];
};
export type AssessmentInput = {
  assetIds?: string[];
  area?: string;
  team?: string;
  from?: string;
  through?: string;
  limit?: number;
};
export type AssessmentColumn = {
  key: string;
  label: string;
  valueType: 'string' | 'decimal' | 'integer' | 'boolean' | 'timestamp';
  unit?: string;
};
export type AssessmentRow = Record<string, string | number | boolean | null | string[]>;
export type OperationalAssessment = {
  topic: string;
  title: string;
  columns: AssessmentColumn[];
  rows: AssessmentRow[];
  facts: { text: string; sourceIds: string[] }[];
  sources: Source[];
  warnings: string[];
  coverage: {
    kind: string;
    assetsEvaluated: number;
    totalRows: number;
    returnedRows: number;
    truncated: boolean;
  };
  executedParameters?: AssessmentInput & { topic: string };
  inputSourceManifestHash?: string;
  governingEvidence?: { id: string; text: string }[];
  summary?: { totalRows: number; returnedRows: number; outcomes: Record<string, number> };
};
export const text = (record: OperationalRecord, key: string): string =>
  String(record.raw[key] ?? '');
export const date = (record: OperationalRecord, key: string): number =>
  Date.parse(text(record, key));
export function areaName(data: OperationalDataset, asset: OperationalRecord) {
  const area = data.areas.find((area) => area.id === text(asset, 'area_id'));
  return area ? text(area, 'name') : text(asset, 'area_id');
}
export function selectedAssets(data: OperationalDataset, input: AssessmentInput) {
  return data.assets.filter(
    (asset) =>
      (!input.assetIds || input.assetIds.includes(asset.id)) &&
      (!input.area ||
        [text(asset, 'area_id'), areaName(data, asset)].some(
          (v) => v.toLowerCase() === input.area?.toLowerCase(),
        )) &&
      (!input.team ||
        [
          text(asset, 'team_id'),
          ...data.teams
            .filter((team) => team.id === text(asset, 'team_id'))
            .map((team) => text(team, 'name')),
        ].some((v) => v.toLowerCase() === input.team?.toLowerCase())),
  );
}
export function makeAssessment(
  data: OperationalDataset,
  input: AssessmentInput,
  topic: string,
  title: string,
  columns: AssessmentColumn[],
  entries: { row: AssessmentRow; text: string; sources: Source[] }[],
  warnings: string[] = [],
): OperationalAssessment {
  const limit = Math.min(500, input.limit ?? 100);
  const shown = entries.slice(0, limit);
  const allSources = [
    ...new Map(
      entries.flatMap((entry) => entry.sources).map((source) => [source.id, source]),
    ).values(),
  ];
  const sources = [
    ...new Map(
      shown.flatMap((entry) => entry.sources).map((source) => [source.id, source]),
    ).values(),
  ];
  const outcomes: Record<string, number> = {};
  for (const entry of entries) {
    const status =
      entry.row.metDeadline ?? entry.row.status ?? entry.row.assessedStatus ?? entry.row.compliant;
    if (status !== undefined && status !== null) {
      const key = String(status);
      outcomes[key] = (outcomes[key] ?? 0) + 1;
    }
  }
  return {
    topic,
    title,
    columns,
    rows: shown.map((entry) => ({
      ...entry.row,
      _sourceIds: entry.sources.map((source) => source.id),
    })),
    facts: [
      {
        text: `${title}: ${entries.length} matching records across ${selectedAssets(data, input).length} evaluated wells, as of ${data.asOf}.`,
        sourceIds: sources.map((source) => source.id),
      },
      ...shown.map((entry) => ({
        text: entry.text,
        sourceIds: entry.sources.map((source) => source.id),
      })),
    ],
    sources,
    warnings,
    summary: { totalRows: entries.length, returnedRows: shown.length, outcomes },
    inputSourceManifestHash: createHash('sha256')
      .update(JSON.stringify(allSources.sort((a, b) => a.id.localeCompare(b.id))))
      .digest('hex'),
    governingEvidence: data.documents
      .filter(
        (document) =>
          sources.some((source) => source.id === document.id) &&
          !/maintenance-reports\//.test(document.source.path),
      )
      .map((document) => ({ id: document.id, text: document.markdown })),
    coverage: {
      kind: 'complete-filtered-input',
      assetsEvaluated: selectedAssets(data, input).length,
      totalRows: entries.length,
      returnedRows: shown.length,
      truncated: shown.length < entries.length,
    },
  };
}
