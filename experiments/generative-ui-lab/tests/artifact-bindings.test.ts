import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultPlan, getResult } from '../server/domain.ts';
import { executeOperatorRead } from '../server/operator.ts';
import { answerSummary } from '../src/answer-summary.ts';
import { getArtifactPanelDetails, resolveArtifactForView } from '../src/artifact-bindings.ts';
import { makeSnapshot } from '../src/protocol.ts';

test('combined cost and downtime panels keep their separate values, units and primary order', () => {
  for (const views of [
    ['costs', 'bar'],
    ['bar', 'costs'],
  ] as const) {
    const snapshot = executeOperatorRead('combined-ranking', {
      query: 'downtime',
      views: [...views],
    });
    assert.equal(resolveArtifactForView(snapshot.result.artifacts, 'costs')?.id, 'repair-costs');
    assert.equal(resolveArtifactForView(snapshot.result.artifacts, 'bar')?.id, 'downtime-ranking');
    assert.equal(
      resolveArtifactForView([...snapshot.result.artifacts!].reverse(), 'costs')?.id,
      'repair-costs',
    );
    assert.equal(
      resolveArtifactForView([...snapshot.result.artifacts!].reverse(), 'bar')?.id,
      'downtime-ranking',
    );
    const summary = answerSummary(snapshot);
    if (views[0] === 'costs') {
      assert.match(summary, /\$43,250/);
      assert.doesNotMatch(summary, /\$49\b/);
      assert.match(snapshot.result.title, /repair costs/);
    } else {
      assert.match(summary, /49.*days/);
      assert.doesNotMatch(summary, /\$/);
      assert.match(snapshot.result.title, /downtime/);
    }
  }
});

test('summary preserves the ranking unit instead of inventing USD', () => {
  const snapshot = executeOperatorRead('euro-ranking', { query: 'attention', views: ['costs'] });
  const artifact = resolveArtifactForView(snapshot.result.artifacts, 'costs');
  assert.ok(artifact?.kind === 'ranking');
  if (!artifact || artifact.kind !== 'ranking') throw Error('Expected cost ranking');
  artifact.unit = 'EUR';
  assert.match(answerSummary(snapshot), /€43,250/);
  assert.doesNotMatch(answerSummary(snapshot), /\$/);
});

test('bindings preserve selected-well series and picker labels describe the actual temperature metrics', () => {
  const snapshot = executeOperatorRead('temperature-bindings', {
    query: 'attention',
    views: ['line', 'heatmap'],
  });
  const series = resolveArtifactForView(snapshot.result.artifacts, 'line', 'LAB-W04');
  assert.deepEqual(series?.scope.wellIds, ['LAB-W04']);
  const details = getArtifactPanelDetails(snapshot.result.artifacts, 'line', 'LAB-W04');
  assert.equal(details?.title, 'LAB-W04 · synthetic wellhead and ambient temperatures');
  assert.match(details!.description, /Wellhead.*Ambient.*°C/);
  assert.doesNotMatch(details!.title, /above ambient/);
  const matrix = getArtifactPanelDetails(snapshot.result.artifacts, 'heatmap');
  assert.equal(matrix?.title, 'Weekly inspection temperature differences');
  assert.match(matrix!.description, /°C/);
  assert.doesNotMatch(`${matrix!.title} ${matrix!.description}`, /spill|events/i);
  assert.equal(getArtifactPanelDetails(undefined, 'line'), undefined);
  assert.equal(resolveArtifactForView(snapshot.result.artifacts, 'costs'), undefined);
  const spills = executeOperatorRead('spill-binding', { query: 'spills', views: ['heatmap'] });
  assert.match(getArtifactPanelDetails(spills.result.artifacts, 'heatmap')!.description, /events/);
});

test('legacy comparison summary text stays unchanged for the three default scenarios', () => {
  const expected = {
    attention:
      '2 wells are below their production threshold. Inspect the locations, missing observations and conflicting records before drawing a conclusion.',
    downtime:
      '49 days of downtime across 6 wells in the synthetic inspection period. Compare wells and check their temperature trends.',
    spills:
      '8.7 bbl recorded across the synthetic wells. The result includes locations and conflicting records; missing coordinates are flagged.',
  };
  for (const query of ['attention', 'downtime', 'spills'] as const)
    assert.equal(
      answerSummary(makeSnapshot('legacy-summary', defaultPlan(query), getResult(query), 'ready')),
      expected[query],
    );
});
