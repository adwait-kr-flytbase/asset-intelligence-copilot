import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';
import { assets } from './assets.js';
import { fk, identity, sourceFiles } from './common.js';
import { wellTypes } from './fleet.js';
import { maintenance } from './maintenance.js';
export const documents = pgTable(
  'documents',
  {
    ...identity(),
    sourceId: text('source_id').notNull(),
    sourcePath: text('source_path').notNull(),
    kind: text().notNull(),
    assetId: text('asset_id'),
    markdown: text().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.namespace, t.id] }),
    unique('document_asset_identity').on(t.namespace, t.assetId, t.id),
    check(
      'document_kind_scope',
      sql`(${t.kind} IN ('manual','sop') AND ${t.assetId} IS NULL) OR (${t.kind} = 'maintenance_report' AND ${t.assetId} IS NOT NULL)`,
    ),
    index('document_asset_kind').on(t.namespace, t.assetId, t.kind),
    fk(
      [t.namespace, t.sourceId, t.sourcePath],
      [sourceFiles.namespace, sourceFiles.id, sourceFiles.path],
      'document_source_fk',
    ),
    fk([t.namespace, t.assetId], [assets.namespace, assets.id], 'document_asset_fk'),
  ],
);
export const maintenanceReports = pgTable(
  'maintenance_reports',
  {
    namespace: text().notNull(),
    assetId: text('asset_id').notNull(),
    maintenanceId: text('maintenance_id').notNull(),
    documentId: text('document_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.namespace, t.maintenanceId] }),
    fk(
      [t.namespace, t.assetId, t.maintenanceId],
      [maintenance.namespace, maintenance.assetId, maintenance.id],
      'report_job_same_asset_fk',
    ),
    fk(
      [t.namespace, t.assetId, t.documentId],
      [documents.namespace, documents.assetId, documents.id],
      'report_document_same_asset_fk',
    ),
  ],
);
export const wellTypeManuals = pgTable(
  'well_type_manuals',
  {
    namespace: text().notNull(),
    wellType: text('well_type').notNull(),
    documentId: text('document_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.namespace, t.wellType] }),
    fk([t.namespace, t.wellType], [wellTypes.namespace, wellTypes.id], 'manual_type_fk'),
    fk([t.namespace, t.documentId], [documents.namespace, documents.id], 'manual_document_fk'),
  ],
);
