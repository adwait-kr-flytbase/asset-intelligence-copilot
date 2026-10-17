import { describe, expect, it } from 'vitest';
import { runCoordinator } from '../agents/coordinator.js';
import { createOpenRouterModel } from '../agents/openrouter.js';
import { assessmentPanel } from '../application/operational-panel.js';
import { createEvidenceService } from '../evidence/service.js';
import { fixtureEvidence, fixtureSource } from './fixtures.js';

// Model-output evaluation: a semantic rejection must not erase canonical tool data.
describe('final publication failure cases', () => {
  it.each(['accept', 'revise', 'advisory', 'late-plan'] as const)(
    'retains canonical chart values when the narrative verdict is %s',
    async (verdict) => {
      let step = 0,
        resultRef = '',
        reviews = 0;
      const response = (name: string, input: unknown) =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: `call-${step}-${reviews}`,
                      type: 'function',
                      function: { name, arguments: JSON.stringify(input) },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      const model = createOpenRouterModel({
        apiKey: 'synthetic',
        modelId: 'synthetic-eval',
        fetch: async () => {
          step++;
          if (step === 1)
            return response('validateQuestion', {
              scope: verdict === 'late-plan' ? 'area' : 'fleet',
              requestedQuantity: 'regional-temperatures',
              responseMode: 'text',
              parts: [
                {
                  id: 'chart',
                  question: 'Chart the regional comparison',
                  needs: 'operational-assessment',
                },
              ],
            });
          if (step === 2) return response('assessOperations', { topic: 'regional-temperatures' });
          if (step === 3) {
            if (verdict === 'late-plan')
              return response('validateQuestion', {
                scope: 'fleet',
                requestedQuantity: 'regional-temperatures',
                responseMode: 'text',
                parts: [
                  {
                    id: 'chart',
                    question: 'Chart the regional comparison',
                    needs: 'operational-assessment',
                  },
                ],
              });
            return response('presentResult', { resultId: resultRef, component: 'table' });
          }
          return response('publishAnswer', {
            resultIds: [resultRef],
            explanation:
              'An unsupported causal interpretation that must be withheld when rejected.',
          });
        },
      });
      const evaluator = createOpenRouterModel({
        apiKey: 'synthetic',
        modelId: 'synthetic-evaluator',
        fetch: async () => {
          reviews++;
          return response('submitVerdict', {
            verdict:
              verdict === 'advisory' ? 'revise' : verdict === 'late-plan' ? 'accept' : verdict,
            reasons: ['accept', 'late-plan'].includes(verdict) ? [] : ['Evaluation feedback.'],
            ...(verdict === 'advisory' ? { severity: 'improvement' } : {}),
          });
        },
      });
      const result = await runCoordinator(
        [{ role: 'user', content: 'Give me a chart with regional temperatures' }],
        {
          model,
          evaluatorModel: evaluator,
          evidence: createEvidenceService(fixtureEvidence().reader, '2027-01-15T23:59:59.999Z'),
          onEvent: (event) => {
            if (event.type === 'tool-result' && event.dataResult) resultRef = event.dataResult.id;
          },
          operations: async () => ({
            topic: 'regional_temperatures',
            title: 'Regional comparison',
            columns: [
              { key: 'region', label: 'Region', valueType: 'string' },
              {
                key: 'meanWellheadC',
                label: 'Recorded wellhead mean',
                valueType: 'decimal',
                unit: '°C',
              },
            ],
            rows: [
              { region: 'Synthetic region', meanWellheadC: 17.25 },
              { region: 'Another region', meanWellheadC: 16 },
            ],
            facts: [{ text: 'Regional comparison: two matching rows.', sourceIds: ['SYNTHETIC'] }],
            sources: [fixtureSource('SYNTHETIC')],
            warnings: [],
            coverage: {
              kind: 'complete-filtered-input',
              assetsEvaluated: 2,
              totalRows: 2,
              returnedRows: 2,
              truncated: false,
            },
          }),
        },
      );
      expect(result.selectedResultIds).toEqual([resultRef]);
      expect(result.presentationBindings[resultRef]).toBe('ranking');
      const canonical = result.dataResults.find((row) => row.id === resultRef);
      if (canonical?.kind !== 'operational-assessment') throw Error('Missing canonical assessment');
      const panel = assessmentPanel(canonical, [], 'synthetic-panel', 'ranking');
      expect(panel.resultBinding?.valueField).toBe('meanWellheadC');
      expect(panel.rows[0]?.meanWellheadC).toBe('17.25');
      if (verdict === 'revise') {
        expect(reviews).toBe(2);
        expect(step).toBeLessThanOrEqual(6);
        expect(result.text).not.toContain('unsupported causal interpretation');
        expect(result.text).toContain('partial answer');
        expect(result.answerSupport.explanationStatus).toBe('unavailable');
        expect(result.questionCoverage?.status).toBe('partial');
      } else {
        expect(result.answerSupport.mode).toBe('grounded-synthesis');
        if (verdict === 'advisory') {
          expect(reviews).toBe(1);
          expect(result.answerSupport.warnings).toEqual([]);
        }
      }
    },
  );
});

