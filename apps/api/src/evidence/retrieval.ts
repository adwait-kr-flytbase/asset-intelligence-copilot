import type { DatabaseConnection } from '@repo/db';
import type { QueryEmbedder } from './query-embedding.js';
import type { EvidenceService } from './service.js';
import type { Document } from './types.js';

/** Exact IDs/linked reports remain separate reads. Search is bounded discovery, never exhaustive analytics. */
export function withHybridRetrieval(
  evidence: EvidenceService,
  pool: DatabaseConnection['pool'],
  namespace: string,
  embedder?: QueryEmbedder,
): EvidenceService {
  if (!embedder) return evidence;
  return {
    ...evidence,
    async search(input, signal) {
      const lexical = await evidence.search(input, signal);
      const warnings: string[] = [];
      try {
        // Validate profile/generation availability BEFORE any paid embedding request.
        const profiles = await pool.query<{ id: string }>(
          `SELECT DISTINCT p.id FROM embedding_profiles p JOIN document_embeddings g ON g.profile_id=p.id
         JOIN documents d ON d.namespace=g.namespace AND d.id=g.document_id AND d.source_id=g.source_id
         WHERE g.namespace=$1 AND p.model=$2 AND p.dimensions=$3
         AND ($4::text IS NULL OR d.asset_id=$4) AND ($5::text IS NULL OR d.kind=$5) ORDER BY p.id`,
          [
            namespace,
            embedder.model,
            embedder.dimensions,
            input.assetId ?? null,
            input.kind ?? null,
          ],
        );
        if (profiles.rows.length !== 1)
          return {
            ...lexical,
            warnings: [
              'Semantic discovery unavailable: one compatible current indexing profile is required. Lexical discovery only.',
            ],
          };
        signal?.throwIfAborted();
        const coverage = await pool.query<{ total: string; indexed: string }>(
          `SELECT count(*)::text total, count(g.document_id)::text indexed FROM documents d
         LEFT JOIN document_embeddings g ON g.namespace=d.namespace AND g.document_id=d.id AND g.source_id=d.source_id AND g.profile_id=$2
         WHERE d.namespace=$1 AND ($3::text IS NULL OR d.asset_id=$3) AND ($4::text IS NULL OR d.kind=$4)`,
          [namespace, profiles.rows[0]?.id, input.assetId ?? null, input.kind ?? null],
        );
        const counts = coverage.rows[0];
        if (counts && counts.indexed !== counts.total)
          warnings.push(
            `Semantic index covers ${counts.indexed} of ${counts.total} current documents in this scope; lexical discovery also searches unindexed originals.`,
          );
        const vector = await embedder.embed(input.query, signal);
        const result = await pool.query<{
          id: string;
          kind: Document['kind'];
          asset_id: string | null;
          markdown: string;
          source_id: string;
          source_path: string;
        }>(
          `SELECT d.id,d.kind,d.asset_id,d.markdown,d.source_id,d.source_path,min(c.embedding <=> $2::vector) distance
         FROM document_embedding_chunks c JOIN documents d ON d.namespace=c.namespace AND d.id=c.document_id AND d.source_id=c.source_id
         WHERE c.namespace=$1 AND c.profile_id=$3 AND ($4::text IS NULL OR d.asset_id=$4) AND ($5::text IS NULL OR d.kind=$5)
         GROUP BY d.id,d.kind,d.asset_id,d.markdown,d.source_id,d.source_path ORDER BY distance,d.id LIMIT $6`,
          [
            namespace,
            `[${vector.join(',')}]`,
            profiles.rows[0]?.id,
            input.assetId ?? null,
            input.kind ?? null,
            Math.min(16, input.limit * 2),
          ],
        );
        signal?.throwIfAborted();
        const semantic: Document[] = result.rows.map((row) => ({
          id: row.id,
          kind: row.kind,
          assetId: row.asset_id,
          markdown: row.markdown,
          source: {
            id: row.id,
            label: row.id,
            path: row.source_path,
            sourceId: row.source_id,
            locator: { startLine: 1, endLine: row.markdown.split('\n').length },
          },
        }));
        const fused = new Map<string, { doc: Document; score: number }>();
        for (const [listIndex, list] of [lexical.hits, semantic].entries())
          list.forEach((doc, rank) => {
            const key = `${doc.id}:${doc.source.sourceId}`;
            const previous = fused.get(key);
            fused.set(key, {
              doc,
              score: (previous?.score ?? 0) + (listIndex === 0 ? 2 : 1) / (60 + rank + 1),
            });
          });
        return {
          hits: [...fused.values()]
            .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id))
            .slice(0, input.limit)
            .map((item) => item.doc),
          coverage: 'ranked-discovery',
          limit: input.limit,
          warnings: [
            'Hybrid lexical/semantic discovery; a missing hit is not proof of absent evidence.',
          ],
        };
      } catch {
        signal?.throwIfAborted();
        warnings.push(
          'Semantic discovery failed; lexical results retained. Search does not establish exhaustive coverage.',
        );
        return { ...lexical, warnings };
      }
    },
  };
}
