import 'dotenv/config';
import assert from 'node:assert/strict';
import { createPostgresEvidence } from '../evidence/postgres.js';
import { createEvidenceService } from '../evidence/service.js';
import { closeDatabase, getDatabase } from '../storage/database.js';

/** Explicit read-only sample check, run separately from ordinary tests. No seed/reset/write. */
const namespace = process.env.AGENT_NAMESPACE;
if (!namespace) throw new Error('Set AGENT_NAMESPACE to the already seeded sample namespace.');
try {
  const pool = getDatabase().pool;
  const reader = createPostgresEvidence(pool, namespace);
  const evidence = createEvidenceService(reader, '2026-10-17T00:00:00.000Z');
  const well = await evidence.overview('WELL-0001');
  assert.equal(well.status, 'found');
  if (well.status !== 'found') throw new Error('Missing reference well.');
  assert.equal(well.observation?.id, 'INS-0001-0203');
  assert.equal(well.production?.deltaC, '3.2');
  assert.equal(well.production?.producing, false);
  assert.equal(well.production?.thresholdC, '15');
  assert(well.notes.some((note) => note.id === 'CTX-0001-003'));
  const linked = well.maintenance.find((job) => job.reportId);
  assert(linked?.reportId);
  const report = await reader.readDocument(linked.reportId);
  assert.equal(report?.assetId, 'WELL-0001');
  assert(report?.source.sourceId);
  const hits = await reader.search({
    query: 'corrosion',
    assetId: 'WELL-0001',
    kind: 'maintenance_report',
    limit: 3,
  });
  assert(hits.hits.length > 0);
  assert(hits.hits.every((hit) => hit.assetId === 'WELL-0001'));
  assert.equal(hits.coverage, 'ranked-discovery');
  const t350 = await pool.query(
    'SELECT id FROM assets WHERE namespace=$1 AND well_type=$2 LIMIT 1',
    [namespace, 'T350'],
  );
  assert(t350.rows[0]);
  const inherited = await reader.procedures(t350.rows[0].id);
  assert(inherited.some((doc) => doc.isPrimary && doc.markdown.includes('20 °C above')));
  assert(
    inherited.some(
      (doc) => !doc.isPrimary && doc.kind === 'manual' && doc.markdown.includes('15 °C above'),
    ),
  );
  const other = createPostgresEvidence(pool, '__evidence_smoke_absent_namespace__');
  assert.equal(await other.context('WELL-0001', '2026-10-17T00:00:00Z'), null);
  assert.equal((await other.search({ query: 'corrosion', limit: 3 })).hits.length, 0);
  assert.equal((await reader.context('WELL-0001', '2000-01-01T00:00:00Z'))?.observation, null);
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        mode: 'read-only-sample',
        checks: [
          'Q1 latest status, decimal delta and planned-work note',
          'linked original report',
          'asset-filtered lexical search',
          'T350 explicit manual inheritance',
          'namespace isolation',
          'as-of observation cutoff',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await closeDatabase();
}
