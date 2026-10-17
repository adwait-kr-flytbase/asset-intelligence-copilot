import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app';
import { chatAnswer, evidenceClosure, executeRead } from '../server/read';
import { fixtureEvidence } from '../server/fixtures';
import {
  assetsSchema,
  kinds,
  operationalVisualSchema,
  responseSchema,
  type SavedView,
} from '../src/contracts';

const app = createApp();
const all = { wellId: 'all' };
const definition = (
  kind: SavedView['kind'],
  parameters: SavedView['parameters'] = all,
): SavedView => ({
  id: randomUUID(),
  revision: 1,
  name: `Saved ${kind}`,
  kind,
  parameters,
  createdAt: new Date().toISOString(),
});
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

test('all eight read kinds produce validated evidence-backed read-only results', () => {
  for (const kind of kinds) {
    const requestId = randomUUID();
    const response = executeRead(requestId, kind, all);
    assert.ok(response.visuals.every((v) => v.runId === requestId));
    assert.equal(
      response.visuals.every((v) => v.artifact.kind === kind && v.readOnly),
      true,
    );
    responseSchema.parse(response);
    for (const v of response.visuals) {
      const ids = new Set(v.evidence.map((e) => e.id));
      assert.ok(v.artifact.sourceIds.every((id) => ids.has(id)));
      assert.ok(v.evidence.every((e) => e.visibility === 'shared'));
    }
  }
});

test('cost and downtime use distinct methods, metrics persist in saved reads, and IDs are fresh', async () => {
  const cost = chatAnswer('a', 'Which wells have the highest repair expenses?', all);
  assert.match(cost.answer, /43,250 USD/);
  assert.equal(cost.parameters.metric, 'repair-cost');
  const downtime = chatAnswer('b', 'Compare lost production time between wells', all);
  assert.equal(downtime.parameters.metric, 'downtime');
  assert.match(downtime.answer, /49 days/);
  const d = definition('ranking', downtime.parameters);
  const r = await post('/api/views/run', {
    requestId: 'saved',
    definition: d,
    parameters: { wellId: 'LAB-W04' },
  });
  assert.equal(r.status, 200);
  const read = responseSchema.parse(await r.json());
  const a = read.visuals[0].artifact;
  assert.equal(a.kind, 'ranking');
  if (a.kind === 'ranking') {
    assert.equal(a.unit, 'days');
    assert.equal(a.items[0].value, 14);
  }
  assert.equal(read.parameters.metric, 'downtime');
  const again = executeRead('next', 'ranking', { wellId: 'LAB-W02', metric: 'repair-cost' });
  assert.match(again.answer, /6,200 USD/);
  assert.notEqual(cost.visuals[0].runId, again.visuals[0].runId);
  assert.notEqual(cost.visuals[0].resultId, again.visuals[0].resultId);
  assert.notEqual(cost.visuals[0].artifact.id, again.visuals[0].artifact.id);
  const changed = await post('/api/views/run', {
    requestId: 'changed',
    definition: d,
    parameters: { wellId: 'all', metric: 'repair-cost' },
  });
  assert.equal(changed.status, 400);
});

test('well scope is real, correction records never relabel another well, evidence closure stays scoped', () => {
  for (const kind of kinds) {
    const r = executeRead('scope', kind, { wellId: 'LAB-W02' });
    for (const v of r.visuals) {
      assert.deepEqual(v.artifact.scope.wellIds, ['LAB-W02']);
      assert.equal(
        v.evidence.some((e) => e.id.includes('LAB-W01')),
        false,
      );
      if (v.artifact.kind === 'correction') {
        assert.equal(v.artifact.recordId, 'REPAIR-LAB-W02');
        assert.equal(v.artifact.original, '110');
        assert.equal(v.artifact.proposed, '115');
        assert.ok(v.evidence.every((e) => e.recordId === 'REPAIR-LAB-W02'));
      }
    }
  }
  const comparison = chatAnswer('compare', 'Compare costs for W01 versus W02', all);
  assert.deepEqual(comparison.visuals[0].artifact.scope.wellIds, ['LAB-W01', 'LAB-W02']);
  assert.deepEqual(comparison.parameters.wellIds, ['LAB-W01', 'LAB-W02']);
  assert.match(comparison.answer, /24,600 USD/);
});

