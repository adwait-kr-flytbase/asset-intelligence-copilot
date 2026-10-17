import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../server/app.ts';
import { executeOperatorRead, operatorPlan } from '../server/operator.ts';
import {
  DEFAULT_OPERATOR_PARAMETERS,
  operatorParametersSchema,
  type Snapshot,
  validateSnapshot,
} from '../src/protocol.ts';
import { savedViewSchema } from '../src/view-contract.ts';

const definition = () =>
  savedViewSchema.parse({
    id: randomUUID(),
    revision: 1,
    name: 'Inspection overview',
    createdAt: '2026-10-17T00:00:00.000Z',
    catalogVersion: 1,
    operation: 'well-inspection-read-v1',
    plan: operatorPlan('attention'),
    defaults: DEFAULT_OPERATOR_PARAMETERS,
  });
function post(
  app: ReturnType<typeof createApp>,
  path: string,
  body: unknown,
  signal?: AbortSignal,
) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}
function chatBody(text = 'Check wells') {
  return {
    runId: randomUUID(),
    operator: true,
    mode: 'replay',
    query: 'attention',
    parameters: DEFAULT_OPERATOR_PARAMETERS,
    messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text }] }],
  };
}
async function events(response: Response) {
  assert.equal(response.status, 200);
  return (await response.text())
    .split('\n')
    .filter((line) => line.startsWith('data: {'))
    .map((line) => JSON.parse(line.slice(6)));
}

test('operator parameters reject invalid calendars, reversed dates and excess inputs', () => {
  for (const change of [
    { trendStart: '2026-02-30' },
    { trendStart: '2027-01-01' },
    { inspectionCount: 0 },
    { inspectionCount: 5 },
    { wellId: 'LAB-W99' },
    { sql: 'SELECT 1' },
  ])
    assert.equal(
      operatorParametersSchema.safeParse({ ...DEFAULT_OPERATOR_PARAMETERS, ...change }).success,
      false,
    );
});

test('fresh reads apply count and dates independently and retain full-window calculations and rules', () => {
  const parameters = {
    ...DEFAULT_OPERATOR_PARAMETERS,
    wellId: 'LAB-W04' as const,
    inspectionCount: 3,
    trendStart: '2026-10-15',
  };
  const s = executeOperatorRead('read-one', operatorPlan('attention'), parameters);
  assert.equal(s.result.rows.length, 1);
  assert.equal(s.result.rows[0].thresholdC, 20);
  assert.equal(s.result.rows[0].downtimeDays, 14);
  assert.equal(s.result.rows[0].producing, false);
  assert.equal(s.result.rows[0].trend.length, 1);
  assert.deepEqual(
    s.result.inspections?.map((r) => r.date),
    ['2026-10-01', '2026-10-08', '2026-10-15'],
  );
  assert.equal(s.result.inspections?.[0].deltaC, null);
  assert.deepEqual(
    s.result.sources.map((source) => source.id),
    ['LAB-INS-LAB-W04', 'LAB-RULE-T350'],
  );
  assert.match(s.result.sources[0].body, /2026-09-24: 23 °C/);
  assert.match(s.result.sources[1].body, /at least 20 °C/);
  assert.equal(s.result.period, '24 Sep – 15 Oct 2026');
  assert.match(s.execution!.activity.join(' '), /downtime retains the full/);
  const t200 = executeOperatorRead('read-two', operatorPlan('attention'), {
    ...parameters,
    wellId: 'LAB-W01',
  });
  assert.equal(t200.result.rows[0].thresholdC, 15);
  assert.equal(t200.result.rows[0].downtimeDays, 21);
  assert.match(t200.result.sources[1].body, /at least 15 °C/);
  s.result.rows[0].deltaC = 999;
  assert.equal(
    executeOperatorRead('read-three', operatorPlan('attention'), parameters).result.rows[0].deltaC,
    8.4,
  );
  assert.throws(() =>
    validateSnapshot({
      ...t200,
      result: {
        ...t200.result,
        inspections: [{ ...t200.result.inspections![0], sourceIds: ['invented'] }],
      },
    }),
  );
  assert.throws(() =>
    validateSnapshot({
      ...t200,
      result: {
        ...t200.result,
        inspections: [{ ...t200.result.inspections![0], wellId: 'LAB-W06' }],
      },
    }),
  );
});

test('saved runs use approved composition, fresh metadata and permit explicit empty trend', async () => {
  const app = createApp();
  const view = { ...definition(), plan: { query: 'attention', views: ['line', 'inspections'] } };
  const parameters = {
    ...DEFAULT_OPERATOR_PARAMETERS,
    wellId: 'LAB-W02',
    inspectionCount: 1,
    trendStart: '2027-01-01',
    trendEnd: '2027-01-02',
  };
  const firstRun = randomUUID();
  const response = await post(app, '/api/saved-view-runs', {
    runId: firstRun,
    definition: view,
    parameters,
  });
  assert.equal(response.status, 200);
  const s = validateSnapshot(await response.json());
  assert.deepEqual(s.plan, view.plan);
  assert.equal(s.runId, firstRun);
  assert.equal(s.generation, 'local');
  assert.equal(s.phase, 'ready');
  assert.equal(s.execution?.kind, 'saved-view');
  assert.deepEqual(s.execution?.savedView, { id: view.id, revision: 1, name: view.name });
  assert.deepEqual(s.execution?.parameters, parameters);
  assert.deepEqual(s.result.rows[0].trend, []);
  assert.equal(s.result.inspections?.length, 1);
  assert.equal(s.result.rows[0].spillBbl, 5.4);
  assert.match(s.result.sources[0].body, /earlier estimate was 4.5/);
  s.result.rows[0].spillBbl = 999;
  const secondResponse = await post(app, '/api/saved-view-runs', {
    runId: randomUUID(),
    definition: view,
    parameters,
  });
  const second = validateSnapshot(await secondResponse.json());
  assert.notEqual(s.runId, second.runId);
  assert.notEqual(s.execution?.evaluatedAt, second.execution?.evaluatedAt);
  assert.equal(second.result.rows[0].spillBbl, 5.4);
});

