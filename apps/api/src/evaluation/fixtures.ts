import type { Document, EvidenceReader, OperationalContext, Source } from '../evidence/types.js';

export function fixtureSource(id: string): Source {
  return {
    id,
    label: id,
    path: `synthetic/${id}`,
    sourceId: `version-${id}`,
    locator: { line: 1 },
  };
}

/** Independent synthetic evidence, intentionally unlike the sample IDs/readings. */
export function fixtureEvidence(): {
  reader: EvidenceReader;
  context: OperationalContext;
  manual: Document;
  report: Document;
} {
  const manual: Document = {
    id: 'MANUAL-TEST',
    kind: 'manual',
    assetId: null,
    isPrimary: true,
    markdown:
      '# Test manual\n\n## Production temperature rule\nAt least **15 °C above ambient**.\n',
    source: fixtureSource('MANUAL-TEST'),
  };
  const report: Document = {
    id: 'REPORT-LINKED',
    kind: 'maintenance_report',
    assetId: 'WELL-TEST',
    markdown:
      '# Report\n\n## What happened\nThe replacement part was back-ordered; the shutdown lasted an additional seven days.\n',
    source: fixtureSource('REPORT-LINKED'),
  };
  const context: OperationalContext = {
    asset: {
      id: 'WELL-TEST',
      name: 'Synthetic test well',
      wellType: 'TEST',
      recordedStatus: 'active',
      source: fixtureSource('WELL-TEST'),
    },
    observation: {
      id: 'INS-TEST',
      observedAt: '2026-10-15T09:00:00.000Z',
      ambientC: '43.1',
      wellheadC: '51.6',
      inspector: 'Synthetic inspector',
      method: 'manual',
      notes: 'Pump not moving',
      source: fixtureSource('INS-TEST'),
    },
    notes: [
      {
        id: 'NOTE-TEST',
        type: 'operator_note',
        inspectionId: null,
        text: 'Operator says it is running; unconfirmed.',
        author: 'Synthetic operator',
        createdAt: '2026-10-16T09:00:00.000Z',
        validFrom: '2026-10-16',
        validTo: null,
        source: fixtureSource('NOTE-TEST'),
      },
    ],
    maintenance: [
      {
        id: 'JOB-TEST',
        startedAt: '2026-10-01T09:00:00.000Z',
        completedAt: '2026-10-20T09:00:00.000Z',
        issue: 'Flowline damage',
        action: 'Replacement planned',
        reportId: report.id,
        inspectionId: 'INS-EARLIER',
        source: fixtureSource('JOB-TEST'),
      },
    ],
    maintenanceTruncated: false,
  };
  const reader: EvidenceReader = {
    async context(id) {
      return id === context.asset.id ? structuredClone(context) : null;
    },
    async procedures(id) {
      return id === context.asset.id ? [structuredClone(manual)] : [];
    },
    async readDocument(id) {
      return structuredClone([manual, report].find((document) => document.id === id) ?? null);
    },
    async search(input) {
      return {
        hits: input.assetId && input.assetId !== context.asset.id ? [] : [structuredClone(report)],
        coverage: 'ranked-discovery',
        limit: input.limit,
      };
    },
  };
  return { reader, context, manual, report };
}
