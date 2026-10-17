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
export function fixtureEvidence(profile?: 'alternate'): {
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
  if (profile === 'alternate') {
    context.asset = {
      ...context.asset,
      id: 'WELL-ALTERNATE',
      wellType: 'ALTERNATE',
      source: fixtureSource('WELL-ALTERNATE'),
    };
    if (context.observation)
      context.observation = {
        ...context.observation,
        id: 'INS-OTHER',
        ambientC: '22.1',
        wellheadC: '42.6',
        source: fixtureSource('INS-OTHER'),
      };
    manual.id = 'MANUAL-OTHER';
    manual.source = fixtureSource(manual.id);
    manual.markdown =
      '# Alternate type manual\n\n## Production temperature rule\nAt least **20.5 °C above ambient**.\n';
    const note = context.notes[0];
    context.notes = note
      ? [
          {
            ...note,
            id: 'NOTE-OTHER',
            text: 'Operator says it is shut in; unconfirmed.',
            source: fixtureSource('NOTE-OTHER'),
          },
        ]
      : [];
    report.assetId = context.asset.id;
  }
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
      const stopwords = new Set([
        'a',
        'an',
        'the',
        'and',
        'or',
        'for',
        'of',
        'in',
        'to',
        'was',
        'is',
      ]);
      const terms = (input.query.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
        (term) => !stopwords.has(term),
      );
      // A small lexical fixture, not an always-successful retrieval oracle.
      const hits = [manual, report]
        .filter((document) => {
          if (input.assetId && document.assetId !== input.assetId) return false;
          if (input.kind && document.kind !== input.kind) return false;
          const text =
            `${document.id} ${document.assetId ?? ''} ${document.markdown}`.toLowerCase();
          return terms.length > 0 && terms.every((term) => text.includes(term));
        })
        .slice(0, input.limit);
      return {
        hits: structuredClone(hits),
        coverage: 'ranked-discovery',
        limit: input.limit,
      };
    },
  };
  return { reader, context, manual, report };
}
