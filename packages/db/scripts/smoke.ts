import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDatabase, createEvidenceStore, requireDatabaseUrl } from '../src/index.js';

const connection = createDatabase(requireDatabaseUrl());
const namespace = process.env.STORAGE_SMOKE_NAMESPACE ?? 'challenge';
const results: { name: string; status: string }[] = [];
async function scenario(name: string, run: () => Promise<void>) {
  await run();
  results.push({ name, status: 'passed' });
}
try {
  await scenario('Full structured sample is persisted', async () => {
    const expected = {
      assets: 200,
      inspections: 39567,
      maintenance: 5665,
      regulatory_events: 90,
      context: 141,
      areas: 4,
      teams: 4,
      users: 15,
      documents: 1514,
      source_files: 2516,
    };
    for (const [table, count] of Object.entries(expected)) {
      // Table names are the fixed local allowlist above; values remain parameterized.
      const result = await connection.pool.query(
        `SELECT count(*)::int n FROM "${table}" WHERE namespace=$1`,
        [namespace],
      );
      assert.equal(result.rows[0].n, count, table);
    }
  });
  await scenario(
    'Drizzle reads preserve types, source content and namespace boundaries',
    async () => {
      const store = createEvidenceStore(connection, namespace);
      const asset = await store.findAsset('WELL-0001');
      assert(asset);
      assert.equal(asset.installedOn, '2013-03-25');
      const inspections = await store.recentInspections(asset.id, 1);
      assert.equal(inspections.length, 1);
      assert.equal(typeof inspections[0]?.wellheadTempC, 'string');
      assert.equal(inspections[0]?.spillAreaPct, null);
      const id = 'assets/WELL-0001/maintenance-reports/MNT-0001-june-2026-flowline-spill.md';
      const document = await store.findDocument(id);
      assert(document);
      assert(document.document.markdown.includes('contained about 7 hours'));
      assert.equal(document.source.path, id);
      assert.equal(document.source.content, document.document.markdown);
      assert.equal(
        createHash('sha256').update(document.source.content).digest('hex'),
        document.source.contentHash,
      );
      assert.equal(
        await createEvidenceStore(connection, `${namespace}-other`).findAsset(asset.id),
        null,
      );
    },
  );
  await scenario(
    'Actual SQL foreign keys and checks reject invalid data; all writes roll back',
    async () => {
      const client = await connection.pool.connect();
      try {
        await client.query('BEGIN');
        const marker = `storage-smoke-${crypto.randomUUID()}`;
        await client.query('INSERT INTO fields(id) VALUES($1)', [marker]);
        async function rejected(sql: string, code: string, constraint?: string) {
          await client.query('SAVEPOINT invalid_write');
          await assert.rejects(client.query(sql, [namespace]), (error: unknown) => {
            const e = error as { code?: string; constraint?: string };
            return e.code === code && (!constraint || e.constraint === constraint);
          });
          await client.query('ROLLBACK TO SAVEPOINT invalid_write');
        }
        await rejected(
          "UPDATE maintenance SET trigger_inspection_id='INS-0002-001' WHERE namespace=$1 AND id='MNT-0001-029'",
          '23503',
          'job_inspection_same_asset_fk',
        );
        await rejected(
          "UPDATE maintenance SET total_usd=total_usd+1 WHERE namespace=$1 AND id='MNT-0001-029'",
          '23514',
          'job_cost_sum',
        );
        await rejected(
          "UPDATE inspections SET spill_area_pct=1 WHERE namespace=$1 AND id='INS-0001-0203'",
          '23514',
          'spill_fields_correspond',
        );
        await rejected(
          "UPDATE context SET inspection_id=NULL WHERE namespace=$1 AND id='CTX-0001-001'",
          '23514',
          'correction_has_target',
        );
        await rejected(
          "UPDATE assets SET source_path='different-file.json' WHERE namespace=$1 AND id='WELL-0001'",
          '23503',
          'source_assets_fk',
        );
        await rejected('INSERT INTO fields(id) VALUES($1)', '23505');
        const decimal = '0.12345678901234567890123456789';
        await client.query(
          "UPDATE inspections SET wellhead_temp_c=$1 WHERE namespace=$2 AND id='INS-0001-0203'",
          [decimal, namespace],
        );
        const value = await client.query(
          "SELECT wellhead_temp_c FROM inspections WHERE namespace=$1 AND id='INS-0001-0203'",
          [namespace],
        );
        assert.equal(value.rows[0].wellhead_temp_c, decimal);
        await client.query('ROLLBACK');
        assert.equal(
          (await client.query('SELECT id FROM fields WHERE id=$1', [marker])).rowCount,
          0,
        );
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    },
  );
  console.log(JSON.stringify({ status: 'passed', scenarios: results }));
} catch {
  console.error(JSON.stringify({ status: 'failed', completed: results }));
  process.exitCode = 1;
} finally {
  await connection.close();
}
