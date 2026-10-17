import { describe, expect, it } from 'vitest';
import { runCoordinator } from '../agents/coordinator.js';
import { createEvidenceService } from '../evidence/service.js';
import { fixtureEvidence } from './fixtures.js';
import { answer, call, scriptedModel } from './scripted-model.js';

const asOf = '2026-10-17T00:00:00.000Z';
const messages = [
  { role: 'user' as const, content: 'Is WELL-TEST producing? Explain conflicting evidence.' },
];

describe('first-slice evaluation: scripted orchestration, not live-model quality', () => {
  it('discards an earlier status artifact when a repeated lookup returns unresolved evidence', async () => {
    const fixture = fixtureEvidence();
    let lookups = 0;
    fixture.reader.context = async () => {
      const context = structuredClone(fixture.context);
      if (++lookups === 2)
        context.notes.push({
          id: 'CORRECTION-LATE',
          type: 'correction',
          inspectionId: 'INS-TEST',
          text: 'Reading disputed.',
          author: 'Reviewer',
          createdAt: asOf,
          validFrom: '2026-10-17',
          validTo: null,
          source: { ...context.asset.source, id: 'CORRECTION-LATE' },
        });
      return context;
    };
    const result = await runCoordinator(messages, {
      evidence: createEvidenceService(fixture.reader, asOf),
      model: scriptedModel([
        call('getOperationalContext', { assetId: 'WELL-TEST' }),
        call('getOperationalContext', { assetId: 'WELL-TEST' }, 'call-2'),
        answer('Status is now unknown pending correction interpretation [CORRECTION-LATE].'),
      ]),
    });
    expect(result.visuals).toEqual([]);
  });
  it('returns exact status, citations and actual trace while retaining a conflicting note', async () => {
    const fixture = fixtureEvidence();
    const result = await runCoordinator(messages, {
      evidence: createEvidenceService(fixture.reader, asOf),
      model: scriptedModel([
        call('getOperationalContext', { assetId: 'WELL-TEST' }),
        answer(
          'Not producing: delta 8.5°C, below 15°C [INS-TEST] [MANUAL-TEST]. The operator claim remains unconfirmed [NOTE-TEST].',
        ),
      ]),
    });
    expect(result.visuals).toMatchObject([
      { assetId: 'WELL-TEST', producing: false, temperatureDeltaC: 8.5 },
    ]);
    expect(result.visuals[0]?.sources.map((source) => source.id)).toEqual([
      'INS-TEST',
      'MANUAL-TEST',
    ]);
    expect(result.trace.map((event) => event.type)).toEqual(['tool-start', 'tool-result']);
    expect(result.trace[1]).toMatchObject({
      output: { notes: [{ text: 'Operator says it is running; unconfirmed.' }] },
    });
  });
  it('reads a linked narrative report rather than inventing a repair explanation', async () => {
    const fixture = fixtureEvidence();
    const result = await runCoordinator(messages, {
      evidence: createEvidenceService(fixture.reader, asOf),
      model: scriptedModel([
        call('getOperationalContext', { assetId: 'WELL-TEST' }),
        call('readEvidence', { documentId: 'REPORT-LINKED' }, 'call-2'),
        answer(
          'The report attributes seven additional days to a back-ordered part [REPORT-LINKED].',
        ),
      ]),
    });
    expect(result.sources.some((source) => source.id === 'REPORT-LINKED')).toBe(true);
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        type: 'tool-result',
        toolCallId: 'call-2',
        output: expect.objectContaining({
          document: expect.objectContaining({ markdown: expect.stringContaining('back-ordered') }),
        }),
      }),
    );
  });
  it('withholds status when a correction targets the latest reading', async () => {
    const fixture = fixtureEvidence();
    const note = fixture.context.notes[0];
    if (!note) throw new Error('Missing synthetic fixture note.');
    fixture.context.notes.push({
      ...note,
      id: 'CORRECTION-TEST',
      type: 'correction',
      inspectionId: 'INS-TEST',
      text: 'Replace thermal reading; interpretation not implemented.',
      source: { ...note.source, id: 'CORRECTION-TEST' },
    });
    const result = await runCoordinator(messages, {
      evidence: createEvidenceService(fixture.reader, asOf),
      model: scriptedModel([
        call('getOperationalContext', { assetId: 'WELL-TEST' }),
        answer('Status unknown pending correction interpretation [CORRECTION-TEST].'),
      ]),
    });
    expect(result.visuals).toEqual([]);
    expect(result.trace[1]).toMatchObject({
      output: { production: null, observation: { wellheadC: '51.6' } },
    });
  });
  it('keeps missing assets explicit and emits no status artifact', async () => {
    const fixture = fixtureEvidence();
    const result = await runCoordinator([{ role: 'user', content: 'Find WELL-ABSENT' }], {
      evidence: createEvidenceService(fixture.reader, asOf),
      model: scriptedModel([
        call('getOperationalContext', { assetId: 'WELL-ABSENT' }),
        answer('No matching well was found in this dataset.'),
      ]),
    });
    expect(result.visuals).toEqual([]);
    expect(result.trace[1]).toMatchObject({ output: { status: 'not-found' } });
  });
  it('rejects invented citation identifiers', async () => {
    const fixture = fixtureEvidence();
    await expect(
      runCoordinator(messages, {
        evidence: createEvidenceService(fixture.reader, asOf),
        model: scriptedModel([
          call('getOperationalContext', { assetId: 'WELL-TEST' }),
          answer('A claim [INVENTED].'),
        ]),
      }),
    ).rejects.toThrow('not retrieved');
  });
  it('retains tool failure evidence and does not publish a final answer', async () => {
    const fixture = fixtureEvidence();
    fixture.reader.context = async () => {
      throw new Error('secret-database-error');
    };
    const events: unknown[] = [];
    await expect(
      runCoordinator(messages, {
        evidence: createEvidenceService(fixture.reader, asOf),
        onEvent: (event) => events.push(event),
        model: scriptedModel([
          call('getOperationalContext', { assetId: 'WELL-TEST' }),
          answer('Everything is fine.'),
        ]),
      }),
    ).rejects.toThrow();
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool-error' }));
    expect(JSON.stringify(events)).not.toContain('secret-database-error');
  });
  it('does not execute evidence work after cancellation', async () => {
    const fixture = fixtureEvidence();
    const controller = new AbortController();
    controller.abort();
    const model = scriptedModel([call('getOperationalContext', { assetId: 'WELL-TEST' })]);
    await expect(
      runCoordinator(messages, {
        evidence: createEvidenceService(fixture.reader, asOf),
        model,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});
