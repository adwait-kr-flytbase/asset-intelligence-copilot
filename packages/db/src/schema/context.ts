import { sql } from 'drizzle-orm';
import { check, date, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { assets } from './assets.js';
import { base, baseKeys, fk } from './common.js';
import { users } from './fleet.js';
import { inspections } from './inspections.js';
export const context = pgTable(
  'context',
  {
    ...base(),
    assetId: text('asset_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    authorId: text('author_id').notNull(),
    type: text().notNull(),
    inspectionId: text('inspection_id'),
    text: text().notNull(),
    validFrom: date('valid_from', { mode: 'string' }).notNull(),
    validTo: date('valid_to', { mode: 'string' }),
  },
  (t) => [
    ...baseKeys(t),
    fk([t.namespace, t.assetId], [assets.namespace, assets.id], 'context_asset_fk'),
    fk([t.namespace, t.authorId], [users.namespace, users.id], 'context_author_fk'),
    fk(
      [t.namespace, t.assetId, t.inspectionId],
      [inspections.namespace, inspections.assetId, inspections.id],
      'context_inspection_same_asset_fk',
    ),
    index('context_asset_created').on(t.namespace, t.assetId, t.createdAt),
    check(
      'context_type',
      sql`${t.type} IN ('operator_note','operator_feedback','correction','data_correction')`,
    ),
    check(
      'correction_has_target',
      sql`(${t.type} IN ('correction','data_correction')) = (${t.inspectionId} IS NOT NULL)`,
    ),
    check('context_validity_order', sql`${t.validTo} IS NULL OR ${t.validTo} >= ${t.validFrom}`),
  ],
);
