import { z } from 'zod';
import type { AnalysisInput } from './analytics.js';
import { sourceSchema } from './source-schema.js';

const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const nullableDecimal = decimal.nullable();
const sources = z.array(sourceSchema);
export const rowSchemas = {
  'current-status': z.object({
    assetId: z.string(),
    name: z.string(),
    area: z.string(),
    producing: z.boolean().nullable(),
    deltaC: nullableDecimal,
    thresholdC: decimal,
    observedAt: z.iso.datetime().nullable(),
    inspectionNotes: z.string(),
    sources,
  }),
  'temperature-history': z.object({
    assetId: z.string(),
    inspectionId: z.string(),
    observedAt: z.iso.datetime(),
    ambientC: decimal,
    wellheadC: decimal,
    producing: z.boolean().nullable(),
    deltaC: nullableDecimal,
    inspectionNotes: z.string(),
    spillDetected: z.boolean(),
    spillVolumeBbl: nullableDecimal,
    sources,
  }),
  downtime: z.object({
    assetId: z.string(),
    name: z.string(),
    downtimeDays: z.number().int().nonnegative(),
    nonProducingInspections: z.number().int().nonnegative(),
    inspectionCount: z.number().int().nonnegative(),
    sources,
  }),
  spills: z.union([
    z.object({
      assetId: z.string(),
      name: z.string().optional(),
      inspectionId: z.string(),
      observedAt: z.iso.datetime(),
      volumeBbl: nullableDecimal,
      lat: decimal.nullish(),
      lon: decimal.nullish(),
      sources,
    }),
    z.object({
      areaId: z.string(),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      count: z.number().int().nonnegative(),
      totalBbl: decimal,
      sources,
    }),
  ]),
  'repair-costs': z.object({
    assetId: z.string(),
    name: z.string(),
    totalUsd: decimal,
    jobCount: z.number().int().nonnegative(),
    sources,
  }),
  'repeat-repairs': z.object({
    assetId: z.string(),
    name: z.string(),
    equipmentKind: z.string(),
    correctiveEvents: z.number().int().nonnegative(),
    maintenanceIds: z.array(z.string()),
    sources,
  }),
};
const coverageSchema = z.object({
  kind: z.string(),
  assetsEvaluated: z.number().int().nonnegative().optional(),
  totalRows: z.number().int().nonnegative(),
  returnedRows: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export const analysisEnvelopeSchema = z.object({
  metric: z.enum([
    'current-status',
    'temperature-history',
    'downtime',
    'spills',
    'repair-costs',
    'repeat-repairs',
  ]),
  status: z.literal('unresolved-selection').optional(),
  sources,
  rows: z.array(z.unknown()).max(500),
  warnings: z.array(z.string()),
  coverage: coverageSchema,
  window: z.object({ from: z.iso.date(), through: z.iso.date() }).nullable().optional(),
  asOf: z.iso.datetime().optional(),
  totals: z
    .object({
      spillCount: z.number().int().nonnegative(),
      totalBbl: decimal,
      excludedFalsePositives: z.number().int().nonnegative(),
      unknownVolumeEvents: z.number().int().nonnegative().optional(),
    })
    .optional(),
  correctionAudit: z
    .array(
      z.object({
        inspectionId: z.string(),
        assetId: z.string(),
        action: z.enum(['excluded-false-positive', 'unresolved']),
        reason: z.string(),
        originalVolumeBbl: nullableDecimal,
        sources,
      }),
    )
    .optional(),
  lineage: z
    .object({
      inputHash: z.string(),
      inputRecords: z.number().int().nonnegative(),
      sourceVersions: z.array(z.object({ sourceId: z.string(), path: z.string() })),
    })
    .optional(),
  readProvenance: z
    .object({
      isolation: z.literal('repeatable-read'),
      snapshot: z.string(),
      scope: z.literal('single-domain-operation'),
      observedAt: z.iso.datetime(),
    })
    .optional(),
});
export type ValidAnalysis = ReturnType<typeof parseAnalysis>;
export function parseAnalysis(input: AnalysisInput, output: unknown) {
  const envelope = analysisEnvelopeSchema.parse(output);
  if (envelope.metric !== input.metric) throw new Error('Analysis metric mismatch.');
  const rows = envelope.rows.map((row) => rowSchemas[input.metric].parse(row));
  if (input.assetId && rows.some((row) => 'assetId' in row && row.assetId !== input.assetId))
    throw new Error('Analysis row asset mismatch.');
  if (
    input.window &&
    envelope.window &&
    JSON.stringify(input.window) !== JSON.stringify(envelope.window)
  )
    throw new Error('Analysis window mismatch.');
  if (envelope.coverage.returnedRows !== rows.length)
    throw new Error('Analysis coverage mismatch.');
  return { ...envelope, rows };
}
