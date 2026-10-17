import { createHash } from 'node:crypto';
import { deriveProduction, isFalsePositiveCorrection, readTemperatureRule } from './rules.js';
import type { Source } from './types.js';

export type FleetAsset = {
  id: string;
  name: string;
  wellType: string;
  areaId: string;
  area: string;
  lat: string;
  lon: string;
  source: Source;
  manual: string | null;
  manualSource: Source | null;
};
export type InspectionRecord = {
  id: string;
  assetId: string;
  at: string;
  ambientC: string;
  wellheadC: string;
  spill: boolean;
  volumeBbl: string | null;
  notes: string;
  source: Source;
};
export type JobRecord = {
  id: string;
  assetId: string;
  startedAt: string;
  equipmentKind: string;
  type: string;
  totalUsd: string;
  reportId: string | null;
  inspectionId: string | null;
  issue: string;
  source: Source;
};
export type CorrectionRecord = { id: string; inspectionId: string; text: string; source: Source };
export type FleetSelection = { assetId?: string; assetIds?: string[]; area?: string };
export type DateWindow = { from: string; through: string };
/** Safe, actionable selection feedback for the agent; never includes record contents. */
export class InvalidEquipmentCategoryError extends Error {}
export type AnalysisInput = FleetSelection & {
  metric:
    | 'current-status'
    | 'temperature-history'
    | 'downtime'
    | 'spills'
    | 'repair-costs'
    | 'repeat-repairs';
  window?: DateWindow;
  equipmentKind?: string;
  onlyNonProducing?: boolean;
  groupBy?: 'asset' | 'area-month';
  limit: number;
};
export interface AnalyticsReader {
  assets(selection: FleetSelection, signal?: AbortSignal): Promise<FleetAsset[]>;
  inspections(
    selection: FleetSelection,
    window: DateWindow | null,
    asOf: string,
    signal?: AbortSignal,
  ): Promise<InspectionRecord[]>;
  jobs(selection: FleetSelection, window: DateWindow, signal?: AbortSignal): Promise<JobRecord[]>;
  corrections(
    selection: FleetSelection,
    asOf: string,
    signal?: AbortSignal,
  ): Promise<CorrectionRecord[]>;
  records(
    assetId: string,
    window: DateWindow,
    signal?: AbortSignal,
  ): Promise<{ records: unknown[]; sources: Source[]; coverage?: Record<string, unknown> }>;
}

export function sumDecimals(values: string[]) {
  const scale = Math.max(0, ...values.map((value) => (value.split('.')[1] ?? '').length));
  const total = values.reduce((sum, value) => {
    if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error('Invalid amount.');
    const [whole, fraction = ''] = value.split('.');
    return sum + BigInt(`${whole}${fraction.padEnd(scale, '0')}`);
  }, 0n);
  const digits = total.toString().padStart(scale + 1, '0');
  return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
}

