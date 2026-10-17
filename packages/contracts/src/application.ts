import type { UIMessage } from 'ai';
import { z } from 'zod';

const id = z.string().min(1).max(256);
const recordId = z.string().min(1).max(512);
const label = z.string().min(1).max(512);
const datetime = z.iso.datetime({ offset: true });
const date = z.iso.date();
const decimal = z
  .string()
  .max(128)
  .regex(/^-?\d+(?:\.\d+)?$/, 'Expected an exact decimal string');
const evidenceIds = z.array(id).max(20_000);
const warnings = z.array(z.string().max(2_000)).max(100);

export const readParametersSchema = z.strictObject({
  assetIds: z.array(recordId).min(1).max(200).optional(),
  scope: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('asset'), assetId: recordId }),
    z.strictObject({ kind: z.literal('area'), area: label }),
    z.strictObject({ kind: z.literal('fleet') }),
  ]),
  window: z
    .strictObject({ from: date, through: date })
    .refine((value) => value.from <= value.through, {
      message: 'Window must be ordered',
    })
    .optional(),
  limit: z.number().int().min(1).max(500).default(100),
  equipmentKind: z.string().min(1).max(256).optional(),
  team: label.optional(),
});
export type ReadParameters = z.infer<typeof readParametersSchema>;

const presentation = z.enum(['status', 'table', 'ranking', 'series', 'geo', 'matrix', 'bar']);
export const readRecipeSchema = z
  .strictObject({
    operation: z.enum([
      'current-status',
      'asset-locations',
      'temperature-history',
      'downtime',
      'spills',
      'repair-costs',
      'repeat-repairs',
      'operational-assessment',
    ]),
    parameters: readParametersSchema,
    presentation,
    groupBy: z.enum(['asset', 'area-month']).optional(),
    assessment: z
      .strictObject({
        topic: z.string().min(1).max(128),
        measure: z
          .enum(['wellhead-temperature', 'ambient-temperature', 'temperature-difference'])
          .optional(),
        groupBy: z.enum(['region', 'area', 'team', 'well', 'well-type']).optional(),
        timeGrain: z.enum(['all', 'week', 'month']).optional(),
        orderBy: z.enum(['mean', 'maximum', 'minimum', 'observations']).optional(),
        query: z.string().max(500).optional(),
        kind: z.enum(['operator_note', 'note', 'maintenance', 'inspection']).optional(),
        currentStatus: z.enum(['not-producing', 'producing']).optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    const reject = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (
      !['current-status', 'asset-locations', 'operational-assessment'].includes(value.operation) &&
      !value.parameters.window
    )
      reject('This operation requires a window');
    if (value.operation === 'operational-assessment' && !value.assessment)
      reject('Operational assessments require an assessment binding');
    if (
      value.presentation === 'bar' &&
      (value.operation !== 'operational-assessment' || value.assessment?.topic !== 'repair-delays')
    )
      reject('Stacked bars require repair delay assessment data');
    if (value.presentation === 'geo' && !['spills', 'asset-locations'].includes(value.operation))
      reject('Geo requires spills or asset locations');
    if (value.presentation === 'matrix' && value.operation !== 'spills')
      reject('Matrix requires spills');
    if (
      value.operation === 'asset-locations' &&
      (!['geo', 'table'].includes(value.presentation) ||
        value.parameters.window ||
        value.parameters.equipmentKind ||
        value.groupBy)
    )
      reject('Asset locations support geo/table and inventory scope only');
    if (value.presentation === 'series' && value.operation !== 'temperature-history')
      reject('Series requires temperature history');
    if (value.presentation === 'status' && value.operation !== 'current-status')
      reject('Status requires current status');
    if (
      value.groupBy === 'area-month' &&
      (value.operation !== 'spills' || value.presentation !== 'matrix')
    )
      reject('Area-month grouping requires a spills matrix');
  });
export type ReadRecipe = z.infer<typeof readRecipeSchema>;

export const appEvidenceSchema = z.strictObject({
  id,
  recordId,
  sourceVersionId: id,
  label,
  path: recordId,
  locator: z
    .strictObject({
      line: z.number().int().min(1).optional(),
      startLine: z.number().int().min(1).optional(),
      endLine: z.number().int().min(1).optional(),
      jsonPointer: z
        .string()
        .max(2_048)
        .regex(/^(?:\/(?:[^~]|~[01])*)*$/)
        .optional(),
    })
    .refine(
      (value) =>
        value.endLine === undefined ||
        (value.startLine !== undefined && value.endLine >= value.startLine),
      {
        message: 'Line spans require an ordered start and end',
      },
    ),
  excerpt: z.string().max(12_000),
  excerptTruncated: z.boolean(),
});
export type AppEvidence = z.infer<typeof appEvidenceSchema>;

const longitude = z.number().finite().min(-180).max(180);
const latitude = z.number().finite().min(-90).max(90);
const point = z.strictObject({
  type: z.literal('Point'),
  coordinates: z.tuple([longitude, latitude]),
});
const column = z.strictObject({
  key: z.string().min(1).max(128),
  label,
  valueType: z.enum(['string', 'decimal', 'integer', 'boolean', 'timestamp']),
  unit: z.string().max(128).optional(),
});
const row = z.record(
  z.string().min(1).max(128),
  z.union([z.string().max(12_000), z.number().finite(), z.boolean(), z.null(), evidenceIds]),
);

export const panelSchema = z
  .strictObject({
    id,
    kind: presentation,
    state: z.enum(['ready', 'empty', 'unavailable', 'failed']),
    title: label,
    parameters: readParametersSchema,
    columns: z.array(column).max(100),
    rows: z.array(row).max(500),
    evidenceIds,
    warnings,
    bar: z
      .strictObject({ categoryField: label, seriesField: label, valueField: label, unit: label })
      .optional(),
    resultBinding: z
      .strictObject({
        resultId: id,
        inputResultIds: z.array(id).min(1).max(8).optional(),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/),
        sourceManifestHash: z.string().regex(/^[a-f0-9]{64}$/),
        operation: z.string().max(128),
        metric: z.string().max(128),
        quantity: label,
        valueField: z.string().max(128).optional(),
        timeField: z.string().max(128).optional(),
        timeZone: z.literal('UTC'),
        nullPolicy: z.literal('unknown-not-zero'),
        calculationVersion: z.string().max(128),
        consistency: z.enum(['single-domain-operation', 'adapter-defined']),
      })
      .optional(),
    totals: z
      .strictObject({
        spillCount: z.number().int().nonnegative(),
        totalBbl: decimal,
        excludedFalsePositives: z.number().int().nonnegative(),
        unknownVolumeEvents: z.number().int().nonnegative().optional(),
      })
      .optional(),
    corrections: z
      .array(
        z.strictObject({
          inspectionId: recordId,
          assetId: recordId,
          action: z.enum(['excluded-false-positive', 'unresolved']),
          reason: z.string().max(12000),
          originalVolumeBbl: decimal.nullable(),
          evidenceIds,
        }),
      )
      .max(20000)
      .optional(),
    mapCoverage: z
      .strictObject({
        returnedEvents: z.number().int().nonnegative(),
        mappedEvents: z.number().int().nonnegative(),
        unmappedEvents: z.number().int().nonnegative(),
        distinctMappedAssets: z.number().int().nonnegative(),
        markerMeaning: z.literal('spill-event'),
      })
      .optional(),
    seriesSemantics: z
      .strictObject({
        quantity: label,
        valueField: label,
        timeField: label,
        timeZone: z.literal('UTC'),
        interpolation: z.literal('none'),
        missing: z.literal('gap'),
        cadence: z.literal('discrete-inspections'),
        returnedSeries: z.number().int().nonnegative(),
        displayedSeries: z.number().int().nonnegative(),
      })
      .optional(),
    coverage: z
      .strictObject({
        kind: z.string().min(1).max(256),
        assetsEvaluated: z.number().int().nonnegative().optional(),
        totalRows: z.number().int().nonnegative(),
        returnedRows: z.number().int().nonnegative().max(500),
        truncated: z.boolean(),
      })
      .refine((value) => value.returnedRows <= value.totalRows, {
        message: 'Returned rows cannot exceed total rows',
      }),
    status: z
      .strictObject({
        assetId: recordId,
        producing: z.boolean().nullable(),
        deltaC: decimal.nullable(),
        thresholdC: decimal.nullable(),
        observedAt: datetime.nullable(),
        recordedStatus: z.string().max(512).nullable(),
      })
      .optional(),
    geo: z
      .strictObject({
        type: z.literal('FeatureCollection'),
        features: z
          .array(
            z.strictObject({
              type: z.literal('Feature'),
              id,
              geometry: point.nullable(),
              properties: z.strictObject({
                assetId: recordId,
                eventId: recordId.nullable(),
                label,
                observedAt: datetime.nullable(),
                volumeBbl: decimal.nullable(),
                status: z.enum(['unknown', 'producing', 'below-threshold']),
                evidenceIds,
              }),
            }),
          )
          .max(500),
        bbox: z
          .tuple([longitude, latitude, longitude, latitude])
          .refine((value) => value[1] <= value[3], {
            message: 'Bbox latitude bounds must be ordered',
          })
          .optional(),
      })
      .optional(),
    series: z
      .array(
        z.strictObject({
          id,
          label,
          unit: z.string().max(128),
          points: z
            .array(z.strictObject({ id, at: datetime, value: decimal.nullable(), evidenceIds }))
            .max(500),
        }),
      )
      .max(100)
      .optional(),
    matrix: z
      .strictObject({
        rows: z.array(z.strictObject({ id, label })).max(500),
        columns: z.array(z.strictObject({ id, label })).max(100),
        cells: z
          .array(
            z.strictObject({ rowId: id, columnId: id, value: decimal.nullable(), evidenceIds }),
          )
          .max(500),
      })
      .optional(),
    recipe: readRecipeSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const keys = new Set<string>();
    for (const col of value.columns) {
      if (keys.has(col.key))
        ctx.addIssue({ code: 'custom', message: 'Column keys must be unique' });
      keys.add(col.key);
    }
    for (const [index, entry] of value.rows.entries()) {
      if (entry.evidenceIds !== undefined && !evidenceIds.safeParse(entry.evidenceIds).success) {
        ctx.addIssue({
          code: 'custom',
          path: ['rows', index, 'evidenceIds'],
          message: 'Row evidenceIds must be an array of IDs',
        });
      }
      for (const col of value.columns) {
        const cell = entry[col.key];
        if (cell === undefined || cell === null) continue;
        const schema = {
          string: z.string(),
          decimal,
          integer: z.number().int(),
          boolean: z.boolean(),
          timestamp: datetime,
        }[col.valueType];
        if (!schema.safeParse(cell).success)
          ctx.addIssue({
            code: 'custom',
            path: ['rows', index, col.key],
            message: `Expected ${col.valueType} cell`,
          });
      }
    }
    if (value.matrix) {
      const rows = new Set(value.matrix.rows.map((entry) => entry.id));
      const columns = new Set(value.matrix.columns.map((entry) => entry.id));
      for (const cell of value.matrix.cells) {
        if (!rows.has(cell.rowId) || !columns.has(cell.columnId))
          ctx.addIssue({
            code: 'custom',
            message: 'Matrix cell references an unknown row or column',
          });
      }
    }
  });
export type ApplicationPanel = z.infer<typeof panelSchema>;

export const applicationResultSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id,
    runId: id,
    conversationId: id.optional(),
    kind: z.enum(['chat', 'read', 'saved-view']),
    text: z.string().max(100_000),
    panels: z.array(panelSchema).max(8),
    evidence: z.array(appEvidenceSchema).max(20_000),
    entityRefs: z.array(z.strictObject({ type: z.literal('asset'), id: recordId })).max(20_000),
    asOf: datetime,
    evaluatedAt: datetime,
    basisRevision: z.string().min(1).max(512),
    warnings,
    agentExecutionId: id.optional(),
    questionCoverage: z
      .strictObject({
        status: z.enum(['complete', 'partial', 'unavailable']),
        method: z.literal('declared-parts-and-result-references'),
        parts: z
          .array(
            z.strictObject({
              id,
              question: label,
              status: z.enum(['answered', 'unanswered']),
              resultIds: z.array(id).max(8),
              sourceIds: z.array(recordId).max(100),
            }),
          )
          .max(8),
      })
      .optional(),
    resolvedScope: z
      .strictObject({
        scope: z.enum(['asset', 'area', 'fleet', 'unresolved']),
        assetIds: z.array(recordId).max(200),
        area: label.optional(),
        metric: label.optional(),
        window: z.strictObject({ from: date, through: date }).optional(),
      })
      .optional(),
    answerSupport: z
      .strictObject({
        mode: z.enum([
          'deterministic-facts',
          'quoted-evidence',
          'grounded-synthesis',
          'unverified',
          'unavailable',
        ]),
        explanationStatus: z.enum(['available', 'unavailable', 'not-assessed']),
        warnings,
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    const available = new Set<string>();
    for (const evidence of value.evidence) {
      if (available.has(evidence.id))
        ctx.addIssue({ code: 'custom', message: `Duplicate evidence ID: ${evidence.id}` });
      available.add(evidence.id);
    }
    for (const [index, panel] of value.panels.entries()) {
      const references = [
        ...panel.evidenceIds,
        ...(panel.corrections?.flatMap((correction) => correction.evidenceIds) ?? []),
        ...panel.rows.flatMap((entry) =>
          Array.isArray(entry.evidenceIds) ? entry.evidenceIds : [],
        ),
        ...(panel.geo?.features.flatMap((entry) => entry.properties.evidenceIds) ?? []),
        ...(panel.series?.flatMap((series) =>
          series.points.flatMap((entry) => entry.evidenceIds),
        ) ?? []),
        ...(panel.matrix?.cells.flatMap((entry) => entry.evidenceIds) ?? []),
      ];
      for (const reference of new Set(references)) {
        if (!available.has(reference))
          ctx.addIssue({
            code: 'custom',
            path: ['panels', index],
            message: `Unresolved evidence ID: ${reference}`,
          });
      }
    }
  });
export type ApplicationResult = z.infer<typeof applicationResultSchema>;

export const savedViewDefinitionSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(256),
    description: z.string().max(4_000).default(''),
    panels: z
      .array(z.strictObject({ id, title: label, recipe: readRecipeSchema }))
      .min(1)
      .max(8),
  })
  .refine((value) => new Set(value.panels.map((panel) => panel.id)).size === value.panels.length, {
    message: 'Panel IDs must be unique',
  });
export type SavedViewDefinition = z.infer<typeof savedViewDefinitionSchema>;
export const applicationChatRequestSchema = z.strictObject({
  conversationId: id,
  requestId: z.string().trim().min(1).max(128),
  message: z.strictObject({ id: id.optional(), text: z.string().trim().min(1).max(8_000) }),
});
export type ApplicationMessage = UIMessage<
  { runId: string; resultId?: string },
  {
    visual: { kind: 'application-result'; schemaVersion: 1; result: ApplicationResult };
    citations: { runId: string; resultId: string; evidence: AppEvidence[] };
    progress: {
      runId: string;
      operationId: string;
      label: string;
      state: 'running' | 'completed' | 'failed';
    };
  }
>;
