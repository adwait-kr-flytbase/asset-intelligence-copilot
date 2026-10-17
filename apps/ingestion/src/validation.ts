import { isLosslessNumber, type LosslessNumber } from 'lossless-json';
import { z } from 'zod';

const id = z.string().min(1);
const decimal = z
  .custom<LosslessNumber>(isLosslessNumber, 'Expected a JSON number')
  .transform((n) => n.value);
const instant = z.iso.datetime({ offset: true });
const date = z.iso.date();
const position = z.object({ lat: decimal, lon: decimal }).passthrough();
export const fleetSchema = z
  .object({
    areas: z.array(
      z
        .object({ area_id: id, name: id, team_id: id, center: position, asset_ids: z.array(id) })
        .passthrough(),
    ),
    teams: z.array(z.object({ team_id: id, name: id, lead_user_id: id }).passthrough()),
  })
  .passthrough();
export const usersSchema = z
  .object({
    users: z.array(
      z
        .object({
          user_id: id,
          name: id,
          role: id,
          team_id: id,
        })
        .passthrough(),
    ),
  })
  .passthrough();
export const assetSchema = z
  .object({
    asset_id: id,
    name: id,
    asset_category: z.literal('oil_well'),
    well_type: id,
    area_id: id,
    team_id: id,
    in_charge_user_id: id,
    location: position,
    installed_on: date,
    recorded_status: z.enum(['active', 'down']),
    equipment: z.array(z.object({ equipment_id: id, kind: id, model: id }).passthrough()),
    last_inspection: z
      .object({ inspection_id: id, inspected_at: instant, inspector_user_id: id })
      .passthrough(),
  })
  .passthrough();
export const inspectionSchema = z
  .object({
    inspection_id: id,
    asset_id: id,
    inspected_at: instant,
    inspector_user_id: id,
    method: z.enum(['drone', 'manual']),
    ambient_temp_c: decimal,
    wellhead_temp_c: decimal,
    spill_detected: z.boolean(),
    spill_area_pct: decimal.nullable(),
    spill_est_volume_bbl: decimal.nullable(),
    evidence_images: z.array(id),
    notes: z.string(),
  })
  .passthrough();
export const maintenanceSchema = z
  .object({
    maintenance_id: id,
    asset_id: id,
    started_at: instant,
    completed_at: instant,
    maintenance_type: z.enum(['scheduled', 'corrective']),
    equipment_kind: id,
    issue: z.string(),
    action_taken: z.string(),
    technician_user_id: id,
    contractor: z.string().nullable(),
    downtime_hours: decimal,
    cost_usd: z.object({ labor: decimal, parts: decimal, total: decimal }).passthrough(),
    triggered_by_inspection_id: id.nullable(),
    report_file: id.nullable(),
  })
  .passthrough();
export const regulatorySchema = z
  .object({
    event_id: id,
    asset_id: id,
    date,
    agency: id,
    event_type: z.enum([
      'spill_report_filed',
      'notice_of_violation',
      'site_inspection',
      'nov_response_filed',
    ]),
    protocol_id: id,
    related_inspection_id: id,
    hours_to_report: decimal.nullable(),
    detail: z.string(),
    fine_usd: decimal,
    status: z.enum(['open', 'closed']),
  })
  .passthrough();
export const contextSchema = z
  .object({
    note_id: id,
    asset_id: id,
    created_at: instant,
    author_user_id: id,
    note_type: z.enum(['operator_note', 'operator_feedback', 'correction']),
    inspection_id: id.optional(),
    text: z.string(),
    valid_from: date,
    valid_to: date.nullable(),
  })
  .passthrough();
