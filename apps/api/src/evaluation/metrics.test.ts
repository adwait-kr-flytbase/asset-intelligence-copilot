import { describe, expect, it } from 'vitest';
import type { ExecutionEvent, ModelObservation } from '../agents/coordinator.js';
import { controlledCases } from './cases.js';
import { fixtureSource } from './fixtures.js';
import { scoreTrial } from './metrics.js';

const test = controlledCases.find((item) => item.id === 'status-and-conflict');
if (!test) throw new Error('Missing eval case.');
function trial() {
  const observation: ModelObservation = {
    text: 'Not producing [INS-TEST] [MANUAL-TEST] [NOTE-TEST].',
    finishReason: 'stop',
    usage: { inputTokens: 100, outputTokens: 20 },
    toolCalls: [
      {
        toolCallId: 't1',
        toolName: 'getOperationalContext',
        input: { assetId: 'WELL-TEST' },
        invalid: false,
      },
    ],
    sources: ['INS-TEST', 'MANUAL-TEST', 'NOTE-TEST'].map(fixtureSource),
  };
  const trace: ExecutionEvent[] = [
    {
      type: 'tool-start',
      toolCallId: 't1',
      toolName: 'getOperationalContext',
      input: { assetId: 'WELL-TEST' },
    },
    { type: 'tool-result', toolCallId: 't1', output: {} },
  ];
  return { observation, trace, latencyMs: 1200, accepted: true };
}

describe('evaluation metric grading only', () => {
  it('scores actual tool/evidence coverage without claiming answer correctness', () => {
    const score = scoreTrial(test, trial());
    expect(score.executionEvidencePassed).toBe(true);
    expect(score.requiredSourceRecall).toBe(1);
    expect(score.responseReview.status).toBe('pending');
    expect(score.latencyMs).toBe(1200);
  });
  it('fails wrong asset arguments, invalid calls and fabricated citations', () => {
    const input = trial();
    input.observation.toolCalls[0] = {
      toolCallId: 't1',
      toolName: 'getOperationalContext',
      input: { assetId: 'WELL-OTHER' },
      invalid: true,
    };
    input.observation.text += ' [FABRICATED]';
    const score = scoreTrial(test, input);
    expect(score.executionEvidencePassed).toBe(false);
    expect(score.wrongAssetArguments).toBe(1);
    expect(score.invalidToolCalls).toBe(1);
    expect(score.invalidCitations).toEqual(['FABRICATED']);
  });
  it('does not treat an attempted failed tool as achieving its goal', () => {
    const input = trial();
    input.trace[1] = { type: 'tool-error', toolCallId: 't1', error: 'Failed' };
    const score = scoreTrial(test, input);
    expect(score.toolGoalCoverage).toBe(0);
    expect(score.toolFailureRate).toBe(1);
    expect(score.executionEvidencePassed).toBe(false);
  });
  it('leaves empty denominators and unavailable cost unknown', () => {
    const empty = scoreTrial(
      { ...test, toolGoals: [], sourceGroups: [] },
      { observation: null, trace: [], latencyMs: 10, accepted: false },
    );
    expect(empty.citationValidity).toBeNull();
    expect(empty.toolFailureRate).toBeNull();
    expect(empty.requiredSourceRecall).toBeNull();
    expect(empty.costUsd).toBeNull();
  });
});