import { summarizeInspections } from '../evidence/operations/inspection-summary.js';
import { assessRegionalTemperatures } from '../evidence/operations/maintenance.js';
import type { OperationalDataset, OperationalRecord } from '../evidence/operations/types.js';

describe('requested metric fidelity', () => {
  const record = (id: string, raw: Record<string, unknown>): OperationalRecord => ({
    id,
    raw,
    source: fixtureSource(id),
  });
  const data: OperationalDataset = {
    asOf: '2027-01-15T23:59:59.999Z',
    assets: [
      record('WELL-A', { area_id: 'AREA-A', well_type: 'T', team_id: 'TEAM-A' }),
      record('WELL-B', { area_id: 'AREA-B', well_type: 'T', team_id: 'TEAM-A' }),
    ],
    areas: [
      record('AREA-A', { name: 'Warm Block 1', region: 'Warm' }),
      record('AREA-B', { name: 'Cool Block 1', region: 'Cool' }),
    ],
    teams: [],
    users: [],
    documents: [],
    maintenance: [],
    notes: [],
    inspections: [
      record('IA1', {
        asset_id: 'WELL-A',
        inspected_at: '2027-01-04T12:00:00Z',
        wellhead_temp_c: 50,
        ambient_temp_c: 40,
      }),
      record('IA2', {
        asset_id: 'WELL-A',
        inspected_at: '2027-01-11T12:00:00Z',
        wellhead_temp_c: 54,
        ambient_temp_c: 40,
      }),
      record('IB1', {
        asset_id: 'WELL-B',
        inspected_at: '2027-01-04T12:00:00Z',
        wellhead_temp_c: 40,
        ambient_temp_c: 0,
      }),
      record('IB2', {
        asset_id: 'WELL-B',
        inspected_at: '2027-01-11T12:00:00Z',
        wellhead_temp_c: 44,
        ambient_temp_c: 0,
      }),
    ],
  };
  it('keeps raw temperature primary even when the adjusted metric has the opposite winner', () => {
    const result = assessRegionalTemperatures(data, { from: '2027-01-01' });
    expect(result.rows[0]).toMatchObject({
      area: 'Warm Block 1',
      region: 'Warm',
      meanWellheadC: 52,
      hottestWeeks: 2,
      observedWeeks: 2,
      adjustedDeltaC: 12,
    });
    expect(result.rows[1]).toMatchObject({
      area: 'Cool Block 1',
      region: 'Cool',
      meanWellheadC: 42,
      adjustedDeltaC: 42,
      hottestWeeks: 0,
    });
  });
  it('identifies the hottest block even when its broader region has a lower aggregate mean', () => {
    const nested = structuredClone(data);
    nested.areas.push(record('AREA-C', { name: 'Warm Block 2', region: 'Warm' }));
    nested.assets.push(record('WELL-C', { area_id: 'AREA-C', well_type: 'T', team_id: 'TEAM-A' }));
    nested.inspections.push(
      record('IC1', {
        asset_id: 'WELL-C',
        inspected_at: '2027-01-04T12:00:00Z',
        wellhead_temp_c: 10,
        ambient_temp_c: 0,
      }),
      record('IC2', {
        asset_id: 'WELL-C',
        inspected_at: '2027-01-11T12:00:00Z',
        wellhead_temp_c: 10,
        ambient_temp_c: 0,
      }),
    );
    const blocks = assessRegionalTemperatures(nested, { from: '2027-01-01' });
    const broader = summarizeInspections(nested, {
      measure: 'wellhead-temperature',
      groupBy: 'region',
    });
    expect(blocks.rows[0]).toMatchObject({
      area: 'Warm Block 1',
      region: 'Warm',
      meanWellheadC: 52,
      hottestWeeks: 2,
    });
    expect(broader.rows[0]).toMatchObject({ group: 'Cool', mean: 42 });
    expect(blocks.rows).toHaveLength(3);
  });
  it('changes the measure only when explicitly selected, preserving units and observation counts', () => {
    const raw = summarizeInspections(data, { measure: 'wellhead-temperature', groupBy: 'region' });
    const delta = summarizeInspections(data, {
      measure: 'temperature-difference',
      groupBy: 'region',
    });
    expect(raw.rows[0]).toMatchObject({ group: 'Warm', mean: 52, observations: 2, wells: 1 });
    expect(delta.rows[0]).toMatchObject({ group: 'Cool', mean: 42, observations: 2, wells: 1 });
    expect(raw.columns.find((column) => column.key === 'mean')?.unit).toBe('°C');
    const weekly = summarizeInspections(data, {
      measure: 'wellhead-temperature',
      groupBy: 'region',
      timeGrain: 'week',
    });
    expect(weekly.rows).toHaveLength(4);
    expect(weekly.rows.map((row) => row.period)).toContain('2027-01-04');
  });
});
