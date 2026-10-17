import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApp } from '../server/app.ts';
import { executeOperatorRead, operatorPlan } from '../server/operator.ts';
import { type Artifact, artifactSchema } from '../src/artifact-contract.ts';
import {
  DEFAULT_OPERATOR_PARAMETERS,
  type Plan,
  resultSchema,
  validateSnapshot,
} from '../src/protocol.ts';

const completePlan: Plan = {
  query: 'attention',
  views: ['map', 'line', 'costs', 'heatmap', 'obligations', 'timeline', 'claims', 'correction'],
};
const fresh = () => executeOperatorRead(randomUUID(), completePlan);
function artifact<K extends Artifact['kind']>(kind: K) {
  return fresh().result.artifacts!.find((candidate) => candidate.kind === kind) as Extract<
    Artifact,
    { kind: K }
  >;
}

test('typed artifact validation rejects source forgery, impossible geometry and malformed dates', () => {
  const result = fresh().result;
  const geo = artifact('geo');
  assert.equal(artifactSchema.safeParse({ ...geo, html: '<script />' }).success, false);
  assert.equal(
    artifactSchema.safeParse({ ...geo, scope: { ...geo.scope, from: '2026-02-30' } }).success,
    false,
  );
  assert.equal(
    artifactSchema.safeParse({ ...geo, points: [{ ...geo.points[0], lat: 91 }] }).success,
    false,
  );
  assert.equal(
    artifactSchema.safeParse({ ...geo, points: [{ ...geo.points[0], lon: null }] }).success,
    false,
  );
  assert.equal(
    artifactSchema.safeParse({ ...geo, points: [{ ...geo.points[0], lat: Number.NaN }] }).success,
    false,
  );
  assert.equal(
    artifactSchema.safeParse({ ...geo, points: [{ ...geo.points[0], wellId: 'LAB-W99' }] }).success,
    false,
  );
  assert.equal(
    artifactSchema.safeParse({ ...geo, points: [{ ...geo.points[0], sourceIds: ['forged'] }] })
      .success,
    false,
  );
  assert.equal(
    resultSchema.safeParse({
      ...result,
      artifacts: [{ ...geo, sourceIds: [...geo.sourceIds, 'forged'] }],
    }).success,
    false,
  );
  assert.equal(
    resultSchema.safeParse({
      ...result,
      artifacts: [{ ...geo, scope: { ...geo.scope, wellIds: [...geo.scope.wellIds, 'LAB-W99'] } }],
    }).success,
    false,
  );
  assert.equal(resultSchema.safeParse({ ...result, artifacts: [geo, geo] }).success, false);
  assert.ok(geo.points.some((point) => point.lat === null && point.lon === null));
});

test('matrix axes and missing cells and series chronology are validated', () => {
  const matrix = artifact('matrix');
  assert.equal(
    artifactSchema.safeParse({
      ...matrix,
      cells: [{ ...matrix.cells[0], rowId: 'invented' }, ...matrix.cells.slice(1)],
    }).success,
    false,
  );
  assert.equal(
    artifactSchema.safeParse({ ...matrix, cells: [matrix.cells[0], ...matrix.cells] }).success,
    false,
  );
  assert.equal(
    artifactSchema.safeParse({ ...matrix, cells: matrix.cells.slice(1) }).success,
    false,
  );
  assert.equal(
    artifactSchema.safeParse({ ...matrix, columns: [matrix.columns[0], ...matrix.columns] })
      .success,
    false,
  );
  const series = artifact('series');
  const points = series.series[0].points;
  assert.equal(
    artifactSchema.safeParse({
      ...series,
      series: [{ ...series.series[0], points: [...points].reverse() }],
    }).success,
    false,
  );
  assert.equal(
    artifactSchema.safeParse({
      ...series,
      series: [{ ...series.series[0], points: [points[0], points[0]] }],
    }).success,
    false,
  );
  assert.equal(
    artifactSchema.safeParse({
      ...series,
      events: [
        { id: 'outside', date: '2025-01-01', label: 'Out of scope', sourceIds: series.sourceIds },
      ],
    }).success,
    false,
  );
  assert.ok(matrix.cells.some((cell) => cell.value === null));
});

