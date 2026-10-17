import { describe, expect, it } from 'vitest';
import { app } from './app.js';

const request = {
  userId: 'U-fixture',
  conversationId: 'fixture-1',
  messages: [{ id: 'm-1', role: 'user', parts: [{ type: 'text', text: 'Test the plumbing' }] }],
};

describe('API boundary', () => {
  it('reports readiness without requiring a dataset or model credentials', async () => {
    const response = await app.request('/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', mode: 'fixture' });
  });

  it('streams a synthetic visual and its source using the UI message protocol', async () => {
    const response = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
    const text = await response.text();
    const events = text
      .split('\n')
      .filter((line) => line.startsWith('data: {'))
      .map((line) => JSON.parse(line.slice(6)));
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'data-visual',
        data: expect.objectContaining({ assetId: 'WELL-FIXTURE', sources: expect.any(Array) }),
      }),
    );
    expect(text).toContain('[DONE]');
  });

  it.each([
    '{broken',
    '{}',
    JSON.stringify({ ...request, userId: '' }),
    JSON.stringify({
      ...request,
      messages: [{ id: 'm', role: 'user', parts: [{ type: 'text' }] }],
    }),
  ])('rejects malformed or unscoped requests before streaming: %s', async (body) => {
    const response = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
  });

  it('bounds incoming chat payloads', async () => {
    const response = await app.request('/api/chat', {
      method: 'POST',
      body: 'x'.repeat(70_000),
    });
    expect(response.status).toBe(413);
  });

  it('returns a machine-readable unknown route error', async () => {
    const response = await app.request('/api/missing');
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
  });
});
