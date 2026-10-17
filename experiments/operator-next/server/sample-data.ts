import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const sampleDirectory = process.env.SAMPLE_DATA_DIR
  ? resolve(process.env.SAMPLE_DATA_DIR)
  : fileURLToPath(new URL('../../../sample-data/', import.meta.url));
const inspectionSchema = z.object({
  inspection_id: z.string(),
  asset_id: z.string(),
  inspected_at: z.string().datetime(),
  inspector_user_id: z.string(),
  method: z.string(),
  ambient_temp_c: z.number(),
  wellhead_temp_c: z.number(),
  spill_detected: z.boolean(),
  spill_est_volume_bbl: z.number().nullable(),
  notes: z.string(),
});
const metadataSchema = z.object({
  asset_id: z.string(),
  name: z.string(),
  well_type: z.string(),
  area_id: z.string(),
  location: z.object({ lat: z.number(), lon: z.number() }),
  recorded_status: z.string(),
});
const maintenanceSchema = z.object({
  maintenance_id: z.string(),
  asset_id: z.string(),
  started_at: z.string(),
  completed_at: z.string(),
  maintenance_type: z.string(),
  equipment_kind: z.string(),
  issue: z.string(),
  action_taken: z.string(),
  cost_usd: z.object({ total: z.number() }),
  triggered_by_inspection_id: z.string().nullable(),
  report_file: z.string().nullable(),
});
const noteSchema = z.object({
  note_id: z.string(),
  asset_id: z.string(),
  created_at: z.string(),
  author_user_id: z.string(),
  note_type: z.string(),
  inspection_id: z.string().optional(),
  text: z.string(),
  valid_from: z.string(),
  valid_to: z.string().nullable(),
});
const regulationSchema = z.object({
  event_id: z.string(),
  asset_id: z.string(),
  date: z.string(),
  event_type: z.string(),
  protocol_id: z.string(),
  related_inspection_id: z.string().nullable(),
  detail: z.string(),
  hours_to_report: z.number().nullable(),
  fine_usd: z.number(),
  status: z.string(),
});
export type Inspection = z.infer<typeof inspectionSchema>;
export type Maintenance = z.infer<typeof maintenanceSchema>;
export type Note = z.infer<typeof noteSchema>;
export type Regulation = z.infer<typeof regulationSchema>;
export type SampleWell = {
  metadata: z.infer<typeof metadataSchema>;
  inspections: Inspection[];
  maintenance: Maintenance[];
  notes: Note[];
  regulations: Regulation[];
};
export type SampleData = {
  wells: SampleWell[];
  areas: { area_id: string; name: string; asset_ids: string[] }[];
  users: Map<string, string>;
  manuals: Map<string, { text: string; threshold: number; section: string }>;
  sops: { spill: string; regulatory: string };
  revision: string;
};
export async function sampleAvailable() {
  try {
    await access(resolve(sampleDirectory, 'fleet/areas.json'));
    return true;
  } catch {
    return false;
  }
}
async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(sampleDirectory, path), 'utf8'));
}
async function lines<T>(path: string, schema: z.ZodType<T>): Promise<T[]> {
  return (await readFile(resolve(sampleDirectory, path), 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => schema.parse(JSON.parse(line)));
}
export async function loadSample(): Promise<SampleData> {
  if (!(await sampleAvailable()))
    throw Error('Local sample-data is unavailable. Synthetic demo remains usable.');
  const [areaFile, userFile, folders, spill, regulatory] = await Promise.all([
    json<{ areas: SampleData['areas'] }>('fleet/areas.json'),
    json<{ users: { user_id: string; name: string }[] }>('fleet/users.json'),
    readdir(resolve(sampleDirectory, 'assets')),
    readFile(resolve(sampleDirectory, 'fleet/sops/spill-response-sop.md'), 'utf8'),
    readFile(resolve(sampleDirectory, 'fleet/sops/regulatory-compliance-sop.md'), 'utf8'),
  ]);
  const wells = await Promise.all(
    folders
      .filter((id) => /^WELL-\d+$/.test(id))
      .sort()
      .map(async (id) => {
        const [metadata, inspections, maintenance, notes, regulations] = await Promise.all([
          json(`assets/${id}/metadata.json`).then((v) => metadataSchema.parse(v)),
          lines(`assets/${id}/inspections.jsonl`, inspectionSchema),
          lines(`assets/${id}/maintenance.jsonl`, maintenanceSchema),
          lines(`assets/${id}/context.jsonl`, noteSchema),
          lines(`assets/${id}/regulatory-events.jsonl`, regulationSchema),
        ]);
        if (metadata.asset_id !== id) throw Error('Asset directory identity mismatch');
        for (const record of [...inspections, ...maintenance, ...notes, ...regulations])
          if (record.asset_id !== metadata.asset_id)
            throw Error('Cross-well record identity mismatch');
        return {
          metadata,
          inspections: inspections.sort((a, b) => a.inspected_at.localeCompare(b.inspected_at)),
          maintenance,
          notes,
          regulations,
        };
      }),
  );
  const manuals = new Map<string, { text: string; threshold: number; section: string }>();
  for (const type of [...new Set(wells.map((w) => w.metadata.well_type))]) {
    if (!/^[A-Z0-9-]+$/.test(type)) throw Error('Unknown well type');
    const text = await readFile(resolve(sampleDirectory, `fleet/well-types/${type}.md`), 'utf8');
    const section = text.split(/(?=^##?\s)/m).find((s) => /Production temperature rule/i.test(s));
    const threshold = section
      ?.replace(/\*/g, '')
      .match(/at least\s+(\d+(?:\.\d+)?)\s*°C\s+above\s+ambient/i)?.[1];
    if (!threshold || !section) throw Error('Manual production threshold unavailable');
    manuals.set(type, { text, threshold: Number(threshold), section: section.trim() });
  }
  const hash = createHash('sha256')
    .update(JSON.stringify({ wells, manuals: [...manuals], spill, regulatory }))
    .digest('hex')
    .slice(0, 16);
  return {
    wells,
    areas: areaFile.areas,
    users: new Map(userFile.users.map((u) => [u.user_id, u.name])),
    manuals,
    sops: { spill, regulatory },
    revision: `sample-${hash}`,
  };
}
export async function readRepairReport(wellId: string, record: Maintenance) {
  if (!record.report_file) return null;
  const root = resolve(sampleDirectory, 'assets', wellId);
  const path = resolve(root, record.report_file);
  if (!path.startsWith(root + sep)) throw Error('Unsafe maintenance report reference');
  try {
    return { text: await readFile(path, 'utf8'), path: `assets/${wellId}/${record.report_file}` };
  } catch {
    return null;
  }
}
// Only explicit formal corrections can suppress a detection. Conflicting ordinary notes do not.
export function correctedSpills(well: SampleWell) {
  return well.inspections
    .filter((i) => i.spill_detected)
    .map((inspection) => {
      const corrections = well.notes.filter(
        (n) => n.note_type === 'correction' && n.inspection_id === inspection.inspection_id,
      );
      const suppressed = corrections.some((n) =>
        /not (?:a |an )?(?:(?:oil|crude) )?spill|false.positive|not crude|rainwater|shadow|confirmed (?:as )?(?:water|mud)/i.test(
          n.text,
        ),
      );
      return { inspection, corrections, suppressed };
    });
}