test('spill matrices count sourced events by area and month while inspection matrices retain temperatures', () => {
  const spills = executeOperatorRead('spill-matrix', { query: 'spills', views: ['heatmap'] });
  const matrix = spills.result.artifacts!.find((item) => item.kind === 'matrix');
  assert.ok(matrix?.kind === 'matrix');
  if (!matrix || matrix.kind !== 'matrix') throw Error('Expected spill matrix');
  assert.equal(matrix.id, 'spill-event-matrix');
  assert.equal(matrix.unit, 'events');
  assert.deepEqual(
    matrix.columns.map((column) => column.id),
    ['2026-09', '2026-10'],
  );
  assert.deepEqual(
    matrix.cells.map((cell) => [cell.rowId, cell.columnId, cell.value]),
    [
      ['North ridge', '2026-09', 1],
      ['North ridge', '2026-10', 1],
      ['South basin', '2026-09', 0],
      ['South basin', '2026-10', 1],
    ],
  );
  const zero = matrix.cells.find((cell) => cell.value === 0)!;
  assert.deepEqual(zero.sourceIds, ['LAB-INS-LAB-W03', 'LAB-INS-LAB-W04', 'LAB-INS-LAB-W06']);
  assert.ok(zero.sourceIds.every((id) => spills.result.sources.some((source) => source.id === id)));
  assert.match(matrix.scope.label, /zero means no recorded event among selected wells/);
  const selected = executeOperatorRead(
    'single-spill-matrix',
    { query: 'spills', views: ['heatmap'] },
    {
      ...DEFAULT_OPERATOR_PARAMETERS,
      wellId: 'LAB-W02',
      trendStart: '2027-01-01',
      trendEnd: '2027-01-02',
    },
  ).result.artifacts![0];
  assert.ok(selected.kind === 'matrix');
  if (selected.kind !== 'matrix') throw Error('Expected scoped spill matrix');
  assert.deepEqual(
    selected.cells.map((cell) => cell.value),
    [1, 0],
  );
  assert.ok(
    selected.cells.every(
      (cell) => cell.sourceIds.length === 1 && cell.sourceIds[0] === 'LAB-INS-LAB-W02',
    ),
  );
  assert.equal(selected.scope.to, '2026-10-15');
  assert.equal(artifact('matrix').unit, '°C');
});

test('fresh saved recipes retain metric and only selected-well fixture values and evidence', async () => {
  const app = createApp();
  const definition = {
    id: randomUUID(),
    revision: 1,
    name: 'Recorded repair review',
    createdAt: '2026-10-17T00:00:00.000Z',
    catalogVersion: 1,
    operation: 'well-inspection-read-v1',
    plan: completePlan,
    defaults: DEFAULT_OPERATOR_PARAMETERS,
  };
  async function run(wellId: 'LAB-W01' | 'LAB-W04', trendStart = '2026-10-15') {
    const response = await app.request('/api/saved-view-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: randomUUID(),
        definition,
        parameters: {
          ...DEFAULT_OPERATOR_PARAMETERS,
          wellId,
          trendStart,
          trendEnd:
            trendStart > DEFAULT_OPERATOR_PARAMETERS.trendEnd
              ? '2027-01-02'
              : DEFAULT_OPERATOR_PARAMETERS.trendEnd,
        },
      }),
    });
    assert.equal(response.status, 200);
    return validateSnapshot(await response.json());
  }
  const a = await run('LAB-W01');
  const cost = a.result.artifacts!.find((item) => item.id === 'repair-costs')!;
  assert.equal(cost.kind, 'ranking');
  if (cost.kind !== 'ranking') throw Error('Expected ranking');
  assert.equal(cost.items[0].value, 18400);
  cost.items[0].value = 999;
  const b = await run('LAB-W04');
  const c = await run('LAB-W01', '2027-01-01');
  assert.deepEqual(b.plan, completePlan);
  assert.equal(b.execution?.kind, 'saved-view');
  for (const item of b.result.artifacts!) assert.deepEqual(item.scope.wellIds, ['LAB-W04']);
  assert.ok(b.result.sources.every((source) => !/LAB-W0[12356]/.test(source.id + source.body)));
  const bCost = b.result.artifacts!.find((item) => item.id === 'repair-costs');
  assert.equal(bCost?.kind === 'ranking' && bCost.items[0].value, 12750);
  assert.ok(
    b.result.sources.find((source) => source.id === 'LAB-COST-LAB-W04')?.body.includes('USD 12750'),
  );
  const cCost = c.result.artifacts!.find((item) => item.id === 'repair-costs');
  assert.equal(cCost?.kind === 'ranking' && cCost.items[0].value, 18400);
  const series = c.result.artifacts!.find((item) => item.kind === 'series');
  assert.ok(series?.kind === 'series' && series.series.every((line) => line.points.length === 0));
  const correction = b.result.artifacts!.find((item) => item.kind === 'correction');
  assert.equal(correction?.kind === 'correction' && correction.state, 'proposed');
  assert.equal(correction?.kind === 'correction' && correction.original, '130');
  assert.equal(correction?.kind === 'correction' && correction.proposed, '135');
});

