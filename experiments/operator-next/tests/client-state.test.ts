import assert from 'node:assert/strict';
import test from 'node:test';
import { loadStore, storageKey, checkedResponse } from '../src/types';
import { chatAnswer } from '../server/read';
function storage(raw: string | null) {
  let value = raw;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => (key === storageKey ? value : null),
      setItem: (_key: string, next: string) => {
        value = next;
      },
    },
  });
  return () => value;
}
test('unreadable history is retained and never becomes a fresh automatic investigation', () => {
  const original = '{broken';
  const read = storage(original);
  const loaded = loadStore();
  assert.equal(loaded.blocked, true);
  assert.equal(loaded.sample, false);
  assert.equal(read(), original);
});
test('an interrupted investigation is labelled stopped on reload, without manufacturing an answer', () => {
  storage(
    JSON.stringify({
      version: 1,
      activeId: 'thread',
      views: [],
      threads: [
        {
          id: 'thread',
          title: 'Open read',
          updatedAt: new Date().toISOString(),
          sample: false,
          entries: [
            { id: 'pending', requestId: 'run', role: 'assistant', text: '', status: 'pending' },
          ],
        },
      ],
    }),
  );
  const loaded = loadStore();
  assert.equal(loaded.blocked, false);
  assert.equal(loaded.store.threads[0].entries[0].status, 'stopped');
  assert.equal(loaded.store.threads[0].entries[0].response, undefined);
});
test('both artifact and text evidence must correlate to the requested investigation', () => {
  const visual = chatAnswer('run-a', 'show wells on a map', { wellId: 'all' });
  assert.equal(checkedResponse(visual, 'run-a').requestId, 'run-a');
  assert.throws(() => checkedResponse(visual, 'run-b'));
  const text = chatAnswer('run-a', 'Explain status for W01', { wellId: 'all' });
  assert(text.citations);
  text.citations.runId = 'different-read';
  assert.throws(() => checkedResponse(text, 'run-a'));
});
