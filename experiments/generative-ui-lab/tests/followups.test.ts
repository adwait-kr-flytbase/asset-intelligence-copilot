import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultPlan, getResult } from '../server/domain.ts';
import { explainSnapshot } from '../src/followups.ts';
import { makeSnapshot } from '../src/protocol.ts';

test('scripted explanations read selected well values and evidence without creating a surface', () => {
  const s = makeSnapshot('basis', defaultPlan('downtime'), getResult('downtime'), 'ready');
  const explanation = explainSnapshot('Why this status?', s, 'LAB-W01');
  assert.ok(explanation);
  assert.match(explanation.text, /LAB-W01/);
  assert.match(explanation.text, /3.2°C/);
  assert.match(explanation.text, /15°C/);
  assert.deepEqual(explanation.sourceIds, s.result.rows[0].sourceIds);
  assert.match(explainSnapshot('How is downtime calculated?', s, 'LAB-W01')!.text, /21 days/);
  assert.match(explainSnapshot('Any conflicting records?', s, 'LAB-W01')!.text, /asset register/);
  assert.equal(explainSnapshot('Show spills', s, 'LAB-W01'), null);
  assert.equal(explainSnapshot('Why this status?', s, 'invented'), null);
  assert.equal(explainSnapshot('Why this status?', { ...s, phase: 'partial' }, 'LAB-W01'), null);
});
