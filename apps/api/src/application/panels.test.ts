import type { AppEvidence } from '@repo/contracts';
import type { DatabaseConnection } from '@repo/db';
import { describe, expect, it } from 'vitest';
import { createApplicationData } from './data.js';
import { createEvidenceHydrator } from './evidence.js';
import { makeAnalysisPanel, parseAnalysis } from './panels.js';
import type { ExecutionContext } from './ports.js';

const context: ExecutionContext = {
  namespace: 'test',
  ownerId: 'user',
  asOf: '2026-10-17T00:00:00Z',
  signal: new AbortController().signal,
};
const source = {
  id: 'inspection-1',
  label: 'Inspection',
  path: 'inspections.jsonl',
  sourceId: 'source-1',
  locator: { line: 1 },
};
const evidence: AppEvidence = {
  id: 'opaque-evidence',
  recordId: source.id,
  sourceVersionId: source.sourceId,
  label: source.label,
  path: source.path,
  locator: source.locator,
  excerpt: '{}',
  excerptTruncated: false,
};
const coverage = {
  kind: 'complete-filtered-input',
  totalRows: 2,
  returnedRows: 2,
  truncated: false,
};

describe('application presentation boundaries', () => {
  it('keeps event identity, exact volume, unknown production and valid longitude/latitude bounds', () => {
    const input = {
      metric: 'spills' as const,
      limit: 10,
      window: { from: '2026-01-01', through: '2026-10-17' },
    };
    const output = parseAnalysis(input, {
      metric: 'spills',
      sources: [source],
      warnings: [],
      coverage,
      rows: [
        {
          assetId: 'WELL-1',
          inspectionId: 'inspection-1',
          observedAt: '2026-10-01T00:00:00Z',
          volumeBbl: '12.3400',
          lon: '77.5',
          lat: '18.2',
          sources: [source],
        },
        {
          assetId: 'WELL-1',
          inspectionId: 'inspection-2',
          observedAt: '2026-10-02T00:00:00Z',
          volumeBbl: null,
          lon: '181',
          lat: '18.2',
          sources: [source],
        },
      ],
    });
    const panel = makeAnalysisPanel(input, output, { id: 'map', title: 'Spills' }, [evidence]);
    expect(panel.geo?.features[0]?.geometry).toEqual({ type: 'Point', coordinates: [77.5, 18.2] });
    expect(panel.geo?.features[0]?.properties).toMatchObject({
      assetId: 'WELL-1',
      eventId: 'inspection-1',
      status: 'unknown',
      volumeBbl: '12.3400',
      evidenceIds: [evidence.id],
    });
    expect(panel.geo?.features[1]?.geometry).toBeNull();
    expect(panel.geo?.features[1]?.id).not.toBe(panel.geo?.features[0]?.id);
    expect(panel.geo?.bbox).toEqual([77.5, 18.2, 77.5, 18.2]);
    expect(panel.rows[0]?.sources).toBeUndefined();
  });

  it('keeps absent matrix groups unknown', () => {
    const input = {
      metric: 'spills' as const,
      groupBy: 'area-month' as const,
      limit: 10,
      window: { from: '2026-01-01', through: '2026-02-28' },
    };
    const output = parseAnalysis(input, {
      metric: 'spills',
      sources: [],
      warnings: [],
      coverage,
      rows: [
        { areaId: 'A', month: '2026-01', count: 2, totalBbl: '1.00', sources: [] },
        { areaId: 'B', month: '2026-02', count: 1, totalBbl: '2.00', sources: [] },
      ],
    });
    const panel = makeAnalysisPanel(input, output, { id: 'matrix', title: 'Spills' }, []);
    expect(
      panel.matrix?.cells.find((cell) => cell.rowId === 'A' && cell.columnId === '2026-02')?.value,
    ).toBeNull();
  });

  it('quotes a late JSON record losslessly and refuses source path substitution', async () => {
    const connection = {
      pool: {
        async query(sql: string) {
          return sql.includes('FROM source_files')
            ? {
                rows: [
                  {
                    id: 'source-1',
                    path: 'metadata.json',
                    content: `[{"padding":"${'x'.repeat(13000)}"},{"asset_id":"WELL-1","exact":9007199254740993.123400}]`,
                  },
                ],
              }
            : {
                rows: [
                  {
                    id: 'WELL-1',
                    source_id: 'source-1',
                    source_path: 'metadata.json',
                    source_line: null,
                    source_pointer: '/1',
                  },
                ],
              };
        },
      },
    } as unknown as DatabaseConnection;
    const hydrate = createEvidenceHydrator(connection);
    const metadata = { ...source, id: 'WELL-1', path: 'metadata.json' };
    const [result] = await hydrate([metadata], context);
    expect(result?.locator).toEqual({ jsonPointer: '/1' });
    expect(result?.excerpt).toBe('{"asset_id":"WELL-1","exact":9007199254740993.123400}');
    expect(result?.excerptTruncated).toBe(false);
    expect(result?.id).toMatch(/^[a-f0-9]{64}$/);
    await expect(hydrate([{ ...metadata, path: '/another/path.json' }], context)).rejects.toThrow(
      'Retained source version',
    );
  });
  it('adds a replayable approved status recipe without requerying', async () => {
    const connection = {
      pool: {
        async query() {
          throw new Error('Unexpected query');
        },
      },
    } as unknown as DatabaseConnection;
    const result = await createApplicationData(connection).adaptStatus(
      {
        status: 'found',
        asset: { id: 'WELL-1', recordedStatus: 'active', source },
        observation: { observedAt: '2026-10-01T00:00:00Z' },
        production: { producing: true, deltaC: '12.3400', thresholdC: '10.00' },
        sources: [],
        warnings: [],
      },
      { id: 'status', title: 'Current' },
      context,
    );
    expect(result.panels[0]?.recipe).toEqual({
      operation: 'current-status',
      presentation: 'status',
      parameters: { scope: { kind: 'asset', assetId: 'WELL-1' }, limit: 1 },
    });
    expect(result.panels[0]?.status?.deltaC).toBe('12.3400');
  });
});
