import { sql } from 'drizzle-orm';
import { check, index, numeric, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { assets } from './assets.js';
import { base, baseKeys, fk } from './common.js';
import { users } from './fleet.js';
import { inspections } from './inspections.js';
export const maintenance = pgTable(
  'maintenance',
  {
    ...base(),
    assetId: text('asset_id').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }).notNull(),
    type: text().notNull(),
    equipmentKind: text('equipment_kind').notNull(),
    issue: text().notNull(),
    actionTaken: text('action_taken').notNull(),
    technicianId: text('technician_id').notNull(),
    contractor: text(),
    downtimeHours: numeric('downtime_hours').notNull(),
    laborUsd: numeric('labor_usd').notNull(),
    partsUsd: numeric('parts_usd').notNull(),
    totalUsd: numeric('total_usd').notNull(),
    triggerInspectionId: text('trigger_inspection_id'),
    reportFile: text('report_file'),
  },
  (t) => [
    ...baseKeys(t),
    unique('maintenance_asset_identity').on(t.namespace, t.assetId, t.id),
    fk([t.namespace, t.assetId], [assets.namespace, assets.id], 'job_asset_fk'),
    fk([t.namespace, t.technicianId], [users.namespace, users.id], 'job_technician_fk'),
    fk(
      [t.namespace, t.assetId, t.triggerInspectionId],
      [inspections.namespace, inspections.assetId, inspections.id],
      'job_inspection_same_asset_fk',
    ),
    check('job_type', sql`${t.type} IN ('scheduled','corrective')`),
    check(
      'job_nonnegative',
      sql`${t.downtimeHours} >= 0 AND ${t.laborUsd} >= 0 AND ${t.partsUsd} >= 0 AND ${t.totalUsd} >= 0`,
    ),
    check('job_cost_sum', sql`${t.laborUsd} + ${t.partsUsd} = ${t.totalUsd}`),
    check('job_order', sql`${t.completedAt} >= ${t.startedAt}`),
    index('job_asset_started').on(t.namespace, t.assetId, t.startedAt),
  ],
);
