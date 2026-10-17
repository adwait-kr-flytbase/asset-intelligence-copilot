import { sql } from 'drizzle-orm';
import { check, date, index, numeric, pgTable, text } from 'drizzle-orm/pg-core';
import { base, baseKeys, fk } from './common.js';
import { inspections } from './inspections.js';
export const regulatoryEvents = pgTable(
  'regulatory_events',
  {
    ...base(),
    assetId: text('asset_id').notNull(),
    date: date({ mode: 'string' }).notNull(),
    agency: text().notNull(),
    type: text().notNull(),
    protocolId: text('protocol_id').notNull(),
    inspectionId: text('inspection_id').notNull(),
    hoursToReport: numeric('hours_to_report'),
    detail: text().notNull(),
    fineUsd: numeric('fine_usd').notNull(),
    status: text().notNull(),
  },
  (t) => [
    ...baseKeys(t),
    fk(
      [t.namespace, t.assetId, t.inspectionId],
      [inspections.namespace, inspections.assetId, inspections.id],
      'regulator_inspection_same_asset_fk',
    ),
    check('regulatory_status', sql`${t.status} IN ('open','closed')`),
    check(
      'regulatory_type',
      sql`${t.type} IN ('spill_report_filed','notice_of_violation','site_inspection','nov_response_filed')`,
    ),
    check(
      'reporting_hours_nonnegative',
      sql`${t.hoursToReport} IS NULL OR ${t.hoursToReport} >= 0`,
    ),
    index('regulatory_asset_date').on(t.namespace, t.assetId, t.date),
    check('fine_nonnegative', sql`${t.fineUsd} >= 0`),
  ],
);
