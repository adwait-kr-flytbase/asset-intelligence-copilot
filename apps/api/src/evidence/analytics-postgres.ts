import type { DatabaseConnection } from '@repo/db';
import type {
  AnalyticsReader,
  CorrectionRecord,
  FleetAsset,
  InspectionRecord,
  JobRecord,
} from './analytics.js';
import type { Source } from './types.js';

type RowSource = { id: string; source_id: string; source_path: string; source_line: number | null };
const source = (row: RowSource): Source => ({
  id: row.id,
  label: row.id,
  path: row.source_path,
  sourceId: row.source_id,
  locator: { line: row.source_line ?? 1 },
});
const areaFilter = (value?: string) =>
  value?.replace(
    /^([a-z]+)-(\d+)$/i,
    (_, prefix: string, number: string) => `${prefix.toUpperCase()}-${number.padStart(2, '0')}`,
  ) ?? null;
const selection = `a.namespace=$1 AND ($2::text IS NULL OR a.id=$2)
  AND ($3::text IS NULL OR a.area_id=$3 OR lower(ar.name)=lower($3))`;
const joins =
  'JOIN assets a ON a.namespace=i.namespace AND a.id=i.asset_id JOIN areas ar ON ar.namespace=a.namespace AND ar.id=a.area_id';
const windowFilter = `($4::date IS NULL OR i.inspected_at >= ($4::date::timestamp AT TIME ZONE 'UTC'))
  AND ($5::date IS NULL OR i.inspected_at < (($5::date+1)::timestamp AT TIME ZONE 'UTC')) AND i.inspected_at <= $6::timestamptz`;

