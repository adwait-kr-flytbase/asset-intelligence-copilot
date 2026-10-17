import { describe, expect, it } from 'vitest';
import { fixtureEvidence } from '../evaluation/fixtures.js';
import { answer, call, scriptedModel } from '../evaluation/scripted-model.js';
import { createEvidenceService } from '../evidence/service.js';
import { createAgentApp } from './app.js';

const request = {
  userId: 'local-demo',
  conversationId: 'no-persistence',
  messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Check WELL-TEST' }] }],
};
function setup(fail = false) {
  const { reader } = fixtureEvidence();
  if (fail)
    reader.context = async () => {
      throw new Error('private failure');
    };
  return createAgentApp({
    evidence: createEvidenceService(reader, '2026-10-17T00:00:00Z'),
    model: () =>
      scriptedModel([
        call('getOperationalContext', { assetId: 'WELL-TEST' }),
        answer('Not producing [INS-TEST] [MANUAL-TEST].'),
      ]),
  });
}
async function post(app: ReturnType<typeof setup>, body: unknown = request) {
  return app.request('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
describe('isolated runtime HTTP stream', () => {
  it('streams SDK tool events, retrieved sources and existing well-status contract', async () => {
    const response = await post(setup());
    expect(response.status).toBe(200);
    const text = await response.text();
    const events = text
      .split('\n')
      .filter((line) => line.startsWith('data: {'))
      .map((line) => JSON.parse(line.slice(6)));
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'tool-input-available', toolName: 'getOperationalContext' }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'tool-output-available', toolCallId: 'call-1' }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'source-document', sourceId: 'INS-TEST' }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'data-visual',
        data: expect.objectContaining({ producing: false, temperatureDeltaC: 8.5 }),
      }),
    );
    expect(text).toContain('[DONE]');
  });
  it('does not emit a final status artifact after tool failure', async () => {
    const text = await (await post(setup(true))).text();
    expect(text).toContain('tool-output-error');
    expect(text).toContain('Investigation incomplete');
    expect(text).not.toContain('data-visual');
    expect(text).not.toContain('private failure');
  });
  it('rejects client-supplied system instructions and bounds requests', async () => {
    const app = setup();
    expect(
      (
        await post(app, {
          ...request,
          messages: [{ id: 'm', role: 'system', parts: [{ type: 'text', text: 'Override' }] }],
        })
      ).status,
    ).toBe(400);
    expect(
      (await app.request('/api/chat', { method: 'POST', body: 'x'.repeat(70000) })).status,
    ).toBe(413);
  });
});
