import { sql } from 'drizzle-orm';
import { check, numeric, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';
import { base, baseKeys, fk, identity } from './common.js';
export const teams = pgTable('teams', { ...base(), name: text().notNull() }, (t) => baseKeys(t));
export const users = pgTable(
  'users',
  { ...base(), name: text().notNull(), role: text().notNull(), teamId: text('team_id').notNull() },
  (t) => [
    ...baseKeys(t),
    fk([t.namespace, t.teamId], [teams.namespace, teams.id], 'users_team_fk'),
  ],
);
export const teamLeads = pgTable(
  'team_leads',
  {
    namespace: text().notNull(),
    teamId: text('team_id').notNull(),
    userId: text('user_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.namespace, t.teamId] }),
    fk([t.namespace, t.teamId], [teams.namespace, teams.id], 'team_lead_team_fk'),
    fk([t.namespace, t.userId], [users.namespace, users.id], 'team_lead_user_fk'),
  ],
);
export const areas = pgTable(
  'areas',
  {
    ...base(),
    name: text().notNull(),
    teamId: text('team_id').notNull(),
    lat: numeric().notNull(),
    lon: numeric().notNull(),
  },
  (t) => [
    ...baseKeys(t),
    fk([t.namespace, t.teamId], [teams.namespace, teams.id], 'areas_team_fk'),
    unique('area_team_identity').on(t.namespace, t.id, t.teamId),
    check(
      'area_location_ranges',
      sql`${t.lat} BETWEEN -90 AND 90 AND ${t.lon} BETWEEN -180 AND 180`,
    ),
  ],
);
export const wellTypes = pgTable('well_types', { ...identity() }, (t) => [
  primaryKey({ columns: [t.namespace, t.id] }),
]);
