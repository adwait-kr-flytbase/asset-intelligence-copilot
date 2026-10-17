import { createDatabase } from '@repo/db';
import * as s from '@repo/db/schema';
import { and, asc, eq, notExists } from 'drizzle-orm';
import { chunkDocument, embeddingProfile } from './embedding-profile.js';
import { createEmbedder } from './embedding-provider.js';

export async function embedDocuments(options: {
  databaseUrl: string;
  namespace: string;
  apiKey?: string;
  limit?: number;
  documentId?: string;
  dryRun?: boolean;
  embed?: (texts: string[]) => Promise<number[][]>;
  onProgress?: (progress: { documents: number; chunks: number }) => void;
}) {
  const profile = embeddingProfile();
  const connection = createDatabase(options.databaseUrl, { maxConnections: 2 });
  const acquireLock = () => connection.pool.connect();
  let lock: Awaited<ReturnType<typeof acquireLock>> | undefined;
  let locked = false;
  const lockKey = `document-embeddings:${options.namespace}:${profile.id}`;
  try {
    lock = await acquireLock();
    const result = await lock.query(
      'SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',
      [lockKey],
    );
    locked = result.rows[0]?.locked === true;
    if (!locked)
      throw new Error('An embedding indexer is already running for this namespace/profile.');
    const namespace = await connection.db
      .select()
      .from(s.fields)
      .where(eq(s.fields.id, options.namespace));
    if (!namespace.length) throw new Error('Namespace is not loaded; run ingestion first.');
    const conditions = [
      eq(s.documents.namespace, options.namespace),
      notExists(
        connection.db
          .select({ id: s.documentEmbeddings.documentId })
          .from(s.documentEmbeddings)
          .where(
            and(
              eq(s.documentEmbeddings.namespace, s.documents.namespace),
              eq(s.documentEmbeddings.documentId, s.documents.id),
              eq(s.documentEmbeddings.sourceId, s.documents.sourceId),
              eq(s.documentEmbeddings.profileId, profile.id),
            ),
          ),
      ),
    ];
    if (options.documentId) conditions.push(eq(s.documents.id, options.documentId));
    const candidates = await connection.db
      .select()
      .from(s.documents)
      .where(and(...conditions))
      .orderBy(asc(s.documents.id))
      .limit(1_000_000);
    // Filter before limiting so an empty file cannot starve repeated bounded runs.
    const nonempty = candidates.filter((document) => document.markdown.trim().length > 0);
    const pending = options.limit === undefined ? nonempty : nonempty.slice(0, options.limit);
    const receipt = {
      namespace: options.namespace,
      profileId: profile.id,
      model: profile.model,
      dimensions: profile.dimensions,
      dryRun: Boolean(options.dryRun),
      pendingDocuments: pending.length,
      indexedDocuments: 0,
      indexedChunks: 0,
      skippedEmptyDocuments: candidates.length - nonempty.length,
      plannedChunks: 0,
    };
    const embed =
      options.dryRun || !pending.length
        ? undefined
        : (options.embed ?? createEmbedder(options.apiKey ?? '', profile));
    // Bound memory and provider concurrency while keeping each document publication atomic.
    const groupSize = 32;
    const requestConcurrency = 4;
    for (let offset = 0; offset < pending.length; offset += groupSize) {
      const group = pending
        .slice(offset, offset + groupSize)
        .map((document) => ({ document, chunks: chunkDocument(document.markdown) }));
      for (const item of group) {
        if (item.chunks.length > 1000)
          throw new Error('Document exceeds the local indexer limit of 1000 chunks.');
        receipt.plannedChunks += item.chunks.length;
        if (!item.chunks.length) receipt.skippedEmptyDocuments++;
      }
      if (options.dryRun) continue;
      const texts = group.flatMap((item) => item.chunks.map((chunk) => chunk.text));
      const vectors: number[][] = [];
      if (texts.length && !embed) throw new Error('Embedding provider is not configured.');
      for (let n = 0; n < texts.length; n += 16 * requestConcurrency) {
        if (!embed) throw new Error('Embedding provider is not configured.');
        const requests: Promise<number[][]>[] = [];
        for (
          let index = n;
          index < Math.min(n + 16 * requestConcurrency, texts.length);
          index += 16
        )
          requests.push(embed(texts.slice(index, index + 16)));
        // Keep vector ordering identical to chunk ordering even when requests finish out of order.
        const completed = await Promise.allSettled(requests);
        for (const response of completed) {
          if (response.status === 'rejected') throw response.reason;
          vectors.push(...response.value);
        }
      }
      let vectorOffset = 0;
      for (const { document, chunks } of group) {
        if (!chunks.length) continue;
        const chunkVectors = vectors.slice(vectorOffset, vectorOffset + chunks.length);
        vectorOffset += chunks.length;
        await connection.db.transaction(async (tx) => {
          const current = await tx
            .select()
            .from(s.documents)
            .where(
              and(eq(s.documents.namespace, document.namespace), eq(s.documents.id, document.id)),
            )
            .for('share');
          if (
            current[0]?.sourceId !== document.sourceId ||
            current[0]?.markdown !== document.markdown
          )
            throw new Error('Document changed during embedding; rerun indexing.');
          await tx.insert(s.embeddingProfiles).values(profile).onConflictDoNothing();
          const key = {
            namespace: document.namespace,
            documentId: document.id,
            sourceId: document.sourceId,
            profileId: profile.id,
          };
          await tx.insert(s.documentEmbeddings).values({ ...key, chunkCount: chunks.length });
          for (let n = 0; n < chunks.length; n += 100) {
            await tx.insert(s.documentEmbeddingChunks).values(
              chunks.slice(n, n + 100).map((chunk, i) => {
                const embedding = chunkVectors[n + i];
                if (!embedding) throw new Error('Missing chunk embedding.');
                return { ...key, ...chunk, embedding };
              }),
            );
          }
        });
        receipt.indexedDocuments++;
        receipt.indexedChunks += chunks.length;
      }
      options.onProgress?.({ documents: receipt.indexedDocuments, chunks: receipt.indexedChunks });
    }
    return receipt;
  } finally {
    if (locked && lock)
      await lock
        .query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [lockKey])
        .catch(() => {});
    lock?.release();
    await connection.close();
  }
}
