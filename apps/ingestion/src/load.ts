import { createHash } from 'node:crypto';
import { readdir, readFile, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { createDatabase } from '@repo/db';
import * as s from '@repo/db/schema';
import { type InferInsertModel, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { parse, stringify } from 'lossless-json';
import {
  assetSchema,
  contextSchema,
  fleetSchema,
  inspectionSchema,
  maintenanceSchema,
  regulatorySchema,
  usersSchema,
} from './validation.js';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
/** Local operator CLI: in-memory planning is intentional at challenge dataset scale. */
export async function loadDirectory(rootPath: string, namespace: string, databaseUrl: string) {
  const root = await realpath(rootPath);
  const sourceFiles: (typeof s.sourceFiles.$inferInsert)[] = [];
  const assetFolders = (await readdir(join(root, 'assets'), { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  async function walk(dir: string): Promise<void> {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlinks inside the dataset are not supported.');
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const portable = relative(root, path).split(sep).join('/');
        const bytes = await readFile(path);
        const content = bytes.toString('utf8');
        if (!bytes.equals(Buffer.from(content, 'utf8')))
          throw new Error(`Source is not valid UTF-8: ${portable}`);
        const contentHash = sha(content);
        sourceFiles.push({
          namespace,
          id: sha(`${portable}\0${contentHash}`),
          path: portable,
          content,
          contentHash,
        });
      }
    }
  }
  await walk(root);
  const byPath = new Map(sourceFiles.map((f) => [f.path, f]));
  function source(path: string) {
    const target = resolve(root, path);
    if (!target.startsWith(`${root}${sep}`))
      throw new Error('Referenced source escapes dataset root.');
    const f = byPath.get(path);
    if (!f) throw new Error(`Missing source file: ${path}`);
    return f;
  }
  const rows = {
    assets: [] as (typeof s.assets.$inferInsert)[],
    inspections: [] as (typeof s.inspections.$inferInsert)[],
    maintenance: [] as (typeof s.maintenance.$inferInsert)[],
    regulatory: [] as (typeof s.regulatoryEvents.$inferInsert)[],
    context: [] as (typeof s.context.$inferInsert)[],
    areas: [] as (typeof s.areas.$inferInsert)[],
    teams: [] as (typeof s.teams.$inferInsert)[],
    users: [] as (typeof s.users.$inferInsert)[],
    equipment: [] as (typeof s.equipment.$inferInsert)[],
    pointers: [] as (typeof s.recordedInspectionPointers.$inferInsert)[],
    leads: [] as (typeof s.teamLeads.$inferInsert)[],
    documents: [] as (typeof s.documents.$inferInsert)[],
    reports: [] as (typeof s.maintenanceReports.$inferInsert)[],
    manuals: [] as (typeof s.wellTypeManuals.$inferInsert)[],
    types: [] as (typeof s.wellTypes.$inferInsert)[],
  };
  const original = (
    raw: unknown,
    sourcePath: string,
    sourceLine: number | null = null,
    sourcePointer: string | null = null,
  ) => ({
    namespace,
    sourceId: source(sourcePath).id,
    sourcePath,
    sourceLine,
    sourcePointer,
    raw: sql`${stringify(raw)}::jsonb`,
  });
  const fleetRaw = parse(source('fleet/areas.json').content) as {
    areas: unknown[];
    teams: unknown[];
  };
  const fleet = fleetSchema.parse(fleetRaw);
  fleet.areas.forEach((r, i) => {
    rows.areas.push({
      ...original(fleetRaw.areas[i], 'fleet/areas.json', null, `/areas/${i}`),
      id: r.area_id,
      name: r.name,
      teamId: r.team_id,
      lat: String(r.center.lat),
      lon: String(r.center.lon),
    });
  });
  fleet.teams.forEach((r, i) => {
    rows.teams.push({
      ...original(fleetRaw.teams[i], 'fleet/areas.json', null, `/teams/${i}`),
      id: r.team_id,
      name: r.name,
    });
    rows.leads.push({ namespace, teamId: r.team_id, userId: r.lead_user_id });
  });
  const usersRaw = parse(source('fleet/users.json').content) as { users: unknown[] };
  usersSchema.parse(usersRaw).users.forEach((r, i) => {
    rows.users.push({
      ...original(usersRaw.users[i], 'fleet/users.json', null, `/users/${i}`),
      id: r.user_id,
      name: r.name,
      role: r.role,
      teamId: r.team_id,
    });
  });
  for (const file of sourceFiles.filter(
    (f) => f.path.startsWith('fleet/') && f.path.endsWith('.md'),
  )) {
    const manual = file.path.startsWith('fleet/well-types/');
    rows.documents.push({
      namespace,
      id: file.path,
      sourceId: file.id,
      sourcePath: file.path,
      kind: manual ? 'manual' : 'sop',
      assetId: null,
      markdown: file.content,
    });
    if (manual) {
      const type = file.path.slice('fleet/well-types/'.length, -3);
      rows.types.push({ namespace, id: type });
      rows.manuals.push({ namespace, wellType: type, documentId: file.path });
    }
  }
  for (const folder of assetFolders) {
    const base = `assets/${folder}`;
    const assetRaw = parse(source(`${base}/metadata.json`).content);
    const r = assetSchema.parse(assetRaw);
    if (r.asset_id !== folder)
      throw new Error(`${base}/metadata.json: asset_id differs from directory`);
    rows.assets.push({
      ...original(assetRaw, `${base}/metadata.json`),
      id: r.asset_id,
      name: r.name,
      category: r.asset_category,
      wellType: r.well_type,
      areaId: r.area_id,
      teamId: r.team_id,
      inChargeUserId: r.in_charge_user_id,
      lat: String(r.location.lat),
      lon: String(r.location.lon),
      installedOn: r.installed_on,
      recordedStatus: r.recorded_status,
    });
    rows.equipment.push(
      ...r.equipment.map((e) => ({
        namespace,
        id: e.equipment_id,
        assetId: r.asset_id,
        kind: e.kind,
        model: e.model,
        raw: sql`${stringify((assetRaw as { equipment: unknown[] }).equipment.find((raw) => (raw as { equipment_id: string }).equipment_id === e.equipment_id))}::jsonb`,
      })),
    );
    rows.pointers.push({
      namespace,
      assetId: r.asset_id,
      inspectionId: r.last_inspection.inspection_id,
    });
    for (const kind of ['inspections', 'maintenance', 'regulatory-events', 'context']) {
      const path = `${base}/${kind}.jsonl`;
      const lines = source(path).content.split('\n');
      for (let n = 0; n < lines.length; n++) {
        const line = lines[n];
        if (!line?.trim()) continue;
        let input: unknown;
        try {
          input = parse(line);
        } catch {
          throw new Error(`${path}:${n + 1}: invalid JSON`);
        }
        const raw = original(input, path, n + 1);
        if ((input as { asset_id?: string }).asset_id !== folder)
          throw new Error(`${path}:${n + 1}: wrong asset_id`);
        if (kind === 'inspections') {
          const r = inspectionSchema.parse(input);
          rows.inspections.push({
            ...raw,
            id: r.inspection_id,
            assetId: r.asset_id,
            inspectedAt: r.inspected_at,
            inspectorId: r.inspector_user_id,
            method: r.method,
            ambientTempC: String(r.ambient_temp_c),
            wellheadTempC: String(r.wellhead_temp_c),
            spillDetected: r.spill_detected,
            spillAreaPct: r.spill_area_pct === null ? null : String(r.spill_area_pct),
            spillVolumeBbl: r.spill_est_volume_bbl === null ? null : String(r.spill_est_volume_bbl),
            evidenceImages: r.evidence_images,
            notes: r.notes,
          });
        }
        if (kind === 'maintenance') {
          const r = maintenanceSchema.parse(input);
          rows.maintenance.push({
            ...raw,
            id: r.maintenance_id,
            assetId: r.asset_id,
            startedAt: r.started_at,
            completedAt: r.completed_at,
            type: r.maintenance_type,
            equipmentKind: r.equipment_kind,
            issue: r.issue,
            actionTaken: r.action_taken,
            technicianId: r.technician_user_id,
            contractor: r.contractor,
            downtimeHours: String(r.downtime_hours),
            laborUsd: String(r.cost_usd.labor),
            partsUsd: String(r.cost_usd.parts),
            totalUsd: String(r.cost_usd.total),
            triggerInspectionId: r.triggered_by_inspection_id,
            reportFile: r.report_file,
          });
          if (r.report_file) {
            const id = `${base}/${r.report_file}`;
            rows.documents.push({
              namespace,
              id,
              sourceId: source(id).id,
              sourcePath: id,
              kind: 'maintenance_report',
              assetId: r.asset_id,
              markdown: source(id).content,
            });
            rows.reports.push({
              namespace,
              assetId: r.asset_id,
              maintenanceId: r.maintenance_id,
              documentId: id,
            });
          }
        }
        if (kind === 'regulatory-events') {
          const r = regulatorySchema.parse(input);
          rows.regulatory.push({
            ...raw,
            id: r.event_id,
            assetId: r.asset_id,
            date: r.date,
            agency: r.agency,
            type: r.event_type,
            protocolId: r.protocol_id,
            inspectionId: r.related_inspection_id,
            hoursToReport: r.hours_to_report === null ? null : String(r.hours_to_report),
            detail: r.detail,
            fineUsd: String(r.fine_usd),
            status: r.status,
          });
        }
        if (kind === 'context') {
          const r = contextSchema.parse(input);
          rows.context.push({
            ...raw,
            id: r.note_id,
            assetId: r.asset_id,
            createdAt: r.created_at,
            authorId: r.author_user_id,
            type: r.note_type,
            inspectionId: r.inspection_id ?? null,
            text: r.text,
            validFrom: r.valid_from,
            validTo: r.valid_to,
          });
        }
      }
    }
  }

  // Preserve known manual/report classification; register other Markdown for indexing.
  const registered = new Set(rows.documents.map((document) => document.id));
  for (const file of sourceFiles.filter((file) => /\.md$/i.test(file.path))) {
    if (registered.has(file.path)) continue;
    const assetId = file.path.startsWith('assets/') ? file.path.split('/')[1] : null;
    if (assetId && !rows.assets.some((asset) => asset.id === assetId))
      throw new Error(`Document references unknown asset directory: ${file.path}`);
    rows.documents.push({
      namespace,
      id: file.path,
      sourceId: file.id,
      sourcePath: file.path,
      kind: 'reference',
      assetId,
      markdown: file.content,
    });
  }

  const connection = createDatabase(databaseUrl);
  try {
    await connection.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${namespace},0))`);
      await tx.insert(s.fields).values({ id: namespace }).onConflictDoNothing();
      // Every typed source row is either identical to its existing raw JSON or a conflict.
      // This avoids silent overwrites without building a versioned publication framework.
      async function insert<T extends PgTable>(
        table: T,
        data: InferInsertModel<T>[],
        conflict?: { target: AnyPgColumn[]; same: SQL; set: Record<string, SQL> },
      ) {
        for (let n = 0; n < data.length; n += 250) {
          const chunk = data.slice(n, n + 250);
          // Generic table plumbing is kept here; call sites retain table-specific insert types.
          const query = tx.insert(table).values(chunk);
          if (conflict) {
            const result = await query
              .onConflictDoUpdate({
                target: conflict.target,
                set: conflict.set,
                setWhere: conflict.same,
              })
              .returning();
            if (result.length !== chunk.length)
              throw new Error(
                'Existing record differs from input. Update the local loader deliberately; no data was published.',
              );
          } else await query.onConflictDoNothing();
        }
      }
      await insert(s.sourceFiles, sourceFiles);
      await insert(s.teams, rows.teams, {
        target: [s.teams.namespace, s.teams.id],
        same: sql`${s.teams.raw}=excluded.raw`,
        set: { raw: sql`excluded.raw` },
      });
      await insert(s.users, rows.users, {
        target: [s.users.namespace, s.users.id],
        same: sql`${s.users.raw}=excluded.raw`,
        set: { raw: sql`excluded.raw` },
      });
      await insert(s.teamLeads, rows.leads);
      await insert(s.areas, rows.areas, {
        target: [s.areas.namespace, s.areas.id],
        same: sql`${s.areas.raw}=excluded.raw`,
        set: { raw: sql`excluded.raw` },
      });
      await insert(s.wellTypes, rows.types);
      await insert(s.assets, rows.assets, {
        target: [s.assets.namespace, s.assets.id],
        same: sql`${s.assets.raw}=excluded.raw`,
        set: { raw: sql`excluded.raw` },
      });
      await insert(s.equipment, rows.equipment, {
        target: [s.equipment.namespace, s.equipment.id],
        same: sql`${s.equipment.raw}=excluded.raw AND ${s.equipment.assetId}=excluded.asset_id`,
        set: { raw: sql`excluded.raw` },
      });
      await insert(s.inspections, rows.inspections, {
        target: [s.inspections.namespace, s.inspections.id],
        same: sql`${s.inspections.raw}=excluded.raw`,
        set: { raw: sql`excluded.raw` },
      });
      await insert(s.recordedInspectionPointers, rows.pointers);
      await insert(s.maintenance, rows.maintenance, {
        target: [s.maintenance.namespace, s.maintenance.id],
        same: sql`${s.maintenance.raw}=excluded.raw`,
        set: { raw: sql`excluded.raw` },
      });
      await insert(s.regulatoryEvents, rows.regulatory, {
        target: [s.regulatoryEvents.namespace, s.regulatoryEvents.id],
        same: sql`${s.regulatoryEvents.raw}=excluded.raw`,
        set: { raw: sql`excluded.raw` },
      });
      await insert(s.context, rows.context, {
        target: [s.context.namespace, s.context.id],
        same: sql`${s.context.raw}=excluded.raw`,
        set: { raw: sql`excluded.raw` },
      });
      await insert(s.documents, rows.documents, {
        target: [s.documents.namespace, s.documents.id],
        same: sql`${s.documents.markdown}=excluded.markdown AND ${s.documents.assetId} IS NOT DISTINCT FROM excluded.asset_id AND ${s.documents.kind}=excluded.kind`,
        set: { markdown: sql`excluded.markdown` },
      });
      await insert(s.maintenanceReports, rows.reports);
      await insert(s.wellTypeManuals, rows.manuals);
    });
  } finally {
    await connection.close();
  }
  return {
    namespace,
    sourceFiles: sourceFiles.length,
    assets: rows.assets.length,
    inspections: rows.inspections.length,
    maintenance: rows.maintenance.length,
    documents: rows.documents.length,
  };
}