test('series preserves nulls and exact date scope; unrelated panels retain their own source period', () => {
  const r = executeRead('series', 'series', {
    wellId: 'LAB-W04',
    from: '2026-10-01',
    to: '2026-10-08',
  });
  const a = r.visuals[0].artifact;
  assert.equal(a.kind, 'series');
  if (a.kind === 'series') {
    assert.equal(a.unit, '°C');
    assert.deepEqual(a.series[0].points, [
      { date: '2026-10-01', value: null },
      { date: '2026-10-08', value: 32.1 },
    ]);
    assert.deepEqual(a.series[1].points, [
      { date: '2026-10-01', value: 24.1 },
      { date: '2026-10-08', value: 23.1 },
    ]);
    assert.equal(a.events.length, 1);
  }
  const empty = executeRead('empty', 'series', {
    wellId: 'LAB-W02',
    from: '2030-01-01',
    to: '2030-01-02',
  });
  assert.match(empty.answer, /No readings/);
  const c = executeRead('cost', 'ranking', {
    wellId: 'LAB-W04',
    from: '2030-01-01',
    to: '2030-01-02',
  });
  assert.equal(c.visuals[0].artifact.scope.from, '2026-09-24');
  assert.match(c.visuals[0].meta.warnings.join(' '), /Date controls apply only/);
  assert.equal(executeRead('all-series', 'series', all).visuals.length, 6);
});

test('matrix counts spill events with complete axis pairs; geometry missing stays null', () => {
  assert.equal(chatAnswer('spill-count', 'How many spills happened?', all).intent, 'matrix');
  assert.equal(
    chatAnswer('spill-volume', 'Compare spill volumes across wells', all).parameters.metric,
    'spill-volume',
  );
  const a = executeRead('matrix', 'matrix', { ...all, metric: 'spill-volume' }).visuals[0].artifact;
  assert.equal(a.kind, 'matrix');
  if (a.kind === 'matrix') {
    assert.equal(a.unit, 'events');
    assert.equal(a.cells.length, a.rows.length * a.columns.length);
    assert.equal(
      a.cells.reduce((n, c) => n + (c.value || 0), 0),
      3,
    );
  }
  const map = executeRead('geo', 'geo', all).visuals[0].artifact;
  if (map.kind === 'geo') assert.equal(map.points.find((p) => p.wellId === 'LAB-W05')!.lat, null);
});

test('text-only explanations use citations and fresh sources; unknown capabilities never invent charts', () => {
  const status = chatAnswer('why', 'Why is LAB-W04 below threshold?', all);
  assert.equal(status.visuals.length, 0);
  assert.equal(status.parameters.wellId, 'LAB-W04');
  assert.match(status.answer, /8.4 °C.*20 °C/);
  assert.ok(status.citations?.claims[0].sourceIds.includes('LAB-INS-LAB-W04'));
  assert.equal(status.citations?.runId, 'why');
  for (const prompt of [
    'Forecast future repair costs',
    'What is production rate in bpd?',
    'What was total production?',
    'Apply this correction',
    'What is the weather tomorrow?',
  ]) {
    const result = chatAnswer('unknown', prompt, all);
    assert.equal(result.visuals.length, 0, prompt);
    assert.match(result.answer, /no evidence or tool/);
  }
  assert.equal(chatAnswer('new', 'Show recorded repair costs', all).intent, 'ranking');
  assert.equal(chatAnswer('new2', 'Where are all wells?', all).intent, 'geo');
});