test('saved endpoint rejects forged recipes and snapshot payloads; error/slow injection works', async () => {
  const app = createApp();
  const payload = {
    runId: randomUUID(),
    definition: definition(),
    parameters: DEFAULT_OPERATOR_PARAMETERS,
  };
  for (const invalid of [
    { ...payload, snapshot: {} },
    { ...payload, definition: { ...payload.definition, operation: 'execute-code', code: 'evil' } },
    { ...payload, definition: { ...payload.definition, catalogVersion: 2 } },
    {
      ...payload,
      definition: {
        ...payload.definition,
        plan: { query: 'attention', views: ['ExecutableHTML'] },
      },
    },
    {
      ...payload,
      definition: {
        ...payload.definition,
        plan: { query: 'attention', views: ['status'], computedTotal: 999 },
      },
    },
    { ...payload, parameters: { ...DEFAULT_OPERATOR_PARAMETERS, inspectionCount: 9 } },
  ])
    assert.equal((await post(app, '/api/saved-view-runs', invalid)).status, 400);
  assert.equal(
    (await post(app, '/api/saved-view-runs', { ...payload, fault: 'error' })).status,
    503,
  );
  const controller = new AbortController();
  const pending = post(
    app,
    '/api/saved-view-runs',
    { ...payload, fault: 'slow' },
    controller.signal,
  );
  controller.abort();
  assert.equal((await pending).status, 408);
});

test('operator replay emits fresh overview and known explanations with fresh evidence instead of cached answers', async () => {
  const app = createApp();
  const firstEvents = await events(await post(app, '/api/chat', chatBody()));
  const first = validateSnapshot(
    firstEvents.findLast((event) => event.type === 'data-surface').data,
  );
  assert.deepEqual(first.plan.views, ['status', 'inspections', 'line', 'conflicts']);
  assert.equal(first.result.inspections?.length, 24);
  const input = {
    ...chatBody('Why this status?'),
    parameters: { ...DEFAULT_OPERATOR_PARAMETERS, wellId: 'LAB-W04' },
    snapshot: {
      ...first,
      result: { ...first.result, rows: [{ ...first.result.rows[0], deltaC: 999 }] },
    },
  };
  const followups = await events(await post(app, '/api/chat', input));
  assert.equal(
    followups.some((event) => event.type === 'data-surface'),
    false,
  );
  const answer = followups.find((event) => event.type === 'data-answer').data;
  const fresh = validateSnapshot(answer.snapshot);
  assert.equal(fresh.execution?.kind, 'pipeline');
  assert.equal(fresh.runId, input.runId);
  assert.match(answer.text, /LAB-W04/);
  assert.match(answer.text, /8.4°C/);
  assert.match(answer.text, /20°C threshold/);
  assert.doesNotMatch(answer.text, /999/);
  assert.deepEqual(answer.sourceIds, ['LAB-INS-LAB-W04', 'LAB-RULE-T350']);
  const repeated = await events(await post(app, '/api/chat', { ...input, runId: randomUUID() }));
  assert.notEqual(
    repeated.find((event) => event.type === 'data-answer').data.snapshot.execution.evaluatedAt,
    fresh.execution?.evaluatedAt,
  );
  for (const query of ['downtime', 'spills']) {
    const variants = await events(await post(app, '/api/chat', { ...chatBody(), query }));
    const snapshot = variants.findLast((event) => event.type === 'data-surface').data as Snapshot;
    assert.equal(snapshot.plan.query, query);
    assert.equal(snapshot.result.query, query);
  }
});

test('only saved runs bypass provider; live operator table changes and text answers run provider again', async () => {
  let calls = 0;
  const server = createServer((req, res) => {
    calls++;
    req.resume();
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [{ message: { content: '{"query":"attention","views":["status","line"]}' } }],
      }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No local server');
  try {
    const app = createApp({ baseUrl: `http://127.0.0.1:${address.port}`, model: 'stub' });
    const payload = { ...chatBody(), mode: 'live', representation: 'table' };
    assert.equal((await post(createApp(), '/api/chat', payload)).status, 503);
    const first = await events(await post(app, '/api/chat', payload));
    assert.equal(calls, 1);
    assert.equal(first.findLast((event) => event.type === 'data-surface').data.generation, 'live');
    await events(await post(app, '/api/chat', { ...payload, runId: randomUUID() }));
    assert.equal(calls, 2);
    await events(await post(app, '/api/chat', { ...chatBody('Why this status?'), mode: 'live' }));
    assert.equal(calls, 3);
    const saved = await post(app, '/api/saved-view-runs', {
      runId: randomUUID(),
      definition: definition(),
      parameters: DEFAULT_OPERATOR_PARAMETERS,
    });
    assert.equal(saved.status, 200);
    assert.equal(calls, 3);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('unsupported operator replay questions give an honest fresh text-only scope answer', async () => {
  const result = await events(
    await post(createApp(), '/api/chat', chatBody('What is the repair cost for LAB-W01?')),
  );
  assert.equal(
    result.some((event) => event.type === 'data-surface'),
    false,
  );
  const answer = result.find((event) => event.type === 'data-answer').data;
  assert.deepEqual(answer.sourceIds, []);
  assert.match(answer.text, /does not contain evidence/);
  assert.equal(validateSnapshot(answer.snapshot).execution?.kind, 'pipeline');
});
