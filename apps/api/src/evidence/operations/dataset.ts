import type { DatabaseConnection } from '@repo/db';
import type { OperationalDataset, OperationalRecord } from './types.js';

/** One immutable namespace snapshot, released before the next model call. */
export function operationalDatasetLoader(
  pool: DatabaseConnection['pool'],
  namespace: string,
  asOf: string,
) {
  let snapshot: Promise<OperationalDataset> | undefined;
  return (signal?: AbortSignal) =>
    (snapshot ??= (async () => {
      signal?.throwIfAborted();
      const client = await pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await client.query("SET LOCAL statement_timeout='20000ms'");
        const read = async (
          table: 'assets' | 'inspections' | 'maintenance' | 'context' | 'areas' | 'teams' | 'users',
          cutoff = '',
        ): Promise<OperationalRecord[]> => {
          const result = await client.query(
            `SELECT id,raw,source_id,source_path,source_line FROM ${table} WHERE namespace=$1 ${cutoff} ORDER BY id`,
            cutoff ? [namespace, asOf] : [namespace],
          );
          return result.rows.map((row) => ({
            id: row.id,
            raw: row.raw,
            source: {
              id: row.id,
              label: row.id,
              path: row.source_path,
              sourceId: row.source_id,
              locator: { line: row.source_line ?? 1 },
            },
          }));
        };
        const assets = await read('assets');
        const inspections = await read('inspections', 'AND inspected_at <= $2::timestamptz');
        const maintenance = await read('maintenance', 'AND started_at <= $2::timestamptz');
        const notes = await read('context', 'AND created_at <= $2::timestamptz');
        const areas = await read('areas');
        const teams = await read('teams');
        const users = await read('users');
        const documents = (
          await client.query(
            'SELECT id,markdown,source_id,source_path FROM documents WHERE namespace=$1 ORDER BY id',
            [namespace],
          )
        ).rows.map((row) => ({
          id: row.id,
          markdown: row.markdown,
          source: {
            id: row.id,
            label: row.id,
            path: row.source_path,
            sourceId: row.source_id,
            locator: { startLine: 1, endLine: row.markdown.split('\n').length },
          },
        }));
        signal?.throwIfAborted();
        await client.query('COMMIT');
        return { asOf, assets, inspections, maintenance, notes, areas, teams, users, documents };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    })());
}
