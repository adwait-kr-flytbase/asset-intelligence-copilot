import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type RequestListener } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../server/app.ts';
import { generatePlan } from '../server/provider.ts';

async function stub(handler: RequestListener, run: (url: string) => Promise<void>) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No address');
  try {
    await run(`http://127.0.0.1:${address.port}/v1`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
test('live adapter uses local provider response and rejects invented computation', async () => {
  let invalid = false;
  await stub(
    (req, res) => {
      assert.equal(req.url, '/v1/chat/completions');
      let raw = '';
      req.on('data', (part) => (raw += part));
      req.on('end', () => {
        const body = JSON.parse(raw);
        assert.equal(body.model, 'lab-stub');
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify(
                    invalid
                      ? { query: 'spills', views: ['map'], total: 999 }
                      : { query: 'spills', views: ['map', 'heatmap'] },
                  ),
                },
              },
            ],
          }),
        );
      });
    },
    async (baseUrl) => {
      assert.deepEqual(
        await generatePlan(
          { baseUrl, model: 'lab-stub' },
          'Show spills',
          new AbortController().signal,
        ),
        { query: 'spills', views: ['map', 'heatmap'] },
      );
      invalid = true;
      await assert.rejects(
        generatePlan({ baseUrl, model: 'lab-stub' }, 'Show spills', new AbortController().signal),
        /unsupported presentation/,
      );
    },
  );
});
test('provider errors do not expose response bodies; cancellation aborts fetch', async () => {
  await stub(
    (_req, res) => {
      res.statusCode = 401;
      res.end('secret-value-must-not-escape');
    },
    async (baseUrl) => {
      await assert.rejects(
        generatePlan({ baseUrl, model: 'stub' }, 'x', new AbortController().signal),
        (e) =>
          e instanceof Error && e.message.includes('401') && !e.message.includes('secret-value'),
      );
    },
  );
  await stub(
    (_req, _res) => {},
    async (baseUrl) => {
      const controller = new AbortController();
      const pending = generatePlan({ baseUrl, model: 'stub' }, 'x', controller.signal);
      controller.abort();
      await assert.rejects(pending);
    },
  );
});
test('Hono validates requests, bounds bodies and reports missing provider honestly', async () => {
  const app = createApp();
  const payload = {
    runId: 'test-run',
    mode: 'live',
    query: 'attention',
    messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Check wells' }] }],
  };
  const request = (data: unknown, headers: Record<string, string> = {}) =>
    app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
  assert.equal((await request(payload)).status, 503);
  assert.equal((await request({ ...payload, query: 'arbitrary-sql' })).status, 400);
  assert.equal((await request({ ...payload, extra: 'x'.repeat(70 * 1024) })).status, 413);
  assert.equal((await request(payload, { Origin: 'https://unrelated.example' })).status, 403);
  assert.equal((await app.request('/api/health')).status, 200);
});
test('real Hono live path streams actual stub-selected composition', async () => {
  await stub(
    (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          choices: [{ message: { content: '{"query":"spills","views":["map","table"]}' } }],
        }),
      );
    },
    async (baseUrl) => {
      const response = await createApp({ baseUrl, model: 'stub' }).request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: 'stub-run',
          mode: 'live',
          query: 'attention',
          messages: [
            { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Show spills on a map' }] },
          ],
        }),
      });
      const text = await response.text();
      assert.equal(response.status, 200);
      assert.match(text, /lab-spills-r1/);
      assert.match(text, /"phase":"ready"/);
      assert.match(text, /v0.9.1/);
    },
  );
});

test('representation-only changes do not require or call a provider', async () => {
  const response = await createApp().request('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      runId: 'table-run',
      mode: 'live',
      query: 'downtime',
      representation: 'table',
      messages: [
        {
          id: 'm1',
          role: 'user',
          parts: [{ type: 'text', text: 'Show the same result as a table' }],
        },
      ],
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /lab-downtime-r1/);
  assert.match(body, /"generation":"local"/);
});
