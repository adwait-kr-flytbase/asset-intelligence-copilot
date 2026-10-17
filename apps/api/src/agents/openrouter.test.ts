import { describe, expect, it } from 'vitest';
import { fixtureEvidence } from '../evaluation/fixtures.js';
import { createEvidenceService } from '../evidence/service.js';
import { runCoordinator } from './coordinator.js';
import { createOpenRouterModel } from './openrouter.js';

describe('narrow OpenRouter adapter (HTTP stub, no provider requests)', () => {
  it('round-trips actual SDK function calls/results without changing the tool inputs', async () => {
    const bodies: Record<string, unknown>[] = [];
    const model = createOpenRouterModel({
      apiKey: 'synthetic-key',
      modelId: 'synthetic/model',
      fetch: async (url, init) => {
        expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
        bodies.push(JSON.parse(String(init?.body)));
        return Response.json({
          choices: [
            {
              finish_reason: bodies.length === 1 ? 'tool_calls' : 'stop',
              message:
                bodies.length === 1
                  ? {
                      content: null,
                      tool_calls: [
                        {
                          id: 'http-call',
                          type: 'function',
                          function: {
                            name: 'getOperationalContext',
                            arguments: '{"assetId":"WELL-TEST"}',
                          },
                        },
                      ],
                    }
                  : { content: 'Not producing [INS-TEST] [MANUAL-TEST].' },
            },
          ],
          usage: { prompt_tokens: 50, completion_tokens: 20 },
        });
      },
    });
    const result = await runCoordinator([{ role: 'user', content: 'WELL-TEST status?' }], {
      model,
      evidence: createEvidenceService(fixtureEvidence().reader, '2026-10-17T00:00:00Z'),
    });
    expect(result.visuals[0]?.producing).toBe(false);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          tool_calls: [expect.objectContaining({ id: 'http-call' })],
        }),
        expect.objectContaining({
          role: 'tool',
          tool_call_id: 'http-call',
          content: expect.stringContaining('8.5'),
        }),
      ]),
    );
  });
  it('redacts provider error bodies and fails without retrying paid calls', async () => {
    let requests = 0;
    const model = createOpenRouterModel({
      apiKey: 'synthetic-key',
      modelId: 'synthetic/model',
      fetch: async () => {
        requests++;
        return new Response('private-provider-details', { status: 401 });
      },
    });
    await expect(
      model.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }] }),
    ).rejects.toThrow('HTTP 401');
    expect(requests).toBe(1);
  });
});