test('raw multiseries sources match synthetic values, preserve missing wellhead readings and separate independent scopes', () => {
  const s = executeOperatorRead('raw-fixture', completePlan, {
    ...DEFAULT_OPERATOR_PARAMETERS,
    wellId: 'LAB-W04',
    inspectionCount: 1,
    trendEnd: '2026-10-01',
  });
  const series = s.result.artifacts!.find((item) => item.kind === 'series');
  assert.ok(series?.kind === 'series');
  if (!series || series.kind !== 'series') throw Error('Expected series');
  assert.equal(series.series.length, 2);
  assert.equal(series.series[0].points[1].value, null);
  assert.equal(series.series[1].points[1].value, 24.1);
  const source = s.result.sources.find((item) => item.id === 'LAB-RAW-TEMPERATURE-LAB-W04')!;
  assert.match(source.body, /ambient 24.1 °C, wellhead not observed/);
  assert.match(source.body, /not present in the inspection source/);
  assert.equal(series.scope.to, '2026-10-01');
  assert.equal(s.result.artifacts!.find((item) => item.kind === 'matrix')!.scope.to, '2026-10-15');
  assert.equal(
    s.result.artifacts!.find((item) => item.kind === 'obligations')!.scope.to,
    '2026-10-31',
  );
  assert.equal(s.result.inspections?.length, 1);
});

test('temperature history intent keeps series ahead of general event-history routing', () => {
  for (const prompt of [
    'Compare wellhead and ambient temperature history for LAB-W01',
    'Show temperature history',
    'Show historical temperature trends',
  ])
    assert.deepEqual(operatorPlan('attention', prompt).views, ['line', 'inspections']);
  assert.deepEqual(operatorPlan('attention', 'Show maintenance history').views, [
    'timeline',
    'claims',
  ]);
});

test('focused read metadata describes the primary artifact while status-led overview keeps its original title', () => {
  const costs = executeOperatorRead(
    'cost-title',
    operatorPlan('attention', 'Compare repair costs'),
  );
  assert.equal(costs.result.title, 'Recorded synthetic repair costs');
  assert.equal(costs.result.period, '2026-09-24 – 2026-10-15');
  const compliance = executeOperatorRead(
    'compliance-title',
    operatorPlan('downtime', 'Show compliance deadlines'),
  );
  assert.equal(compliance.result.title, 'Synthetic obligations and deadlines');
  assert.equal(compliance.result.period, '2026-09-24 – 2026-10-31');
  const overview = executeOperatorRead('overview-title', operatorPlan('attention'));
  assert.equal(overview.result.title, 'Which wells need attention?');
  assert.equal(overview.result.period, '24 Sep – 15 Oct 2026');
});

test('replay fixture families stream fresh rich artifacts, while predictions remain honest text only', async () => {
  const app = createApp();
  for (const [prompt, expected] of [
    ['What is the repair cost for LAB-W01?', 'ranking'],
    ['Show compliance obligations', 'obligations'],
    ['Show maintenance history', 'timeline'],
    ['Compare competing claims', 'claims'],
    ['Review the proposed correction', 'correction'],
    ['Compare wellhead and ambient temperature history for LAB-W01', 'series'],
    ['Show geographic locations', 'geo'],
    ['Show the inspection distribution matrix', 'matrix'],
    ['Predict future repair costs', null],
  ] as const) {
    const response = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: randomUUID(),
        operator: true,
        query: 'attention',
        mode: 'replay',
        parameters: { ...DEFAULT_OPERATOR_PARAMETERS, wellId: 'LAB-W01' },
        messages: [{ id: 'question', role: 'user', parts: [{ type: 'text', text: prompt }] }],
      }),
    });
    assert.equal(response.status, 200);
    const events = (await response.text())
      .split('\n')
      .filter((line) => line.startsWith('data: {'))
      .map((line) => JSON.parse(line.slice(6)));
    const surface = events.findLast((event) => event.type === 'data-surface');
    if (expected) {
      assert.ok(surface, prompt);
      const snapshot = validateSnapshot(surface.data);
      assert.ok(
        snapshot.result.artifacts!.some((item) => item.kind === expected),
        prompt,
      );
      assert.equal(snapshot.result.query, snapshot.plan.query);
      assert.equal(snapshot.execution?.kind, 'pipeline');
    } else {
      assert.equal(surface, undefined);
      assert.match(
        events.find((event) => event.type === 'data-answer').data.text,
        /does not contain evidence/,
      );
    }
  }
  assert.deepEqual(operatorPlan('downtime').views, ['status', 'bar', 'line', 'table']);
});
