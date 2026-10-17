import { describe, expect, it } from 'vitest';
import { normalizeEvidenceCitations } from '../agents/citations.js';
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
  it('normalizes retrieved IDs with prose annotations without accepting invented references', () => {
    const sources = new Map(['NOTE-TEST', 'INS-TEST'].map((id) => [id, fixtureSource(id)]));
    const normalize = (text: string) => normalizeEvidenceCitations(text, sources, new Map());
    expect(normalize('[NOTE-TEST, Synthetic operator]')).toBe('[NOTE-TEST]');
    expect(normalize('[NOTE-TEST warning in context]')).toBe('[NOTE-TEST]');
    expect(normalize('[NOTE-TEST, FAKE-001]')).toBe('[NOTE-TEST, FAKE-001]');
    expect(normalize('[FABRICATED]')).toBe('[FABRICATED]');
  });
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
  it('checks arguments and returned facts on the same call, allowing unordered evidence', () => {
    const input = trial();
    const expectedRow = { id: 'B', days: 7 };
    const checked = {
      ...test,
      toolChecks: [
        {
          id: 'facts',
          toolName: 'getOperationalContext',
          input: { assetId: 'WELL-TEST' },
          output: {
            rows: [expectedRow, { id: 'A', days: 14 }],
          },
        },
      ],
    };
    input.trace[1] = {
      type: 'tool-result',
      toolCallId: 't1',
      output: {
        rows: [
          { id: 'A', days: 14, note: 'retained' },
          { id: 'B', days: 7 },
        ],
      },
    };
    expect(scoreTrial(checked, input).toolCheckCoverage).toBe(1);
    expectedRow.days = 8;
    expect(scoreTrial(checked, input).executionEvidencePassed).toBe(false);
  });
  it('keeps missing answer facts separate from successful evidence execution', () => {
    const input = trial();
    const checked = {
      ...test,
      responseChecks: [{ id: 'deadline', anyOf: ['2026-07-30', '30 July 2026'] }],
    };
    expect(scoreTrial(checked, input).executionEvidencePassed).toBe(true);
    expect(scoreTrial(checked, input).responseFactCoverage).toBe(0);
    input.observation.text += ' Response due 30 July 2026.';
    expect(scoreTrial(checked, input).responseFactCoverage).toBe(1);
  });
  it('accepts equivalent tool interfaces while rejecting a mismatched requested window', () => {
    const input = trial();
    const checked = {
      ...test,
      toolChecks: [
        {
          id: 'same-query',
          toolName: ['getOperationalContext', 'analyzeAssetOperations'],
          input: [
            { assetId: 'WELL-TEST', from: '2026-01-01' },
            { scope: { assetId: 'WELL-TEST' }, window: { from: '2026-01-01' } },
          ],
        },
      ],
    };
    input.trace[0] = {
      type: 'tool-start',
      toolName: 'getOperationalContext',
      toolCallId: 't1',
      input: { assetId: 'WELL-TEST', from: '2026-01-01' },
    };
    expect(scoreTrial(checked, input).toolCheckCoverage).toBe(1);
    input.trace[0] = { ...input.trace[0], input: { assetId: 'WELL-TEST', from: '2025-01-01' } };
    expect(scoreTrial(checked, input).toolCheckCoverage).toBe(0);
  });
});