test('HTTP validates body, wells, origins, read definitions, and health/assets', async () => {
  const health = (await (await app.request('/api/health')).json()) as {
    status: string;
    mode: string;
    sampleAvailable: boolean;
  };
  assert.equal(health.status, 'ok');
  assert.equal(health.mode, 'fixture');
  assert.equal(typeof health.sampleAvailable, 'boolean');
  assert.equal(assetsSchema.parse(await (await app.request('/api/assets')).json()).length, 6);
  for (const parameters of [
    { wellId: 'all', wellIds: ['LAB-W99'] },
    { wellId: 'all', wellIds: [] },
    { wellId: 'all', wellIds: ['LAB-W01', 'LAB-W01'] },
    { wellId: 'LAB-W02', wellIds: ['LAB-W01'] },
    { wellId: 'LAB-W99' },
    { wellId: 'all', from: '2026-10-08' },
    { wellId: 'all', from: '2026-10-08', to: '2026-10-01' },
  ]) {
    assert.equal(
      (
        await post('/api/views/run', {
          requestId: 'bad',
          definition: definition('geo'),
          parameters,
        })
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await post('/api/views/run', {
        requestId: 'bad',
        definition: { ...definition('geo'), code: 'alert(1)' },
        parameters: all,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post(
        '/api/views/run',
        { requestId: 'bad', definition: definition('geo'), parameters: all },
        { origin: 'https://evil.example' },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post('/api/chat', {
        requestId: 'large',
        parameters: all,
        messages: [{ id: 'm', role: 'user', parts: [{ type: 'text', text: 'a'.repeat(70000) }] }],
      })
    ).status,
    413,
  );
  assert.equal(
    (
      await post('/api/chat', {
        requestId: 'bad-well',
        parameters: all,
        messages: [{ id: 'm', role: 'user', parts: [{ type: 'text', text: 'Show W99 costs' }] }],
      })
    ).status,
    400,
  );
});

test('AI SDK SSE delivers matching text and typed result including text-only answers', async () => {
  for (const question of [
    'Which wells need attention, and where are they?',
    'Why is W04 below threshold?',
  ]) {
    const r = await post('/api/chat', {
      requestId: 'sse',
      parameters: all,
      messages: [{ id: 'm', role: 'user', parts: [{ type: 'text', text: question }] }],
    });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') || '', /text\/event-stream/);
    const data = (await r.text())
      .split('\n')
      .filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
      .map((line) => JSON.parse(line.slice(6)));
    const result = responseSchema.parse(data.find((p) => p.type === 'data-result').data);
    assert.equal(
      data
        .filter((p) => p.type === 'text-delta')
        .map((p) => p.delta)
        .join(''),
      result.answer,
    );
    assert.equal(result.visuals.length, question.startsWith('Why') ? 0 : 1);
    assert.ok(result.visuals.every((v) => v.runId === 'sse'));
    if (result.citations) assert.equal(result.citations.runId, 'sse');
    assert.equal(
      data.some((p) => p.type === 'finish'),
      true,
    );
  }
});

test('nested unknown provenance, private sources, and executable fields are rejected', () => {
  const records = fixtureEvidence();
  assert.throws(() => evidenceClosure(['unknown'], records));
  const first = records.values().next().value!;
  records.set(first.id, { ...first, inputSourceIds: ['unknown'] });
  assert.throws(() => evidenceClosure([first.id], records));
  records.set(first.id, { ...first, visibility: 'private' });
  assert.throws(() => evidenceClosure([first.id], records));
  const visual = executeRead('valid', 'geo', all).visuals[0];
  assert.equal(
    operationalVisualSchema.safeParse({ ...visual, html: '<script>alert(1)</script>' }).success,
    false,
  );
  assert.equal(
    operationalVisualSchema.safeParse({
      ...visual,
      artifact: { ...visual.artifact, sourceIds: ['unknown'] },
    }).success,
    false,
  );
});

test('saved multi-well definitions reopen their exact subset and explicit All clears it', async () => {
  const initial = chatAnswer('multi', 'Compare repair costs for W01 and W02', all);
  const d = definition('ranking', initial.parameters);
  assert.deepEqual(d.parameters.wellIds, ['LAB-W01', 'LAB-W02']);
  const response = await post('/api/views/run', {
    requestId: 'reopened',
    definition: d,
    parameters: d.parameters,
  });
  assert.equal(response.status, 200);
  const reopened = responseSchema.parse(await response.json());
  assert.deepEqual(reopened.visuals[0].artifact.scope.wellIds, ['LAB-W01', 'LAB-W02']);
  assert.deepEqual(reopened.parameters.wellIds, ['LAB-W01', 'LAB-W02']);
  assert.equal(reopened.visuals[0].runId, 'reopened');
  assert.match(reopened.answer, /24,600 USD/);
  const applied = await post('/api/views/run', {
    requestId: 'all-again',
    definition: d,
    parameters: { wellId: 'all' },
  });
  assert.equal(applied.status, 200);
  const expanded = responseSchema.parse(await applied.json());
  assert.equal(expanded.visuals[0].artifact.scope.wellIds.length, 6);
  assert.equal(expanded.parameters.wellIds, undefined);
  const scopedFollowup = chatAnswer('why-multi', 'Explain their status', d.parameters);
  assert.equal(scopedFollowup.citations?.claims.length, 2);
  const different = chatAnswer('new-well', 'Explain W04 status', d.parameters);
  assert.equal(different.parameters.wellId, 'LAB-W04');
  assert.equal(different.parameters.wellIds, undefined);
  assert.equal(different.citations?.claims.length, 1);
});

test('explicit inspection matrix and thermal map choose the requested visual and correct units', () => {
  const matrix = chatAnswer('inspection-matrix', 'Show an inspection matrix across all wells', all);
  assert.equal(matrix.intent, 'matrix');
  const a = matrix.visuals[0].artifact;
  assert.equal(a.kind, 'matrix');
  if (a.kind === 'matrix') {
    assert.equal(a.unit, '°C');
    assert.equal(a.rows.length, 6);
    assert.equal(a.cells.filter((c) => c.value === null).length, 1);
  }
  assert.equal(chatAnswer('thermal-map', 'Show a thermal map of all wells', all).intent, 'geo');
});
