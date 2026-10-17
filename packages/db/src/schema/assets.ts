import { sql } from 'drizzle-orm';
import { check, date, index, jsonb, numeric, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { base, baseKeys, fk, identity } from './common.js';
import { areas, teams, users, wellTypes } from './fleet.js';
export const assets = pgTable(
  'assets',
  {
    ...base(),
    name: text().notNull(),
    category: text().notNull(),
    wellType: text('well_type').notNull(),
    areaId: text('area_id').notNull(),
    teamId: text('team_id').notNull(),
    inChargeUserId: text('in_charge_user_id').notNull(),
    lat: numeric().notNull(),
    lon: numeric().notNull(),
    installedOn: date('installed_on', { mode: 'string' }).notNull(),
    recordedStatus: text('recorded_status').notNull(),
  },
  (t) => [
    ...baseKeys(t),
    fk([t.namespace, t.wellType], [wellTypes.namespace, wellTypes.id], 'assets_type_fk'),
    fk(
      [t.namespace, t.areaId, t.teamId],
      [areas.namespace, areas.id, areas.teamId],
      'assets_area_team_fk',
    ),
    fk([t.namespace, t.teamId], [teams.namespace, teams.id], 'assets_team_fk'),
    fk([t.namespace, t.inChargeUserId], [users.namespace, users.id], 'assets_owner_fk'),
    check(
      'asset_location_ranges',
      sql`${t.lat} BETWEEN -90 AND 90 AND ${t.lon} BETWEEN -180 AND 180`,
    ),
    check('asset_category', sql`${t.category} = 'oil_well'`),
    check('asset_recorded_status', sql`${t.recordedStatus} IN ('active','down')`),
    index('assets_by_area').on(t.namespace, t.areaId),
  ],
);
export const equipment = pgTable(
  'equipment',
  {
    ...identity(),
    assetId: text('asset_id').notNull(),
    kind: text().notNull(),
    model: text().notNull(),
    raw: jsonb().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.namespace, t.id] }),
    fk([t.namespace, t.assetId], [assets.namespace, assets.id], 'equipment_asset_fk'),
  ],
);
