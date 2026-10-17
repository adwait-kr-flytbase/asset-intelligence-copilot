import type { UIMessage } from 'ai';
import { z } from 'zod';
import { artifactSchema } from './artifact-contract.ts';

export type { Artifact } from './artifact-contract.ts';

export const CATALOG_ID = 'https://lab.example/catalogs/asset-investigation/v1';
export const PROTOCOL = 'v0.9.1' as const;
export const queries = ['attention', 'downtime', 'spills'] as const;
export const viewKinds = [
  'status',
  'table',
  'line',
  'bar',
  'map',
  'heatmap',
  'conflicts',
  'inspections',
  'costs',
  'obligations',
  'timeline',
  'claims',
  'correction',
] as const;
export const querySchema = z.enum(queries);
export const viewSchema = z.enum(viewKinds);
export type Query = z.infer<typeof querySchema>;
export type ViewKind = z.infer<typeof viewSchema>;
const finite = z.number().finite();
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
    'Expected a valid calendar date',
  );
export const operatorParametersSchema = z
  .object({
    wellId: z.enum(['all', 'LAB-W01', 'LAB-W02', 'LAB-W03', 'LAB-W04', 'LAB-W05', 'LAB-W06']),
    inspectionCount: z.number().int().min(1).max(4),
    trendStart: dateSchema,
    trendEnd: dateSchema,
  })
  .strict()
  .refine((p) => p.trendStart <= p.trendEnd, 'Trend start must precede its end');
export type OperatorParameters = z.infer<typeof operatorParametersSchema>;
export const DEFAULT_OPERATOR_PARAMETERS: OperatorParameters = {
  wellId: 'all',
  inspectionCount: 4,
  trendStart: '2026-09-24',
  trendEnd: '2026-10-15',
};
const inspectionSchema = z
  .object({
    wellId: z.string().regex(/^LAB-W0[1-6]$/),
    date: dateSchema,
    deltaC: finite.nullable(),
    thresholdC: finite,
    sourceIds: z.array(z.string()).min(1),
  })
  .strict();
export const rowSchema = z
  .object({
    id: z.string().regex(/^LAB-W\d{2}$/),
    area: z.string(),
    type: z.enum(['T200', 'T350']),
    producing: z.boolean(),
    deltaC: finite,
    thresholdC: finite,
    downtimeDays: finite.nonnegative(),
    spillBbl: finite.nonnegative(),
    spillDate: z.string().nullable(),
    lat: finite.min(-90).max(90).nullable(),
    lon: finite.min(-180).max(180).nullable(),
    trend: z.array(z.object({ date: z.string(), deltaC: finite.nullable() }).strict()).max(30),
    sourceIds: z.array(z.string()).min(1),
    conflicts: z.array(z.string().max(500)),
  })
  .strict();
