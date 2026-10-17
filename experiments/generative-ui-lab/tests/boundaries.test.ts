import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultPlan, getResult } from '../server/domain.ts';
import {
  makeSnapshot,
  planSchema,
  RunGate,
  restoreSnapshot,
  validateSnapshot,
} from '../src/protocol.ts';

test('canonical A2UI and direct views share immutable result identity', () => {
  const result = getResult('attention');
  const s = makeSnapshot('test-run', defaultPlan('attention'), result, 'ready');
  assert.equal(validateSnapshot(s).result.id, result.id);
  assert.equal(s.wire[0].version, 'v0.9.1');
});
test('reject invented results, sources, widgets and extra computed values', () => {
  const s = makeSnapshot('test-run', defaultPlan('attention'), getResult('attention'), 'ready');
  assert.throws(() => validateSnapshot({ ...s, result: { ...s.result, id: 'invented' } }));
  assert.throws(() =>
    validateSnapshot({
      ...s,
      result: { ...s.result, rows: [{ ...s.result.rows[0], sourceIds: ['missing'] }] },
    }),
  );
  assert.throws(() => planSchema.parse({ ...s.plan, views: ['executeHTML'] }));
  assert.throws(() => planSchema.parse({ ...s.plan, computedTotal: 999 }));
  const bad = structuredClone(s);
  bad.wire[2] = {
    version: 'v0.9.1',
    updateComponents: { surfaceId: 'test-run', components: [{ id: 'root', component: 'Script' }] },
  };
  assert.throws(() => validateSnapshot(bad));
});
test('cancellation rejects late events and stale run replacements', () => {
  const gate = new RunGate();
  gate.start('a');
  assert.equal(gate.accepts('a'), true);
  gate.cancel();
  assert.equal(gate.accepts('a'), false);
  gate.start('b');
  assert.equal(gate.accepts('a'), false);
  assert.equal(gate.accepts('b'), true);
});

test('restoration revalidates schema version, completeness and references', () => {
  const snapshot = makeSnapshot(
    'saved-run',
    defaultPlan('attention'),
    getResult('attention'),
    'ready',
  );
  assert.equal(
    restoreSnapshot(JSON.stringify({ schemaVersion: 1, snapshot })).result.id,
    snapshot.result.id,
  );
  assert.throws(() => restoreSnapshot(JSON.stringify({ schemaVersion: 99, snapshot })));
  assert.throws(() =>
    restoreSnapshot(
      JSON.stringify({ schemaVersion: 1, snapshot: { ...snapshot, phase: 'partial' } }),
    ),
  );
});
