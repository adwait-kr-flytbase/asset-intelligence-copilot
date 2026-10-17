import { appEvidenceSchema, panelSchema } from '@repo/contracts';
import type { DatabaseConnection } from '@repo/db';
import { describe, expect, it } from 'vitest';
import { modelProjection } from '../agents/agent.js';
import { renderFacts, resultFacts } from '../agents/facts.js';
import { collectSources } from '../agents/result-integrity.js';
import { describeDataResult } from '../agents/results.js';
import { makeAnalysisPanel } from '../application/panels.js';
import { type AnalyticsReader, createAnalyticsService } from '../evidence/analytics.js';
import { assessSupportedDeadline } from '../evidence/deadlines.js';
import { traceAssetRelationships } from '../evidence/relationships.js';
import { parseAnalysis } from '../evidence/result-schema.js';
import { withHybridRetrieval } from '../evidence/retrieval.js';
import { createEvidenceService } from '../evidence/service.js';
import { scoreArtifacts } from './artifacts.js';
import { fixtureEvidence, fixtureSource } from './fixtures.js';

const asOf = '2026-10-17T00:00:00.000Z';
const asset = {
  id: 'WELL-UNSEEN',
  name: 'Unseen well',
  wellType: 'T',
  areaId: 'XX-09',
  area: 'Unseen area',
  lat: '31',
  lon: '-102',
  source: fixtureSource('WELL-UNSEEN'),
  manual: '## Production temperature rule\nAt least 15 °C above ambient.',
  manualSource: fixtureSource('MANUAL-UNSEEN'),
};
const inspections = ['0.1', '0.2', null].map((volumeBbl, index) => ({
  id: `INS-UNSEEN-${index}`,
  assetId: asset.id,
  at: `2026-10-0${index + 1}T12:00:00.000Z`,
  ambientC: '22.1',
  wellheadC: '42.6',
  spill: true,
  volumeBbl,
  notes: '',
  source: fixtureSource(`INS-UNSEEN-${index}`),
}));
function reader(): AnalyticsReader {
  return {
    assets: async () => [asset],
    inspections: async () => structuredClone(inspections),
    jobs: async () => [],
    corrections: async () => [
      {
        id: 'CORR-UNSEEN',
        inspectionId: 'INS-UNSEEN-1',
        text: 'Rainwater, not a spill.',
        source: fixtureSource('CORR-UNSEEN'),
      },
    ],
    records: async () => ({ records: [], sources: [] }),
  };
}
async function projection(metric: 'spills' | 'temperature-history' = 'spills', limit = 1) {
  const input = {
    metric,
    assetId: asset.id,
    window: { from: '2026-10-01', through: '2026-10-17' },
    limit,
  };
  const output = await createAnalyticsService(reader(), asOf).analyze(input);
  const refs = collectSources(output);
  const evidence = refs.map((source, index) =>
    appEvidenceSchema.parse({
      id: `E-${index}`,
      recordId: source.id,
      sourceVersionId: source.sourceId,
      label: source.label,
      path: source.path,
      locator: source.locator,
      excerpt: 'Synthetic evaluation evidence only.',
      excerptTruncated: false,
    }),
  );
  const result = describeDataResult({
    operation: 'analyzeAssetOperations',
    output,
    parameters: {
      metric,
      assetId: asset.id,
      from: input.window.from,
      through: input.window.through,
      limit,
    },
    runId: 'eval',
    toolCallId: 't1',
    asOf,
    sources: new Map(refs.map((source) => [source.id, source])),
  });
  if (!result) throw new Error('Missing result.');
  const panel = panelSchema.parse(
    makeAnalysisPanel(
      input,
      parseAnalysis(input, output),
      {
        id: 'panel',
        title: 'Evaluation projection',
        result: { id: result.id, integrity: result.integrity },
      },
      evidence,
    ),
  );
  return { output, result, panel, evidence };
}