export const resultSchema = z
  .object({
    id: z.string(),
    query: querySchema,
    revision: z.literal(1),
    synthetic: z.literal(true),
    title: z.string(),
    period: z.string(),
    asOf: z.string(),
    rows: z.array(rowSchema).max(100),
    inspections: z.array(inspectionSchema).max(400).optional(),
    artifacts: z.array(artifactSchema).max(40).optional(),
    sources: z
      .array(z.object({ id: z.string(), label: z.string(), body: z.string() }).strict())
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((r, c) => {
    if (r.id !== `lab-${r.query}-r1`)
      c.addIssue({ code: 'custom', message: 'Unknown result handle' });
    const ids = new Set(r.sources.map((s) => s.id));
    if (ids.size !== r.sources.length || new Set(r.rows.map((w) => w.id)).size !== r.rows.length)
      c.addIssue({ code: 'custom', message: 'Duplicate identifiers' });
    const wellIds = new Set(r.rows.map((row) => row.id));
    const inspectionIds = new Set<string>();
    for (const inspection of r.inspections || []) {
      const key = `${inspection.wellId}/${inspection.date}`;
      if (!wellIds.has(inspection.wellId) || inspectionIds.has(key))
        c.addIssue({ code: 'custom', message: 'Unknown or duplicate inspection well/date' });
      inspectionIds.add(key);
      for (const source of inspection.sourceIds)
        if (!ids.has(source))
          c.addIssue({ code: 'custom', message: 'Unknown inspection evidence reference' });
    }
    for (const row of r.rows)
      for (const source of row.sourceIds)
        if (!ids.has(source)) c.addIssue({ code: 'custom', message: 'Unknown evidence reference' });
    const artifactIds = new Set<string>();
    for (const artifact of r.artifacts || []) {
      if (artifactIds.has(artifact.id))
        c.addIssue({ code: 'custom', message: 'Duplicate artifact identifier' });
      artifactIds.add(artifact.id);
      for (const well of artifact.scope.wellIds)
        if (!wellIds.has(well))
          c.addIssue({ code: 'custom', message: 'Artifact scope references an unreturned well' });
      for (const source of artifact.sourceIds)
        if (!ids.has(source))
          c.addIssue({ code: 'custom', message: 'Unknown artifact evidence reference' });
    }
  });
export type Result = z.infer<typeof resultSchema>;
export type Well = Result['rows'][number];
export const planSchema = z
  .object({
    query: querySchema,
    views: z
      .array(viewSchema)
      .min(1)
      .max(12)
      .refine((v) => new Set(v).size === v.length, 'Duplicate view'),
  })
  .strict();
export type Plan = z.infer<typeof planSchema>;
export type WireMessage = { version: typeof PROTOCOL; [key: string]: unknown };
const snapshotSchema = z
  .object({
    runId: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
    plan: planSchema,
    result: resultSchema,
    phase: z.enum(['partial', 'ready']),
    generation: z.enum(['replay', 'live', 'local']),
    execution: z
      .object({
        kind: z.enum(['pipeline', 'saved-view']),
        evaluatedAt: z.string().datetime(),
        parameters: operatorParametersSchema,
        savedView: z
          .object({
            id: z.string().uuid(),
            revision: z.literal(1),
            name: z.string().min(1).max(80),
          })
          .strict()
          .optional(),
        activity: z.array(z.string().min(1).max(500)).min(1).max(20),
      })
      .strict()
      .optional(),
    wire: z.array(z.record(z.unknown())).max(5),
  })
  .strict();
export type Snapshot = Omit<z.infer<typeof snapshotSchema>, 'wire'> & { wire: WireMessage[] };
export function buildWire(
  runId: string,
  plan: Plan,
  resultId: string,
  phase: Snapshot['phase'],
): WireMessage[] {
  const components = (views: ViewKind[]) => [
    { id: 'root', component: 'Column', children: views.map((v) => `view-${v}`) },
    ...views.map((kind) => ({
      id: `view-${kind}`,
      component: 'DataView',
      kind,
      resultId: { path: '/resultId' },
    })),
  ];
  const initial = plan.views.slice(0, 2);
  const messages: WireMessage[] = [
    { version: PROTOCOL, createSurface: { surfaceId: runId, catalogId: CATALOG_ID } },
    { version: PROTOCOL, updateDataModel: { surfaceId: runId, path: '/', value: { resultId } } },
    { version: PROTOCOL, updateComponents: { surfaceId: runId, components: components(initial) } },
  ];
  if (phase === 'ready')
    messages.push({
      version: PROTOCOL,
      updateComponents: { surfaceId: runId, components: components(plan.views) },
    });
  return messages;
}
export function makeSnapshot(
  runId: string,
  plan: Plan,
  result: Result,
  phase: Snapshot['phase'],
  generation: Snapshot['generation'] = 'replay',
  execution?: Snapshot['execution'],
): Snapshot {
  return validateSnapshot({
    runId,
    plan,
    result,
    phase,
    generation,
    ...(execution ? { execution } : {}),
    wire: buildWire(runId, plan, result.id, phase),
  });
}
export function validateSnapshot(input: unknown): Snapshot {
  const s = snapshotSchema.parse(input);
  if (s.plan.query !== s.result.query) throw Error('Presentation query does not match its result');
  const expected = buildWire(s.runId, s.plan, s.result.id, s.phase);
  if (JSON.stringify(s.wire) !== JSON.stringify(expected))
    throw Error('Rejected unsupported component, binding or surface update');
  return { ...s, wire: expected };
}
export type LabMessage = UIMessage<
  never,
  { surface: unknown; answer: unknown; progress: { runId: string; label: string } }
>;
export const chatRequestSchema = z
  .object({
    runId: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
    mode: z.enum(['replay', 'live']),
    operator: z.boolean().default(false),
    parameters: operatorParametersSchema.optional(),
    query: querySchema,
    fault: z
      .enum(['none', 'unsupported', 'bad-result', 'bad-source', 'truncated', 'slow'])
      .default('none'),
    representation: z.enum(['auto', 'table']).default('auto'),
    appContext: z
      .object({
        area: z.enum(['All areas', 'North ridge', 'South basin']),
        selectedWellIds: z.array(z.string().regex(/^LAB-W0[1-6]$/)).max(6),
        resultId: z.string().max(80).nullable(),
      })
      .strict()
      .optional(),
    messages: z.array(z.unknown()).min(1).max(30),
  })
  .passthrough();
export class RunGate {
  private current: string | null = null;
  start(id: string) {
    this.current = id;
  }
  cancel() {
    this.current = null;
  }
  accepts(id: string) {
    return this.current === id;
  }
}
export const savedSchema = z
  .object({ schemaVersion: z.literal(1), snapshot: z.unknown() })
  .strict();
export function restoreSnapshot(raw: string): Snapshot {
  const snapshot = validateSnapshot(savedSchema.parse(JSON.parse(raw)).snapshot);
  if (snapshot.phase !== 'ready') throw Error('Saved investigation is incomplete');
  return snapshot;
}
