import { panelSchema } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { explanationText, unsupportedProductionRequest } from '../agents/capabilities.js';
import { evaluateFinalAnswer } from '../agents/final-evaluator.js';
import { createOpenRouterModel } from '../agents/openrouter.js';
import { composePanels } from '../application/compose-panels.js';
import { conversationHistory } from '../application/conversation-context.js';

const user = (content: string) => ({ role: 'user', content });
describe('conversation and final evaluator failure cases', () => {
  it('preserves unsupported quantities through terse follow-ups without blocking a new supported request', () => {
    expect(
      unsupportedProductionRequest([user('Which well will produce the most oil next year?')]),
    ).toBe('production-forecast');
    const history = [
      user('Which well produced the most oil?'),
      { role: 'assistant', content: 'WELL-0033: 49 days of downtime.' },
    ];
    expect(unsupportedProductionRequest([...history, user('Just one well please')])).toBe(
      'oil-volume',
    );
    expect(
      unsupportedProductionRequest([...history, user('What is WELL-0002 producing status?')]),
    ).toBeUndefined();
    expect(
      unsupportedProductionRequest([user('Which wells have the most oil spills?')]),
    ).toBeUndefined();
  });
  it('explains quantities rather than repeating unrelated output', () => {
    expect(explanationText('temperature-history')).toContain('wellhead temperature minus');
    expect(explanationText('downtime')).toContain(
      'each inspection classified as not producing contributes 7 days',
    );
    expect(
      explanationText('oil-volume', [
        user('How much downtime?'),
        { role: 'assistant', content: '49 days of downtime.' },
        user('Is that the amount of oil it produced?'),
      ]),
    ).toMatch(/^No\./);
    expect(explanationText('oil-volume')).not.toContain('earlier response');
  });
  it('keeps the originating user question behind a long assistant reply and carries bounded result context', () => {
    const history = conversationHistory([
      user('Same for WELL-0002'),
      {
        role: 'assistant',
        content: 'x'.repeat(30000),
        resultContext: {
          resolvedScope: { assetIds: ['WELL-0001'] },
          panels: [
            {
              kind: 'series',
              parameters: { window: { from: '2026-10-01', through: '2026-10-17' } },
            },
          ],
        },
      },
      user('Chart WELL-0001 from October 1 through 17'),
    ]);
    expect(history[0]?.content).toContain('Chart WELL-0001');
    expect(history.at(-1)?.content).toBe('Same for WELL-0002');
    expect(history[1]?.content).toContain('2026-10-01');
    expect(history.map((m) => m.content).join('').length).toBeLessThan(24000);
  });
  it.each(['accept', 'revise'] as const)(
    'consumes a native evaluator tool verdict: %s',
    async (verdict) => {
      const reasons =
        verdict === 'accept'
          ? []
          : ['Location request requires recorded coordinates and a geo binding, not status.'];
      const model = createOpenRouterModel({
        apiKey: 'synthetic-eval',
        modelId: 'synthetic-eval',
        fetch: async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: 'tool_calls',
                  message: {
                    content: null,
                    tool_calls: [
                      {
                        id: 'review-1',
                        type: 'function',
                        function: {
                          name: 'submitVerdict',
                          arguments: JSON.stringify({ verdict, reasons }),
                        },
                      },
                    ],
                  },
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 10 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      });
      const review = await evaluateFinalAnswer({
        model,
        messages: [user('Where is WELL-0002?')],
        candidate: { text: 'Producing.' },
      });
      expect(review.verdict).toEqual({ verdict, reasons });
    },
  );
});

describe('generative presentation composition', () => {
  const panel = (id: string, lat: string, lon: string) =>
    panelSchema.parse({
      id,
      kind: 'geo',
      state: 'ready',
      title: 'Asset locations',
      parameters: { scope: { kind: 'asset', assetId: id }, limit: 1 },
      columns: [],
      rows: [{ assetId: id, latitude: lat, longitude: lon }],
      evidenceIds: [],
      warnings: [],
      coverage: {
        kind: 'asset-inventory',
        assetsEvaluated: 1,
        totalRows: 1,
        returnedRows: 1,
        truncated: false,
      },
      resultBinding: {
        resultId: id,
        contentHash: (id === 'WELL-A' ? 'a' : 'b').repeat(64),
        sourceManifestHash: 'c'.repeat(64),
        operation: 'locateAssets',
        metric: 'asset-location',
        quantity: 'recorded-asset-location',
        timeZone: 'UTC',
        nullPolicy: 'unknown-not-zero',
        calculationVersion: 'domain-v2',
        consistency: 'single-domain-operation',
      },
      geo: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id,
            geometry: { type: 'Point', coordinates: [Number(lon), Number(lat)] },
            properties: {
              assetId: id,
              eventId: null,
              label: id,
              observedAt: null,
              volumeBbl: null,
              status: 'unknown',
              evidenceIds: [],
            },
          },
        ],
      },
    });
  it('puts compatible well locations on one map with original coordinates and both result references', () => {
    const a = panel('WELL-A', '31.1', '-102.1'),
      b = panel('WELL-B', '31.2', '-102.2');
    const result = composePanels([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0]?.geo?.features.map((f) => f.geometry?.coordinates)).toEqual([
      [-102.1, 31.1],
      [-102.2, 31.2],
    ]);
    expect(result[0]?.parameters.assetIds).toEqual(['WELL-A', 'WELL-B']);
    expect(result[0]?.resultBinding?.inputResultIds).toEqual(['WELL-A', 'WELL-B']);
    expect(a.geo?.features).toHaveLength(1);
  });
  it('keeps explicitly separate maps and incompatible quantities separate', () => {
    const a = panel('WELL-A', '31.1', '-102.1'),
      b = panel('WELL-B', '31.2', '-102.2');
    expect(composePanels([a, b], true)).toHaveLength(2);
    if (b.resultBinding) b.resultBinding.quantity = 'effective-spill-events';
    expect(composePanels([a, b])).toHaveLength(2);
  });
});