/** Dataset-wide SELECTs feed deterministic services, never top-k retrieval aggregates. */
export function createPostgresAnalytics(
  pool: DatabaseConnection['pool'],
  namespace: string,
  asOf: string,
): AnalyticsReader {
  if (!namespace.trim()) throw new Error('Analytics namespace is required.');
  async function query<T>(sql: string, params: unknown[], signal?: AbortSignal): Promise<T[]> {
    signal?.throwIfAborted();
    const result = await pool.query(sql, params);
    signal?.throwIfAborted();
    return result.rows as T[];
  }
  return {
    async assets(filter, signal) {
      const rows = await query<
        RowSource & {
          name: string;
          well_type: string;
          area_id: string;
          area_name: string;
          lat: string;
          lon: string;
          manual_md: string | null;
          manual_id: string | null;
          manual_source_id: string | null;
          manual_path: string | null;
        }
      >(
        `SELECT a.*,ar.name area_name,d.markdown manual_md,d.id manual_id,d.source_id manual_source_id,d.source_path manual_path
         FROM assets a JOIN areas ar ON ar.namespace=a.namespace AND ar.id=a.area_id
         LEFT JOIN well_type_manuals w ON w.namespace=a.namespace AND w.well_type=a.well_type
         LEFT JOIN documents d ON d.namespace=w.namespace AND d.id=w.document_id
         WHERE ${selection} ORDER BY a.id`,
        [namespace, filter.assetId ?? null, areaFilter(filter.area)],
        signal,
      );
      return rows.map(
        (row): FleetAsset => ({
          id: row.id,
          name: row.name,
          wellType: row.well_type,
          areaId: row.area_id,
          area: row.area_name,
          lat: row.lat,
          lon: row.lon,
          source: source(row),
          manual: row.manual_md,
          manualSource:
            row.manual_id && row.manual_source_id && row.manual_path
              ? {
                  id: row.manual_id,
                  label: row.manual_id,
                  path: row.manual_path,
                  sourceId: row.manual_source_id,
                  locator: { startLine: 1, endLine: (row.manual_md ?? '').split('\n').length },
                }
              : null,
        }),
      );
    },
    async inspections(filter, window, at, signal) {
      const rows = await query<
        RowSource & {
          asset_id: string;
          inspected_at: Date;
          ambient_temp_c: string;
          wellhead_temp_c: string;
          spill_detected: boolean;
          spill_volume_bbl: string | null;
          notes: string;
        }
      >(
        `SELECT ${window ? '' : 'DISTINCT ON (i.asset_id)'} i.* FROM inspections i ${joins}
         WHERE ${selection} AND ${windowFilter} ORDER BY i.asset_id,i.inspected_at ${window ? 'ASC' : 'DESC'},i.id DESC`,
        [
          namespace,
          filter.assetId ?? null,
          areaFilter(filter.area),
          window?.from ?? null,
          window?.through ?? null,
          at,
        ],
        signal,
      );
      return rows.map(
        (row): InspectionRecord => ({
          id: row.id,
          assetId: row.asset_id,
          at: row.inspected_at.toISOString(),
          ambientC: row.ambient_temp_c,
          wellheadC: row.wellhead_temp_c,
          spill: row.spill_detected,
          volumeBbl: row.spill_volume_bbl,
          notes: row.notes,
          source: source(row),
        }),
      );
    },
    async jobs(filter, window, signal) {
      const rows = await query<
        RowSource & {
          asset_id: string;
          started_at: Date;
          equipment_kind: string;
          type: string;
          total_usd: string;
          document_id: string | null;
          trigger_inspection_id: string | null;
          issue: string;
        }
      >(
        `SELECT i.*,r.document_id FROM maintenance i ${joins}
         LEFT JOIN maintenance_reports r ON r.namespace=i.namespace AND r.maintenance_id=i.id
         WHERE ${selection} AND i.started_at >= ($4::date::timestamp AT TIME ZONE 'UTC')
         AND i.started_at < (($5::date+1)::timestamp AT TIME ZONE 'UTC') AND i.started_at <= $6::timestamptz
         ORDER BY i.started_at,i.id`,
        [
          namespace,
          filter.assetId ?? null,
          areaFilter(filter.area),
          window.from,
          window.through,
          asOf,
        ],
        signal,
      );
      return rows.map(
        (row): JobRecord => ({
          id: row.id,
          assetId: row.asset_id,
          startedAt: row.started_at.toISOString(),
          equipmentKind: row.equipment_kind,
          type: row.type,
          totalUsd: row.total_usd,
          reportId: row.document_id,
          inspectionId: row.trigger_inspection_id,
          issue: row.issue,
          source: source(row),
        }),
      );
    },
    async corrections(filter, at, signal) {
      const rows = await query<RowSource & { inspection_id: string; text: string }>(
        `SELECT i.* FROM context i ${joins} WHERE ${selection} AND i.type='correction' AND i.created_at <= $4::timestamptz ORDER BY i.created_at,i.id`,
        [namespace, filter.assetId ?? null, areaFilter(filter.area), at],
        signal,
      );
      return rows.map(
        (row): CorrectionRecord => ({
          id: row.id,
          inspectionId: row.inspection_id,
          text: row.text,
          source: source(row),
        }),
      );
    },
    async records(assetId, window, signal) {
      const jobs = await this.jobs({ assetId }, window, signal);
      const events = await query<
        RowSource & {
          date: string;
          agency: string;
          type: string;
          protocol_id: string;
          inspection_id: string;
          hours_to_report: string | null;
          detail: string;
          fine_usd: string;
          status: string;
        }
      >(
        `SELECT *,date::text FROM regulatory_events WHERE namespace=$1 AND asset_id=$2
         AND date BETWEEN $3::date AND $4::date AND date <= ($5::timestamptz AT TIME ZONE 'UTC')::date ORDER BY regulatory_events.date,regulatory_events.id`,
        [namespace, assetId, window.from, window.through, asOf],
        signal,
      );
      return {
        records: [
          ...jobs.map((job) => ({ kind: 'maintenance', ...job })),
          ...events.map((event) => ({
            kind: 'regulatory',
            id: event.id,
            date: event.date,
            agency: event.agency,
            type: event.type,
            protocolId: event.protocol_id,
            inspectionId: event.inspection_id,
            hoursToReport: event.hours_to_report,
            detail: event.detail,
            fineUsd: event.fine_usd,
            status: event.status,
            source: source(event),
          })),
        ],
        sources: [...jobs.map((job) => job.source), ...events.map(source)],
      };
    },
  };
}
