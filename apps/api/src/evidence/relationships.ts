import type { AnalyticsService, DateWindow } from './analytics.js';
import type { EvidenceService } from './service.js';
import type { Source } from './types.js';

/** Relationships are derived from stored record references, never temporal coincidence. */
export async function traceAssetRelationships(
  assetId: string,
  window: DateWindow,
  evidence: EvidenceService,
  analytics: AnalyticsService,
  signal?: AbortSignal,
) {
  const records = await analytics.records(assetId, window, signal);
  const edges: {
    from: { kind: string; id: string };
    to: { kind: string; id: string };
    relation: 'triggered-maintenance' | 'documented-by' | 'regulatory-follow-up';
    basis: 'stored-reference';
    sources: Source[];
  }[] = [];
  const warnings: string[] = [];
  for (const value of records.records) {
    if (!value || typeof value !== 'object') continue;
    const r = value as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.source) continue;
    if (r.inspectionId && typeof r.inspectionId === 'string') {
      const inspection = await evidence.record('inspection', r.inspectionId, signal);
      if (
        !inspection ||
        (JSON.parse(inspection.text) as { asset_id?: string }).asset_id !== assetId
      ) {
        warnings.push(
          `Unresolved or cross-asset inspection link on ${r.id}; relationship withheld.`,
        );
        continue;
      }
      edges.push({
        from: { kind: 'inspection', id: r.inspectionId },
        to: { kind: String(r.kind), id: r.id },
        relation: r.kind === 'maintenance' ? 'triggered-maintenance' : 'regulatory-follow-up',
        basis: 'stored-reference',
        sources: [r.source as Source, inspection.source],
      });
    }
    if (r.kind === 'maintenance' && typeof r.reportId === 'string') {
      const report = await evidence.read(r.reportId, signal);
      if (!report || report.assetId !== assetId) {
        warnings.push(`Unresolved or cross-asset report link on ${r.id}; relationship withheld.`);
        continue;
      }
      edges.push({
        from: { kind: 'maintenance', id: r.id },
        to: { kind: 'report', id: report.id },
        relation: 'documented-by',
        basis: 'stored-reference',
        sources: [r.source as Source, report.source],
      });
    }
  }
  return {
    status: 'traced' as const,
    assetId,
    window,
    asOf: evidence.asOf,
    edges,
    sources: edges.flatMap((edge) => edge.sources),
    warnings: [
      ...warnings,
      'Stored links establish relationships, not independent proof of root cause. Same asset or nearby dates alone do not establish causality.',
    ],
  };
}
