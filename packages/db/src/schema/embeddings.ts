import { sql } from 'drizzle-orm';
import { check, integer, pgTable, primaryKey, text, timestamp, vector } from 'drizzle-orm/pg-core';
import { fk } from './common.js';
import { documents } from './documents.js';

/** Immutable, content-addressed configuration. New model/chunker means a new profile. */
export const embeddingProfiles = pgTable(
  'embedding_profiles',
  {
    id: text().primaryKey(),
    provider: text().notNull(),
    model: text().notNull(),
    dimensions: integer().notNull(),
    chunker: text().notNull(),
  },
  (t) => [check('embedding_profile_dimensions', sql`${t.dimensions} = 1536`)],
);

/** A row is published together with all its chunks in a single transaction. */
export const documentEmbeddings = pgTable(
  'document_embeddings',
  {
    namespace: text().notNull(),
    documentId: text('document_id').notNull(),
    sourceId: text('source_id').notNull(),
    profileId: text('profile_id')
      .notNull()
      .references(() => embeddingProfiles.id),
    chunkCount: integer('chunk_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.namespace, t.documentId, t.sourceId, t.profileId] }),
    fk(
      [t.namespace, t.documentId, t.sourceId],
      [documents.namespace, documents.id, documents.sourceId],
      'embedding_document_version_fk',
    ),
    check('embedding_chunk_count', sql`${t.chunkCount} > 0`),
  ],
);

export const documentEmbeddingChunks = pgTable(
  'document_embedding_chunks',
  {
    namespace: text().notNull(),
    documentId: text('document_id').notNull(),
    sourceId: text('source_id').notNull(),
    profileId: text('profile_id').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    startOffset: integer('start_offset').notNull(),
    endOffset: integer('end_offset').notNull(),
    text: text().notNull(),
    contentHash: text('content_hash').notNull(),
    embedding: vector({ dimensions: 1536 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.namespace, t.documentId, t.sourceId, t.profileId, t.chunkIndex] }),
    fk(
      [t.namespace, t.documentId, t.sourceId, t.profileId],
      [
        documentEmbeddings.namespace,
        documentEmbeddings.documentId,
        documentEmbeddings.sourceId,
        documentEmbeddings.profileId,
      ],
      'embedding_chunk_generation_fk',
    ).onDelete('cascade'),
    check(
      'embedding_chunk_offsets',
      sql`${t.chunkIndex} >= 0 AND ${t.startOffset} >= 0 AND ${t.endOffset} > ${t.startOffset} AND length(${t.text}) > 0`,
    ),
  ],
);
