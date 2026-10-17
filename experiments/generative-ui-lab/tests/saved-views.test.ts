import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executeOperatorRead, operatorPlan } from '../server/operator.ts';
import { DEFAULT_OPERATOR_PARAMETERS } from '../src/protocol.ts';
import { readViews } from '../src/useSavedViews.ts';
import { resolveSavedInvocation, savedViewSchema } from '../src/view-contract.ts';

function definition() {
  return savedViewSchema.parse({
    id: crypto.randomUUID(),
    revision: 1,
    name: 'My inspection (daily)',
    createdAt: new Date().toISOString(),
    catalogVersion: 1,
    operation: 'well-inspection-read-v1',
    plan: operatorPlan('attention'),
    defaults: { ...DEFAULT_OPERATOR_PARAMETERS, wellId: 'LAB-W01' },
  });
}
test('only explicit complete named requests reuse saved definitions', () => {
  const view = definition();
  assert.equal(resolveSavedInvocation('Show an inspection overview for LAB-W01', [view]), null);
  assert.equal(resolveSavedInvocation('My inspection (daily)', [view]), null);
  assert.equal(
    resolveSavedInvocation('Use my My inspection (daily) for LAB-W02', [view])?.parameters.wellId,
    'LAB-W02',
  );
  assert.equal(
    resolveSavedInvocation('Use my My inspection (daily) for LAB-W02 and rank repair costs', [
      view,
    ]),
    null,
  );
  assert.equal(resolveSavedInvocation('Use my My inspection (daily) for LAB-W02', []), null);
  assert.equal(view.defaults.wellId, 'LAB-W01');
});
test('saved definitions cannot carry narrative, arbitrary queries or computed results', () => {
  const view = definition();
  for (const extra of [
    { narrative: 'Well one is down' },
    { sql: 'SELECT *' },
    { result: { value: 9 } },
  ])
    assert.throws(() => savedViewSchema.parse({ ...view, ...extra }));
  assert.throws(() => savedViewSchema.parse({ ...view, operation: 'write-correction' }));
  assert.throws(() =>
    savedViewSchema.parse({
      ...view,
      defaults: { ...view.defaults, trendStart: '2026-10-30', trendEnd: '2026-10-01' },
    }),
  );
});
test('saved-view storage revalidates last runs and their definition identity', () => {
  const view = definition(),
    snapshot = executeOperatorRead(crypto.randomUUID(), view.plan, view.defaults, 'local', {
      id: view.id,
      revision: view.revision,
      name: view.name,
    });
  const store = { version: 1, definitions: [view], lastRuns: { [view.id]: snapshot } };
  assert.equal(
    readViews(JSON.stringify(store)).lastRuns[view.id].execution?.parameters.wellId,
    'LAB-W01',
  );
  const bad = structuredClone(store);
  bad.lastRuns[view.id].execution!.savedView!.id = crypto.randomUUID();
  assert.throws(() => readViews(JSON.stringify(bad)));
  const source = structuredClone(store);
  source.lastRuns[view.id].result.rows[0].sourceIds = ['invented'];
  assert.throws(() => readViews(JSON.stringify(source)));
});
test('exact saved names take priority over conversational aliases and punctuation', () => {
  const names = ['A', 'my A', 'Overview', 'Overview.', 'A for LAB-W02'];
  const views = names.map((name) => ({ ...definition(), name }));
  for (const ordered of [views, [...views].reverse()]) {
    assert.equal(resolveSavedInvocation('Use my A', ordered)?.definition.name, 'my A');
    assert.equal(resolveSavedInvocation('Use Overview.', ordered)?.definition.name, 'Overview.');
    assert.equal(resolveSavedInvocation('Use "A"', ordered)?.definition.name, 'A');
    assert.equal(
      resolveSavedInvocation('Use A for LAB-W02', ordered)?.definition.name,
      'A for LAB-W02',
    );
    assert.equal(
      resolveSavedInvocation('Use "A" for LAB-W02', ordered)?.parameters.wellId,
      'LAB-W02',
    );
    assert.equal(
      resolveSavedInvocation('Use my "A" for LAB-W02.', ordered)?.parameters.wellId,
      'LAB-W02',
    );
    assert.equal(resolveSavedInvocation('Use "Overview.', ordered), null);
  }
  assert.equal(resolveSavedInvocation('Use Overview.', [views[2]])?.definition.name, 'Overview');
});
