import type { DatabaseConnection } from '@repo/db';
import type { DateWindow } from './analytics.js';
import { type AnalyticsService, createAnalyticsService } from './analytics.js';
import { createPostgresAnalytics } from './analytics-postgres.js';
import { assessSupportedDeadline, type SupportedDeadlineInput } from './deadlines.js';
import { assessIncidentTimings } from './incident-timings.js';
import { createPostgresEvidence } from './postgres.js';
import type { QueryEmbedder } from './query-embedding.js';
import { traceAssetRelationships } from './relationships.js';
import { withHybridRetrieval } from './retrieval.js';
import { createEvidenceService, type EvidenceService } from './service.js';

/** Materialize each domain operation consistently; connections never span a model call. */
export function createSnapshotServices(
  pool: DatabaseConnection['pool'],
  namespace: string,
  asOf: string,
  embedder?: QueryEmbedder,
) {
  async function read<T>(
    work: (services: { evidence: EvidenceService; analytics: AnalyticsService }) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    signal?.throwIfAborted();
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout='15000ms'");
      const { rows } = await client.query<{ snapshot: string }>(
        'SELECT txid_current_snapshot()::text snapshot',
      );
      const observedAt = new Date().toISOString();
      const value = await work({
        evidence: createEvidenceService(createPostgresEvidence(client, namespace), asOf),
        analytics: createAnalyticsService(createPostgresAnalytics(client, namespace, asOf), asOf),
      });
      signal?.throwIfAborted();
      await client.query('COMMIT');
      if (value && typeof value === 'object' && !Array.isArray(value))
        return {
          ...value,
          readProvenance: {
            isolation: 'repeatable-read',
            snapshot: rows[0]?.snapshot ?? '',
            scope: 'single-domain-operation',
            observedAt,
          },
        };
      return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  const evidence: EvidenceService = {
    asOf,
    overview: (id, signal) => read((s) => s.evidence.overview(id, signal), signal),
    procedures: (id, signal) => read((s) => s.evidence.procedures(id, signal), signal),
    read: (id, signal) => read((s) => s.evidence.read(id, signal), signal),
    record: (kind, id, signal) => read((s) => s.evidence.record(kind, id, signal), signal),
    search: (input, signal) => read((s) => s.evidence.search(input, signal), signal),
  };
  const analytics: AnalyticsService = {
    listAssets: (selection, signal) =>
      read((s) => s.analytics.listAssets(selection, signal), signal),
    analyze: (input, signal) => read((s) => s.analytics.analyze(input, signal), signal),
    records: (id, window, signal) => read((s) => s.analytics.records(id, window, signal), signal),
  };
  return {
    traceRelationships: (assetId: string, window: DateWindow, signal?: AbortSignal) =>
      read(
        (s) => traceAssetRelationships(assetId, window, s.evidence, s.analytics, signal),
        signal,
      ),
    evidence: withHybridRetrieval(evidence, pool, namespace, embedder),
    analytics,
    assessIncidentTimings: (assetId: string, inspectionId: string, signal?: AbortSignal) =>
      read(
        (s) => assessIncidentTimings(assetId, inspectionId, s.evidence, s.analytics, signal),
        signal,
      ),
    assessDeadline: (input: SupportedDeadlineInput, signal?: AbortSignal) =>
      read((s) => assessSupportedDeadline(input, s.evidence, s.analytics, signal), signal),
  };
}
