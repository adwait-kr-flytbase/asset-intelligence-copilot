import { and, desc, eq } from 'drizzle-orm';
import type { DatabaseConnection } from './client.js';
import { assets, documents, inspections, sourceFiles } from './schema/index.js';

/** Namespace-bound evidence access. Namespace selection is not user authentication. */
export function createEvidenceStore(connection: DatabaseConnection, namespace: string) {
  if (!namespace.trim()) throw new Error('An explicit data namespace is required.');
  const { db } = connection;
  return {
    async findAsset(id: string) {
      const [asset] = await db
        .select()
        .from(assets)
        .where(and(eq(assets.namespace, namespace), eq(assets.id, id)))
        .limit(1);
      return asset ?? null;
    },
    async recentInspections(assetId: string, limit = 100) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 500)
        throw new Error('Inspection limit must be 1–500.');
      return db
        .select()
        .from(inspections)
        .where(and(eq(inspections.namespace, namespace), eq(inspections.assetId, assetId)))
        .orderBy(desc(inspections.inspectedAt), desc(inspections.id))
        .limit(limit);
    },
    async findDocument(id: string) {
      const [document] = await db
        .select({ document: documents, source: sourceFiles })
        .from(documents)
        .innerJoin(
          sourceFiles,
          and(
            eq(documents.namespace, sourceFiles.namespace),
            eq(documents.sourceId, sourceFiles.id),
          ),
        )
        .where(and(eq(documents.namespace, namespace), eq(documents.id, id)))
        .limit(1);
      return document ?? null;
    },
    async findSource(sourceId: string) {
      const [source] = await db
        .select()
        .from(sourceFiles)
        .where(and(eq(sourceFiles.namespace, namespace), eq(sourceFiles.id, sourceId)))
        .limit(1);
      return source ?? null;
    },
  };
}