export function createAnalyticsService(reader: AnalyticsReader, asOf: string) {
  return {
    listAssets: async (selection: FleetSelection, signal?: AbortSignal) =>
      (await reader.assets(selection, signal)).filter(
        (asset) => !selection.assetIds || selection.assetIds.includes(asset.id),
      ),
    records: (assetId: string, window: DateWindow, signal?: AbortSignal) =>
      reader.records(assetId, window, signal),
    async analyze(input: AnalysisInput, signal?: AbortSignal) {
      if (input.metric !== 'current-status' && !input.window)
        throw new Error('An explicit inclusive UTC date window is required.');
      if (input.window && input.window.from > input.window.through)
        throw new Error('Date window is reversed.');
      const assets = (await reader.assets(input, signal)).filter(
        (asset) => !input.assetIds || input.assetIds.includes(asset.id),
      );
      if (!assets.length)
        return {
          metric: input.metric,
          status: 'unresolved-selection',
          rows: [],
          sources: [],
          warnings: [
            'No assets matched this selection. Resolve the asset or area with listAssets; this does not mean zero activity.',
          ],
          coverage: {
            kind: 'unresolved-selection',
            assetsEvaluated: 0,
            totalRows: 0,
            returnedRows: 0,
            truncated: false,
          },
        };
      const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
      const sources = new Map<string, Source>();
      const warnings: string[] = [];
      const add = (source: Source | null) => {
        if (source) sources.set(source.id, source);
      };
      const rows: Record<string, unknown>[] = [];
      if (input.metric === 'repair-costs' || input.metric === 'repeat-repairs') {
        const jobs = (await reader.jobs(input, input.window as DateWindow, signal)).filter((job) =>
          assetMap.has(job.assetId),
        );
        const equipmentKinds = [...new Set(jobs.map((job) => job.equipmentKind))].sort();
        if (input.equipmentKind && jobs.length && !equipmentKinds.includes(input.equipmentKind))
          throw new InvalidEquipmentCategoryError(
            `No repair equipment category matches "${input.equipmentKind}". Available categories in this selection: ${equipmentKinds.join(', ')}. Omit equipmentKind to compare all repairs across wells; a well is the asset, not a repair equipment category.`,
          );
        for (const asset of assets) {
          const selected = jobs.filter(
            (job) =>
              job.assetId === asset.id &&
              (!input.equipmentKind || job.equipmentKind === input.equipmentKind) &&
              (input.metric !== 'repeat-repairs' || job.type === 'corrective'),
          );
          if (input.metric === 'repeat-repairs') {
            for (const equipmentKind of [...new Set(selected.map((job) => job.equipmentKind))]) {
              const group = selected.filter((job) => job.equipmentKind === equipmentKind);
              rows.push({
                assetId: asset.id,
                name: asset.name,
                equipmentKind,
                correctiveEvents: group.length,
                maintenanceIds: group.map((job) => job.id),
                sources: group.map((job) => job.source),
              });
            }
          } else
            rows.push({
              assetId: asset.id,
              name: asset.name,
              totalUsd: sumDecimals(selected.map((job) => job.totalUsd)),
              jobCount: selected.length,
              sources: selected.map((job) => job.source),
            });
        }
        rows.sort(
          (a, b) =>
            Number(b.totalUsd ?? b.correctiveEvents) - Number(a.totalUsd ?? a.correctiveEvents) ||
            String(a.assetId).localeCompare(String(b.assetId)),
        );
      } else {
        const inspections = (
          await reader.inspections(
            input,
            input.metric === 'current-status' ? null : (input.window as DateWindow),
            asOf,
            signal,
          )
        ).filter((record) => assetMap.has(record.assetId));
        const correctionAudit: {
          inspectionId: string;
          assetId: string;
          action: 'excluded-false-positive' | 'unresolved';
          reason: string;
          originalVolumeBbl: string | null;
          sources: Source[];
        }[] = [];
        const corrections = await reader.corrections(input, asOf, signal);
        const corrected = new Map<string, CorrectionRecord[]>();
        for (const correction of corrections)
          corrected.set(correction.inspectionId, [
            ...(corrected.get(correction.inspectionId) ?? []),
            correction,
          ]);
        if (input.metric === 'spills') {
          let excluded = 0;
          const events = inspections
            .filter((record) => record.spill)
            .filter((record) => {
              const changes = corrected.get(record.id) ?? [];
              // Only explicit imported formal false-positive corrections are interpreted.
              if (changes.some((change) => isFalsePositiveCorrection(change.text))) {
                excluded++;
                for (const change of changes) add(change.source);
                correctionAudit.push({
                  inspectionId: record.id,
                  assetId: record.assetId,
                  action: 'excluded-false-positive',
                  reason: changes.map((change) => change.text).join(' '),
                  originalVolumeBbl: record.volumeBbl,
                  sources: [record.source, ...changes.map((change) => change.source)],
                });
                return false;
              }
              if (changes.length) {
                correctionAudit.push({
                  inspectionId: record.id,
                  assetId: record.assetId,
                  action: 'unresolved',
                  reason: 'Unsupported correction; original retained and totals provisional.',
                  originalVolumeBbl: record.volumeBbl,
                  sources: [record.source, ...changes.map((change) => change.source)],
                });
                warnings.push(
                  `Uninterpreted correction for ${record.id}; original spill estimate retained, totals provisional.`,
                );
              }
              return true;
            });
          if (input.groupBy === 'area-month') {
            const groups = new Map<string, InspectionRecord[]>();
            for (const event of events) {
              const key = `${assetMap.get(event.assetId)?.areaId}|${event.at.slice(0, 7)}`;
              groups.set(key, [...(groups.get(key) ?? []), event]);
            }
            for (const [key, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
              const [areaId, month] = key.split('|');
              rows.push({
                areaId,
                month,
                count: group.length,
                totalBbl: sumDecimals(
                  group.flatMap((record) => (record.volumeBbl ? [record.volumeBbl] : [])),
                ),
                sources: group.map((record) => record.source),
              });
            }
          } else
            for (const event of events) {
              const asset = assetMap.get(event.assetId);
              rows.push({
                assetId: event.assetId,
                name: asset?.name,
                inspectionId: event.id,
                observedAt: event.at,
                volumeBbl: event.volumeBbl,
                lat: asset?.lat,
                lon: asset?.lon,
                sources: [event.source, ...(asset ? [asset.source] : [])],
              });
            }
          for (const change of correctionAudit) for (const source of change.sources) add(source);
          const allSources = [
            ...inspections.map((row) => row.source),
            ...assets.map((row) => row.source),
            ...corrections.map((row) => row.source),
          ];
          const sourceVersions = [
            ...new Map(
              allSources.map((source) => [
                source.sourceId,
                { sourceId: source.sourceId, path: source.path },
              ]),
            ).values(),
          ];
          const lineage = {
            inputHash: createHash('sha256')
              .update(
                JSON.stringify({
                  inspections,
                  corrections,
                  assets: assets.map(({ manual, ...asset }) => asset),
                }),
              )
              .digest('hex'),
            inputRecords: inspections.length,
            sourceVersions,
          };
          const unknownVolumeEvents = events.filter((event) => event.volumeBbl === null).length;
          if (unknownVolumeEvents)
            warnings.push(
              `${unknownVolumeEvents} effective spills have unknown volume; totalBbl is the known-volume sum.`,
            );
          const shown = rows.slice(0, input.limit);
          for (const row of shown) for (const source of row.sources as Source[]) add(source);
          return {
            metric: input.metric,
            window: input.window,
            asOf,
            rows: shown,
            correctionAudit,
            lineage,
            totals: {
              unknownVolumeEvents,
              spillCount: events.length,
              totalBbl: sumDecimals(
                events.flatMap((event) => (event.volumeBbl ? [event.volumeBbl] : [])),
              ),
              excludedFalsePositives: excluded,
            },
            coverage: {
              kind: 'complete-filtered-input',
              assetsEvaluated: assets.length,
              inspectionsEvaluated: inspections.length,
              totalRows: rows.length,
              returnedRows: shown.length,
              truncated: rows.length > shown.length,
            },
            sources: [...sources.values()],
            warnings,
            presentation: {
              kind: input.groupBy === 'area-month' ? 'heatmap' : 'table',
              available: input.groupBy === 'area-month' ? ['heatmap', 'table'] : ['table', 'map'],
            },
          };
        }
        for (const asset of assets) {
          const rule = asset.manual && readTemperatureRule(asset.manual);
          const records = inspections
            .filter((record) => record.assetId === asset.id)
            .sort((a, b) => a.at.localeCompare(b.at));
          if (!rule) {
            warnings.push(
              `Production rule unavailable for ${asset.id}; excluded from classified metrics.`,
            );
            continue;
          }
          const classify = (record: InspectionRecord) => {
            const changes = corrected.get(record.id) ?? [];
            const ambiguous = changes.filter((change) => !isFalsePositiveCorrection(change.text));
            for (const change of changes) add(change.source);
            if (ambiguous.length) {
              warnings.push(`Uninterpreted correction on ${record.id}; production unknown.`);
              return null;
            }
            return deriveProduction(record.ambientC, record.wellheadC, rule.thresholdC);
          };
          if (input.metric === 'current-status') {
            const latest = records.at(-1);
            const production = latest ? classify(latest) : null;
            if (!input.onlyNonProducing || production?.producing === false)
              rows.push({
                assetId: asset.id,
                name: asset.name,
                area: asset.area,
                producing: production?.producing ?? null,
                deltaC: production?.deltaC ?? null,
                thresholdC: rule.thresholdC,
                observedAt: latest?.at ?? null,
                inspectionNotes: latest?.notes ?? '',
                sources: latest
                  ? [
                      asset.source,
                      latest.source,
                      ...(asset.manualSource ? [asset.manualSource] : []),
                    ]
                  : [asset.source],
              });
          } else if (input.metric === 'temperature-history') {
            for (const record of records)
              rows.push({
                assetId: asset.id,
                inspectionId: record.id,
                observedAt: record.at,
                ambientC: record.ambientC,
                wellheadC: record.wellheadC,
                ...(classify(record) ?? { producing: null, deltaC: null }),
                inspectionNotes: record.notes,
                spillDetected: record.spill,
                spillVolumeBbl: record.volumeBbl,
                sources: [record.source, ...(asset.manualSource ? [asset.manualSource] : [])],
              });
          } else if (input.metric === 'downtime') {
            const down = records.filter((record) => classify(record)?.producing === false);
            rows.push({
              assetId: asset.id,
              name: asset.name,
              downtimeDays: down.length * 7,
              nonProducingInspections: down.length,
              inspectionCount: records.length,
              sources: [
                asset.source,
                ...down.map((record) => record.source),
                ...(asset.manualSource ? [asset.manualSource] : []),
              ],
            });
          }
        }
        if (input.metric === 'downtime')
          rows.sort(
            (a, b) =>
              Number(b.downtimeDays) - Number(a.downtimeDays) ||
              String(a.assetId).localeCompare(String(b.assetId)),
          );
      }
      const shown = rows.slice(0, input.limit);
      for (const row of shown) for (const source of row.sources as Source[]) add(source);
      return {
        metric: input.metric,
        window: input.window ?? null,
        asOf,
        rows: shown,
        coverage: {
          kind: 'complete-filtered-input',
          assetsEvaluated: assets.length,
          totalRows: rows.length,
          returnedRows: shown.length,
          truncated: rows.length > shown.length,
        },
        sources: [...sources.values()],
        warnings,
        presentation: {
          kind:
            input.metric === 'temperature-history'
              ? 'line-chart'
              : input.metric === 'downtime'
                ? 'bar-chart'
                : 'table',
        },
      };
    },
  };
}
export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