describe('model outcome accuracy and artifact evaluation', () => {
  it('rejects an invented repair category instead of reporting false zero costs', async () => {
    const input = reader();
    input.jobs = async () => [
      {
        id: 'MNT-UNSEEN',
        assetId: asset.id,
        startedAt: asOf,
        equipmentKind: 'flowline',
        type: 'corrective',
        totalUsd: '123.45',
        reportId: null,
        inspectionId: null,
        issue: '',
        source: fixtureSource('MNT-UNSEEN'),
      },
    ];
    await expect(
      createAnalyticsService(input, asOf).analyze({
        metric: 'repair-costs',
        equipmentKind: 'well',
        window: { from: '2026-10-01', through: '2026-10-17' },
        limit: 50,
      }),
    ).rejects.toThrow('Available categories in this selection: flowline');
  });

  it('bounds model analytics context while retaining facts and the original UI result', () => {
    const output = {
      resultRef: 'result-1',
      metric: 'repair-costs',
      rows: [{ totalUsd: '123.45' }],
      sources: [fixtureSource('MNT-UNSEEN')],
      supportedFacts: [{ id: 'fact-1', text: 'USD 123.45' }],
      factCount: 1,
    };
    const original = structuredClone(output);
    expect(modelProjection(output)).toMatchObject({
      resultRef: 'result-1',
      supportedFacts: output.supportedFacts,
      factCount: 1,
    });
    expect(modelProjection(output)).not.toHaveProperty('rows');
    expect(output).toEqual(original);
  });

  it('retains independent full totals and correction evidence even with a one-row display', async () => {
    const { output, result, panel, evidence } = await projection();
    expect('totals' in output && output.totals).toEqual({
      spillCount: 2,
      totalBbl: '0.1',
      excludedFalsePositives: 1,
      unknownVolumeEvents: 1,
    });
    expect(panel.rows).toHaveLength(1);
    expect(panel.totals?.spillCount).toBe(2);
    expect(panel.corrections?.[0]?.inspectionId).toBe('INS-UNSEEN-1');
    expect(scoreArtifacts([result], [panel], evidence).status).toBe('passed');
    const text = renderFacts(resultFacts(result));
    expect(text).toContain('2 effective spills');
    expect(text).toContain('Rainwater, not a spill.');
    expect(text).not.toContain('no corrections');
  });
  it('catches a schema-valid incorrect aggregate instead of accepting a plausible chart', async () => {
    const { result, panel, evidence } = await projection();
    if (!panel.totals) throw new Error('Missing totals.');
    panel.totals.totalBbl = '999';
    expect(panelSchema.safeParse(panel).success).toBe(true);
    expect(scoreArtifacts([result], [panel], evidence).issues).toContain(
      'panel: full totals mismatch',
    );
  });
  it('catches swapped map coordinates even when both values pass valid coordinate ranges', async () => {
    const { result, panel, evidence } = await projection();
    const feature = panel.geo?.features[0];
    if (!feature) throw new Error('Missing geo feature.');
    // Both are valid in either order; compare to the canonical row, not ranges alone.
    const original = feature.geometry;
    feature.geometry = { type: 'Point', coordinates: [31, 45] };
    expect(panelSchema.safeParse(panel).success).toBe(true);
    expect(scoreArtifacts([result], [panel], evidence).status).toBe('failed');
    feature.geometry = original;
    expect(scoreArtifacts([result], [panel], evidence).status).toBe('passed');
  });
  it('exposes the exact series quantity and catches a silently changed point', async () => {
    const { result, panel, evidence } = await projection('temperature-history', 3);
    expect(panel.seriesSemantics).toMatchObject({
      valueField: 'deltaC',
      timeZone: 'UTC',
      missing: 'gap',
      interpolation: 'none',
    });
    const point = panel.series?.[0]?.points[0];
    if (!point) throw new Error('Missing point.');
    expect(point.value).toBe('20.5');
    point.value = '42.6';
    expect(scoreArtifacts([result], [panel], evidence).status).toBe('failed');
  });
  it('rejects dropped series points and misleading quantity labels', async () => {
    const { result, panel, evidence } = await projection('temperature-history', 3);
    panel.series?.[0]?.points.pop();
    expect(scoreArtifacts([result], [panel], evidence).issues).toContain(
      'panel: series point count mismatch',
    );
    if (!panel.resultBinding) throw new Error('Missing binding.');
    panel.resultBinding.quantity = 'absolute-temperature';
    expect(scoreArtifacts([result], [panel], evidence).issues).toContain(
      'panel: quantity binding mismatch',
    );
  });
  it('preserves absent coordinates as unmapped rather than plotting zero', async () => {
    const { result, panel, evidence } = await projection();
    const row =
      result.kind === 'analysis' ? (result.payload.rows[0] as Record<string, unknown>) : null;
    if (!row || !panel.geo?.features[0] || !panel.mapCoverage) throw new Error('Missing map.');
    row.lat = null;
    panel.geo.features[0].geometry = null;
    panel.mapCoverage.mappedEvents = 0;
    panel.mapCoverage.unmappedEvents = 1;
    panel.mapCoverage.distinctMappedAssets = 0;
    // Ignore table mutation here; verify that an invented default point is caught independently.
    panel.geo.features[0].geometry = { type: 'Point', coordinates: [0, 0] };
    expect(scoreArtifacts([result], [panel], evidence).issues).toContain(
      'panel: map coordinates mismatch',
    );
  });
  it('rejects a well mismatch before producing a result envelope', async () => {
    const { output } = await projection();
    expect(() =>
      parseAnalysis({ metric: 'spills', assetId: 'WELL-WRONG', limit: 1 }, output),
    ).toThrow('asset mismatch');
  });
  it('withholds an unsupported typed deadline instead of accepting caller-invented intervals', async () => {
    const fixtures = fixtureEvidence();
    const assessment = await assessSupportedDeadline(
      { assetId: 'WELL-TEST', protocolId: 'SR-03', eventId: 'MISSING' },
      createEvidenceService(fixtures.reader, asOf),
    );
    expect(assessment.status).toBe('not-assessed');
    expect('dueDate' in assessment).toBe(false);
  });
  it('follows the stored report link and rejects a same-date report belonging to another asset', async () => {
    const fixtures = fixtureEvidence();
    const evidence = createEvidenceService(
      {
        ...fixtures.reader,
        record: async () => ({
          id: 'INS-TEST',
          text: JSON.stringify({ asset_id: 'WELL-TEST' }),
          source: fixtureSource('INS-TEST'),
        }),
      },
      asOf,
    );
    const source = reader();
    source.records = async () => ({
      records: [
        {
          kind: 'maintenance',
          id: 'JOB-TEST',
          inspectionId: 'INS-TEST',
          reportId: 'REPORT-LINKED',
          source: fixtureSource('JOB-TEST'),
        },
      ],
      sources: [],
    });
    const analytics = createAnalyticsService(source, asOf);
    const result = await traceAssetRelationships(
      'WELL-TEST',
      { from: '2026-10-01', through: '2026-10-17' },
      evidence,
      analytics,
    );
    expect(result.edges.map((edge) => edge.relation)).toEqual([
      'triggered-maintenance',
      'documented-by',
    ]);
    const alternate = createEvidenceService(
      {
        ...fixtures.reader,
        readDocument: async () => ({ ...fixtures.report, assetId: 'WELL-OTHER' }),
      },
      asOf,
    );
    const withheld = await traceAssetRelationships(
      'WELL-TEST',
      { from: '2026-10-01', through: '2026-10-17' },
      alternate,
      analytics,
    );
    expect(withheld.edges).toHaveLength(0);
    expect(withheld.warnings.some((warning) => warning.includes('cross-asset'))).toBe(true);
  });
  it('does not make a paid embedding call when no compatible indexed profile exists', async () => {
    let calls = 0;
    const evidence = createEvidenceService(fixtureEvidence().reader, asOf);
    const queryOnly = {
      query: async () => ({ rows: [] }),
    } as unknown as DatabaseConnection['pool'];
    const service = withHybridRetrieval(evidence, queryOnly, 'synthetic', {
      model: 'synthetic/model',
      dimensions: 1536,
      embed: async () => {
        calls++;
        return [];
      },
    });
    const output = await service.search({ query: 'back-ordered', assetId: 'WELL-TEST', limit: 3 });
    expect(calls).toBe(0);
    expect(output.warnings?.[0]).toContain('Lexical discovery only');
  });
});
