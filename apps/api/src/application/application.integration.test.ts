import { randomUUID } from 'node:crypto';
import { createDatabase } from '@repo/db';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createApplicationApp } from './app.js';
import { createApplicationData } from './data.js';
import type { AgentRunner } from './ports.js';

// Run only against a disposable migrated database seeded with sample-data.
const url = process.env.APPLICATION_TEST_DATABASE_URL;
const integration = test.skipIf(!url);
let connection: ReturnType<typeof createDatabase>;
let runtime: ReturnType<typeof createApplicationApp>;
let calls = 0;
let release: (() => void) | undefined;
let releaseRead: (() => void) | undefined;
let lastMessages: { role: string; content: string }[] = [];
const panel = {
  id: 'status',
  title: 'Well status',
  recipe: {
    operation: 'current-status',
    presentation: 'status',
    parameters: { scope: { kind: 'asset', assetId: 'WELL-0001' }, limit: 1 },
  },
} as const;
let cookie = '';
async function request(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
  auth = cookie,
) {
  return runtime.app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: auth },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function json(path: string, body?: unknown, method?: string, auth?: string) {
  const response = await request(path, body, method, auth);
  const value = await response.json();
  expect(response.status, JSON.stringify(value)).toBeLessThan(300);
  return value;
}
beforeAll(async () => {
  if (!url) return;
  if (!new URL(url).pathname.includes('application_smoke'))
    throw new Error('Disposable application_smoke database required');
  connection = createDatabase(url);
  const data = createApplicationData(connection);
  const runner: AgentRunner = async (input) => {
    calls++;
    lastMessages = input.messages;
    if (input.messages.at(-1)?.content === 'delayed')
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    // Deliberately ignore cancellation to verify publication is fenced by run state.
    return {
      text: 'Controlled state-test response.',
      panels: [],
      evidence: [],
      entityRefs: [],
      warnings: [],
    };
  };
  runtime = createApplicationApp({
    connection,
    data,
    read: async (panels, context) => {
      if (panels[0]?.id === 'delayed-read')
        await new Promise<void>((resolve) => {
          releaseRead = resolve;
        });
      context.signal.throwIfAborted();
      return data.read(panels, context);
    },
    agent: runner,
    namespace: 'challenge',
    sessionSecret: 'disposable-integration-test-secret-123',
    asOf: '2026-10-17T00:00:00Z',
  });
  const response = await request('/api/session/persona', { personaId: 'U-201' });
  expect(response.status).toBe(200);
  cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
});
afterAll(async () => {
  if (runtime) await runtime.shutdown();
  if (connection) await connection.close();
});
integration(
  'bounded selectors, cursor ties, history, idempotency, private ownership, views and cancellation',
  async () => {
    expect((await request('/api/conversations', undefined, 'GET', '')).status).toBe(401);
    const personas = await json('/api/personas?limit=2');
    expect(personas.items).toHaveLength(2);
    expect(personas.nextCursor).toBeTruthy();
    expect((await json(`/api/personas?limit=100&after=${personas.nextCursor}`)).items).toHaveLength(
      13,
    );
    expect((await json('/api/areas?limit=2')).nextCursor).toBeTruthy();
    let cursor: string | null = null;
    const assetIds: string[] = [];
    do {
      const page = await json(`/api/assets?limit=37${cursor ? `&after=${cursor}` : ''}`);
      assetIds.push(...page.items.map((x: { id: string }) => x.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(assetIds).toHaveLength(200);
    expect(new Set(assetIds).size).toBe(200);
    // Identical timestamps exercise the ID tie-breaker and microsecond-preserving cursor.
    const ids = Array.from({ length: 5 }, () => randomUUID());
    for (const id of ids)
      await connection.pool.query(
        "INSERT INTO application_conversations(namespace,id,owner_id,title,created_at) VALUES ('challenge',$1,'U-201','Pagination','2026-10-17T12:00:00.123456Z')",
        [id],
      );
    cursor = null;
    const seen: string[] = [];
    do {
      const page = await json(`/api/conversations?limit=2${cursor ? `&after=${cursor}` : ''}`);
      seen.push(...page.items.map((x: { id: string }) => x.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(new Set(seen).size).toBe(5);
    expect(seen).toEqual([...ids].sort().reverse());
    expect((await request('/api/conversations?after=bad')).status).toBe(400);
    expect((await request('/api/assets?limit=101')).status).toBe(400);
    const conversation = await json('/api/conversations', { title: 'Critical smoke' });
    const body = {
      conversationId: conversation.id,
      requestId: randomUUID(),
      message: { text: 'first' },
    };
    const first = await request('/api/chat', body);
    const runId = first.headers.get('x-run-id') ?? '';
    expect(await first.text()).toContain('Controlled state-test response.');
    const completed = await json(`/api/runs/${runId}`);
    expect(completed.status).toBe('completed');
    const replay = await request('/api/chat', body);
    await replay.text();
    expect(calls).toBe(1);
    expect((await request('/api/chat', { ...body, message: { text: 'changed' } })).status).toBe(
      409,
    );
    const second = await request('/api/chat', {
      ...body,
      requestId: randomUUID(),
      message: { text: 'second' },
    });
    await second.text();
    expect(lastMessages.map((x) => x.content)).toEqual([
      'first',
      'Controlled state-test response.',
      'second',
    ]);
    const history = await json(`/api/conversations/${conversation.id}?limit=2`);
    expect(history.messages).toHaveLength(2);
    expect(history.nextCursor).toBe(2);
    expect(history.messages[1].parts.every((x: { type: string }) => x.type === 'text')).toBe(true);
    expect(history.messages[1].metadata.resultId).toBeTruthy();
    expect(
      (await json(`/api/conversations/${conversation.id}?limit=2&before=${history.nextCursor}`))
        .messages,
    ).toHaveLength(2);
    const read = await json('/api/read-runs', { requestId: randomUUID(), panels: [panel] });
    expect(calls).toBe(2);
    expect(read.result.panels[0].status.assetId).toBe('WELL-0001');
    expect(read.result.evidence.length).toBeGreaterThan(0);
    expect(
      (await json(`/api/evidence/${read.result.evidence[0].id}?resultId=${read.result.id}`))
        .sourceVersionId,
    ).toBeTruthy();
    const view = await json('/api/saved-views', { sourceResultId: read.result.id, name: 'Well' });
    await expect(
      connection.pool.query(
        `INSERT INTO application_runs(namespace,id,owner_id,view_id,view_revision,request_id,input_hash,kind,status,input,as_of) VALUES ('challenge',$1,'U-201',$2,NULL,$3,'test','saved-view','running','{}',now())`,
        [randomUUID(), view.id, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      connection.pool.query(
        `INSERT INTO application_messages(namespace,id,owner_id,conversation_id,run_id,sequence,role,message) VALUES ('challenge',$1,'U-201',$2,$3,100,'user','{}')`,
        [randomUUID(), ids[0], runId],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    const viewList = await json('/api/saved-views?limit=1');
    expect(viewList.items[0].definition).toBeUndefined();
    const saved = await json(`/api/saved-views/${view.id}/runs`, {
      requestId: randomUUID(),
      parameters: { scope: { kind: 'asset', assetId: 'WELL-0002' } },
    });
    expect(saved.result.panels[0].status.assetId).toBe('WELL-0002');
    expect(calls).toBe(2);
    await json(
      `/api/saved-views/${view.id}`,
      { expectedRevision: 1, definition: { ...view.definition, name: 'Updated' } },
      'PATCH',
    );
    expect(
      (
        await request(
          `/api/saved-views/${view.id}`,
          { expectedRevision: 1, definition: view.definition },
          'PATCH',
        )
      ).status,
    ).toBe(409);
    const refs = await json('/api/references?limit=1');
    expect(refs.items).toHaveLength(1);
    expect(refs.nextCursor).toBeTruthy();
    expect(refs.items[0].payload).toBeUndefined();
    const other = await request('/api/session/persona', { personaId: 'U-202' });
    const jessica = other.headers.get('set-cookie')?.split(';')[0] ?? '';
    for (const path of [
      `/api/conversations/${conversation.id}`,
      `/api/results/${read.result.id}`,
      `/api/saved-views/${view.id}`,
      `/api/evidence/${read.result.evidence[0].id}?resultId=${read.result.id}`,
    ])
      expect((await request(path, undefined, 'GET', jessica)).status).toBe(404);
    expect((await json('/api/references', undefined, 'GET', jessica)).items).toHaveLength(0);
    const delayed = await request('/api/chat', {
      ...body,
      requestId: randomUUID(),
      message: { text: 'delayed' },
    });
    const delayedId = delayed.headers.get('x-run-id') ?? '';
    const drain = delayed.text();
    for (let attempt = 0; !release && attempt < 100; attempt++)
      await new Promise((r) => setTimeout(r, 10));
    expect(release).toBeTypeOf('function');
    expect(
      (
        await request('/api/chat', {
          ...body,
          requestId: randomUUID(),
          message: { text: 'parallel' },
        })
      ).status,
    ).toBe(409);
    expect((await request('/api/assets?limit=1')).status).toBe(200);
    await json(`/api/runs/${delayedId}/cancel`, {});
    release?.();
    await drain;
    const cancelled = await json(`/api/runs/${delayedId}`);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.resultId).toBeNull();
    const disconnect = new AbortController();
    const readRequestId = randomUUID();
    const disconnectedRead = runtime.app.request('/api/read-runs', {
      method: 'POST',
      signal: disconnect.signal,
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: readRequestId,
        panels: [{ ...panel, id: 'delayed-read' }],
      }),
    });
    for (let attempt = 0; !releaseRead && attempt < 100; attempt++)
      await new Promise((r) => setTimeout(r, 10));
    expect(releaseRead).toBeTypeOf('function');
    disconnect.abort();
    releaseRead?.();
    await disconnectedRead;
    const disconnectedState = await connection.pool.query(
      'SELECT status FROM application_runs WHERE namespace=$1 AND owner_id=$2 AND request_id=$3',
      ['challenge', 'U-201', readRequestId],
    );
    expect(disconnectedState.rows[0].status).toBe('cancelled');
    const malformed = await runtime.app.request('/api/conversations', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(malformed.status).toBe(400);
    console.log(
      'Application integration: pagination, real reads, private evidence/views, history, replay and cancellation passed.',
    );
  },
  60000,
);
