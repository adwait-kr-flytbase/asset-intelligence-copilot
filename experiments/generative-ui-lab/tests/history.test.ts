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
