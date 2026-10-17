import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { assets } from './assets.js';
import { base, baseKeys, fk } from './common.js';
import { users } from './fleet.js';
export const inspections = pgTable(
  'inspections',
  {
    ...base(),
    assetId: text('asset_id').notNull(),
    inspectedAt: timestamp('inspected_at', { withTimezone: true, mode: 'string' }).notNull(),
    inspectorId: text('inspector_id').notNull(),
    method: text().notNull(),
    ambientTempC: numeric('ambient_temp_c').notNull(),
    wellheadTempC: numeric('wellhead_temp_c').notNull(),
    spillDetected: boolean('spill_detected').notNull(),
    spillAreaPct: numeric('spill_area_pct'),
    spillVolumeBbl: numeric('spill_volume_bbl'),
    evidenceImages: text('evidence_images').array().notNull(),
    notes: text().notNull(),
  },
  (t) => [
    ...baseKeys(t),
    check('inspection_method', sql`${t.method} IN ('drone','manual')`),
    unique('inspection_asset_identity').on(t.namespace, t.assetId, t.id),
    fk([t.namespace, t.assetId], [assets.namespace, assets.id], 'inspection_asset_fk'),
    fk([t.namespace, t.inspectorId], [users.namespace, users.id], 'inspection_user_fk'),
    check(
      'spill_fields_correspond',
      sql`(${t.spillDetected} AND ${t.spillAreaPct} IS NOT NULL AND ${t.spillVolumeBbl} IS NOT NULL) OR (NOT ${t.spillDetected} AND ${t.spillAreaPct} IS NULL AND ${t.spillVolumeBbl} IS NULL)`,
    ),
    check(
      'spill_ranges',
      sql`(${t.spillAreaPct} IS NULL OR ${t.spillAreaPct} BETWEEN 0 AND 100) AND (${t.spillVolumeBbl} IS NULL OR ${t.spillVolumeBbl} >= 0)`,
    ),
    index('inspection_asset_date').on(t.namespace, t.assetId, t.inspectedAt),
  ],
);
export const recordedInspectionPointers = pgTable(
  'recorded_inspection_pointers',
  {
    namespace: text().notNull(),
    assetId: text('asset_id').notNull(),
    inspectionId: text('inspection_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.namespace, t.assetId] }),
    fk(
      [t.namespace, t.assetId, t.inspectionId],
      [inspections.namespace, inspections.assetId, inspections.id],
      'recorded_inspection_same_asset_fk',
    ),
  ],
);
