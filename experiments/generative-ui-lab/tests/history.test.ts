import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultPlan, getResult } from '../server/domain.ts';
import {
  completeAnswer,
  emptyHistory,
  latestResult,
  migrateLegacy,
  readHistory,
} from '../src/history.ts';
import { makeSnapshot } from '../src/protocol.ts';

test('history preserves every answer and exact result version across reload', () => {
  const h = emptyHistory();
  let t = h.threads[0];
  for (let i = 0; i < 8; i++) {
    const runId = `run-${i}`;
    t = {
      ...t,
      entries: [
        ...t.entries,
        {
          id: runId,
          runId,
          role: 'assistant',
          text: '',
          status: 'pending',
          createdAt: '2026-10-17',
        },
      ],
    };
    t = completeAnswer(
      t,
      makeSnapshot(runId, defaultPlan('attention'), getResult('attention'), 'ready'),
      `Answer ${i}`,
    );
  }
  h.threads = [t];
  const restored = readHistory(JSON.stringify(h));
  assert.equal(restored.threads[0].entries.length, 8);
  assert.equal(restored.threads[0].results['run-0'].runId, 'run-0');
  assert.equal(latestResult(restored.threads[0])?.runId, 'run-7');
  assert.equal(
    completeAnswer(
      t,
      makeSnapshot('late', defaultPlan('spills'), getResult('spills'), 'ready'),
      'late',
    ),
    t,
  );
});
test('history rejects broken result links and recovers interrupted updates', () => {
  const h = emptyHistory();
  h.threads[0].entries.push({
    id: 'a',
    runId: 'run',
    role: 'assistant',
    text: '',
    status: 'pending',
    createdAt: 'today',
  });
  assert.equal(readHistory(JSON.stringify(h)).threads[0].entries[0].status, 'cancelled');
  h.threads[0].entries[0].resultId = 'absent';
  assert.throws(() => readHistory(JSON.stringify(h)));
  assert.throws(() => readHistory('{bad json'));
  h.threads[0].entries[0] = {
    ...h.threads[0].entries[0],
    resultId: 'constructor',
    runId: 'constructor',
    status: 'complete',
  };
  assert.throws(() => readHistory(JSON.stringify(h)));
});
test('legacy complete result migrates with an answer link; incomplete never migrates', () => {
  const s = makeSnapshot('old', defaultPlan('downtime'), getResult('downtime'), 'ready');
  const h = migrateLegacy(JSON.stringify({ schemaVersion: 1, snapshot: s }));
  assert.equal(readHistory(JSON.stringify(h)).threads[0].entries[0].resultId, 'old');
  assert.throws(() =>
    migrateLegacy(JSON.stringify({ schemaVersion: 1, snapshot: { ...s, phase: 'partial' } })),
  );
});

test('new visual answer can be saved without moving the active workspace', () => {
  const h = emptyHistory();
  const first = makeSnapshot('first', defaultPlan('attention'), getResult('attention'), 'ready');
  const next = makeSnapshot('next', defaultPlan('spills'), getResult('spills'), 'ready');
  const t = {
    ...h.threads[0],
    activeResultId: first.runId,
    results: { [first.runId]: first },
    entries: [
      {
        id: 'pending',
        runId: 'next',
        role: 'assistant' as const,
        text: '',
        status: 'pending' as const,
        createdAt: 'today',
      },
    ],
  };
  const completed = completeAnswer(t, next, 'Spill result prepared', false);
  assert.equal(completed.activeResultId, 'first');
  assert.equal(completed.results.first, first);
  assert.equal(completed.entries[0].resultId, 'next');
  assert.equal(latestResult(completed)?.runId, 'next');
  assert.equal(completeAnswer(t, next, 'Explicit update', true).activeResultId, 'next');
  h.threads = [completed];
  const restored = readHistory(JSON.stringify(h)).threads[0];
  assert.equal(restored.activeResultId, 'first');
  assert.equal(latestResult(restored)?.runId, 'next');
});

test('text-only explanations retain exact evidence context and reject invented source links', () => {
  const h = emptyHistory();
  const s = makeSnapshot('basis', defaultPlan('attention'), getResult('attention'), 'ready');
  h.threads[0].results[s.runId] = s;
  h.threads[0].activeResultId = s.runId;
  h.threads[0].entries.push({
    id: 'explanation',
    runId: 'reply',
    role: 'assistant',
    text: 'Explanation',
    status: 'complete',
    createdAt: 'today',
    contextResultId: s.runId,
    sourceIds: [s.result.rows[0].sourceIds[0]],
  });
  assert.equal(readHistory(JSON.stringify(h)).threads[0].entries[0].resultId, undefined);
  h.threads[0].entries[0].sourceIds = ['invented'];
  assert.throws(() => readHistory(JSON.stringify(h)));
  h.threads[0].entries[0].sourceIds = [];
  h.threads[0].entries[0].contextResultId = 'missing';
  assert.throws(() => readHistory(JSON.stringify(h)));
});
