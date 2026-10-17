import type { DatabaseConnection } from '@repo/db';
import type {
  Document,
  EvidenceReader,
  FieldNote,
  Observation,
  OperationalContext,
  Source,
} from './types.js';

type Provenance = {
  id: string;
  source_id: string;
  source_path: string;
  source_line: number | null;
};
const provenance = (row: Provenance): Source => ({
  id: row.id,
  label: row.id,
  path: row.source_path,
  sourceId: row.source_id,
  locator: { line: row.source_line ?? 1 },
});
type DocumentRow = {
  id: string;
  kind: Document['kind'];
  asset_id: string | null;
  markdown: string;
  source_id: string;
  source_path: string;
  is_primary?: boolean;
};
function document(row: DocumentRow): Document {
  return {
    id: row.id,
    kind: row.kind,
    assetId: row.asset_id,
    markdown: row.markdown,
    isPrimary: row.is_primary,
    source: {
      id: row.id,
      label: row.id,
      path: row.source_path,
      sourceId: row.source_id,
      locator: { startLine: 1, endLine: row.markdown.split('\n').length },
    },
  };
}

/** Only SELECT statements. Scope is configured once by the server, never model-controlled. */
export function createPostgresEvidence(
  pool: Pick<DatabaseConnection['pool'], 'query'>,
  namespace: string,
): EvidenceReader {
  if (!namespace.trim()) throw new Error('Evidence namespace is required.');
  async function query<T>(text: string, values: unknown[], signal?: AbortSignal): Promise<T[]> {
    signal?.throwIfAborted();
    const result = await pool.query(text, values);
    signal?.throwIfAborted();
    return result.rows as T[];
  }
  return {
    async record(kind, id, signal) {
      const table = {
        inspection: 'inspections',
        maintenance: 'maintenance',
        regulatory: 'regulatory_events',
        note: 'context',
      }[kind];
      const [row] = await query<Provenance & { content: string }>(
        `SELECT i.id,i.source_id,i.source_path,i.source_line,s.content
        FROM ${table} i JOIN source_files s ON s.namespace=i.namespace AND s.id=i.source_id
        WHERE i.namespace=$1 AND i.id=$2`,
        [namespace, id],
        signal,
      );
      if (!row?.source_line) return null;
      const text = row.content.split('\n')[row.source_line - 1];
      if (!text) return null;
      return { id: row.id, text, source: provenance(row) };
    },
    async context(assetId, asOf, signal) {
      const [asset] = await query<
        Provenance & { name: string; well_type: string; recorded_status: string }
      >('SELECT * FROM assets WHERE namespace=$1 AND id=$2', [namespace, assetId], signal);
      if (!asset) return null;
      const [inspection] = await query<
        Provenance & {
          inspected_at: Date;
          ambient_temp_c: string;
          wellhead_temp_c: string;
          inspector: string;
          method: string;
          notes: string;
        }
      >(
        `SELECT i.*, u.name AS inspector FROM inspections i
          JOIN users u ON u.namespace=i.namespace AND u.id=i.inspector_id
          WHERE i.namespace=$1 AND i.asset_id=$2 AND i.inspected_at <= $3::timestamptz
          ORDER BY i.inspected_at DESC,i.id DESC LIMIT 1`,
        [namespace, assetId, asOf],
        signal,
      );
      const observation: Observation | null = inspection
        ? {
            id: inspection.id,
            observedAt: inspection.inspected_at.toISOString(),
            ambientC: inspection.ambient_temp_c,
            wellheadC: inspection.wellhead_temp_c,
            inspector: inspection.inspector,
            method: inspection.method,
            notes: inspection.notes,
            source: provenance(inspection),
          }
        : null;
      const rows = await query<
        Provenance & {
          type: string;
          inspection_id: string | null;
          text: string;
          author: string;
          created_at: Date;
          valid_from: string;
          valid_to: string | null;
        }
      >(
        `SELECT c.*,u.name AS author,c.valid_from::text,c.valid_to::text FROM context c
          JOIN users u ON u.namespace=c.namespace AND u.id=c.author_id
          WHERE c.namespace=$1 AND c.asset_id=$2 AND c.created_at <= $3::timestamptz
          AND ((c.valid_from <= ($3::timestamptz AT TIME ZONE 'UTC')::date
            AND (c.valid_to IS NULL OR c.valid_to >= ($3::timestamptz AT TIME ZONE 'UTC')::date))
            OR (c.type='correction' AND c.inspection_id=$4))
          ORDER BY c.created_at,c.id`,
        [namespace, assetId, asOf, observation?.id ?? null],
        signal,
      );
      const notes: FieldNote[] = rows.map((row) => ({
        id: row.id,
        type: row.type,
        inspectionId: row.inspection_id,
        text: row.text,
        author: row.author,
        createdAt: row.created_at.toISOString(),
        validFrom: row.valid_from,
        validTo: row.valid_to,
        source: provenance(row),
      }));
      const jobs = await query<
        Provenance & {
          started_at: Date;
          completed_at: Date;
          issue: string;
          action_taken: string;
          document_id: string | null;
          trigger_inspection_id: string | null;
        }
      >(
        `SELECT m.*,r.document_id FROM maintenance m LEFT JOIN maintenance_reports r
          ON r.namespace=m.namespace AND r.maintenance_id=m.id
          WHERE m.namespace=$1 AND m.asset_id=$2 AND m.started_at <= $3::timestamptz
          ORDER BY m.started_at DESC,m.id DESC LIMIT 11`,
        [namespace, assetId, asOf],
        signal,
      );
      const result: OperationalContext = {
        asset: {
          id: asset.id,
          name: asset.name,
          wellType: asset.well_type,
          recordedStatus: asset.recorded_status,
          source: provenance(asset),
        },
        observation,
        notes,
        maintenance: jobs.slice(0, 10).map((job) => ({
          id: job.id,
          startedAt: job.started_at.toISOString(),
          completedAt: job.completed_at.toISOString(),
          issue: job.issue,
          action: job.action_taken,
          reportId: job.document_id,
          inspectionId: job.trigger_inspection_id,
          source: provenance(job),
        })),
        maintenanceTruncated: jobs.length > 10,
      };
      return result;
    },
    async procedures(assetId, signal) {
      const rows = await query<DocumentRow>(
        `SELECT d.*,d.id IN (
          SELECT w.document_id FROM well_type_manuals w JOIN assets a
          ON a.namespace=w.namespace AND a.well_type=w.well_type
          WHERE a.namespace=$1 AND a.id=$2) AS is_primary FROM documents d
        WHERE d.namespace=$1 AND (d.kind='sop' OR d.id IN (
          SELECT w.document_id FROM well_type_manuals w JOIN assets a
          ON a.namespace=w.namespace AND a.well_type=w.well_type
          WHERE a.namespace=$1 AND a.id=$2))
        AND EXISTS (SELECT 1 FROM assets WHERE namespace=$1 AND id=$2)
        ORDER BY d.id`,
        [namespace, assetId],
        signal,
      );
      const primary = rows.find((row) => row.is_primary);
      // Follow only an explicit supported inheritance statement, never a guessed filename.
      const parent = primary?.markdown.match(/follow the ([A-Z][A-Z0-9]*) manual\./)?.[1];
      if (parent) {
        const parents = await query<DocumentRow>(
          `SELECT d.* FROM documents d JOIN well_type_manuals w
          ON w.namespace=d.namespace AND w.document_id=d.id
          WHERE w.namespace=$1 AND w.well_type=$2`,
          [namespace, parent],
          signal,
        );
        for (const row of parents)
          if (!rows.some((existing) => existing.id === row.id)) rows.push(row);
      }
      return rows.map(document);
    },
    async readDocument(id, signal) {
      const [row] = await query<DocumentRow>(
        `SELECT d.* FROM documents d WHERE d.namespace=$1 AND (d.id=$2 OR d.id IN (
          SELECT r.document_id FROM maintenance_reports r
          WHERE r.namespace=$1 AND r.maintenance_id=$2)) ORDER BY (d.id=$2) DESC LIMIT 1`,
        [namespace, id],
        signal,
      );
      return row ? document(row) : null;
    },
    async search(input, signal) {
      const alternatives = (input.query.match(/[A-Za-z0-9]{3,}/g) ?? [])
        .filter(
          (word) =>
            !/^(the|and|for|with|was|were|from|what|why|how|has|had|this|that)$/i.test(word),
        )
        .slice(0, 30)
        .join(' OR ');
      const rows = await query<DocumentRow>(
        `SELECT d.* FROM documents d,
        websearch_to_tsquery('english',$2) q, websearch_to_tsquery('english',$6) alternatives
        WHERE d.namespace=$1 AND ($3::text IS NULL OR d.asset_id=$3)
        AND ($4::text IS NULL OR d.kind=$4)
        AND (to_tsvector('english',d.markdown) @@ q OR to_tsvector('english',d.markdown) @@ alternatives)
        ORDER BY (to_tsvector('english',d.markdown) @@ q) DESC,ts_rank_cd(to_tsvector('english',d.markdown),alternatives) DESC,d.id
        LIMIT $5`,
        [
          namespace,
          input.query,
          input.assetId ?? null,
          input.kind ?? null,
          input.limit,
          alternatives,
        ],
        signal,
      );
      return { hits: rows.map(document), coverage: 'ranked-discovery', limit: input.limit };
    },
  };
}
