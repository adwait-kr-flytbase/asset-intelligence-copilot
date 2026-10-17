import { afterEach, expect, test, vi } from 'vitest';
import { ApiError, api, chatRequestBody } from './api';
import { cellText } from './components/ApplicationPanelView';

afterEach(() => vi.unstubAllGlobals());
test('list requests preserve cursor/filter and use the same-origin cookie session', async () => {
  const mock = vi.fn(async () => Response.json({ items: [], nextCursor: 'next-cursor' }));
  vi.stubGlobal('fetch', mock);
  const result = await api.assets({
    after: 'opaque/+cursor',
    limit: 25,
    area: 'North area',
    search: 'WELL-0200',
  });
  expect(result.nextCursor).toBe('next-cursor');
  const [path, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
  const url = new URL(path, 'http://localhost');
  expect(url.searchParams.get('after')).toBe('opaque/+cursor');
  expect(url.searchParams.get('area')).toBe('North area');
  expect(url.searchParams.get('search')).toBe('WELL-0200');
  expect(init.credentials).toBe('same-origin');
});
test('API failure and invalid data never turn into operational results', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json(
      { error: { code: 'NOT_FOUND', message: 'Resource not found.' } },
      { status: 404 },
    ),
  );
  await expect(api.getResult('missing')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  vi.stubGlobal('fetch', async () => Response.json({ panels: [], text: 'Unverified' }));
  await expect(api.getResult('invalid')).rejects.toBeInstanceOf(ApiError);
  await expect(api.getResult('invalid')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
test('chat uses server conversation plus stable request ID and newest text only', () => {
  const request = {
    id: 'submission-one',
    conversationId: 'conversation-one',
    question: 'Check the latest inspection',
  };
  expect(chatRequestBody(request)).toEqual({
    requestId: 'submission-one',
    conversationId: 'conversation-one',
    message: { text: 'Check the latest inspection' },
  });
  expect(chatRequestBody(request)).toEqual(chatRequestBody(request));
  expect(() => chatRequestBody({ ...request, conversationId: '' })).toThrow();
});
test('rendered values keep exact decimals and distinguish missing, unknown and zero', () => {
  expect(cellText('9007199254740993.123400')).toBe('9007199254740993.123400');
  expect(cellText(null)).toBe('Unknown');
  expect(cellText(undefined)).toBe('Not returned');
  expect(cellText('0.000')).toBe('0.000');
  expect(cellText(false)).toBe('No');
});
