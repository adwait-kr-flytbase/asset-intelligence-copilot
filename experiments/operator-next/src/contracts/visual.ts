import { z } from 'zod';
import { artifactDateSchema, artifactSchema } from './artifact';

// Proposed adapter boundary for backend handoff. No active API implements this envelope.
// Browser-safe schemas validate declarative, read-only data; they never execute a payload.
const id = z.string().min(1).max(100);
const text = z.string().min(1).max(1000);
const references = z
  .array(id)
  .max(1000)
  .refine((ids) => new Set(ids).size === ids.length, 'Duplicate evidence reference');
const instant = z
  .string()
  .datetime({ offset: true })
  .refine(
    (value) =>
      artifactDateSchema.safeParse(value.slice(0, 10)).success &&
      Number.isFinite(Date.parse(value)),
    'Expected a valid ISO calendar datetime',
  );

export const evidenceSchema = z
  .object({
    id,
    label: text,
    path: z.string().min(1).max(500),
    kind: z.enum([
      'inspection',
      'maintenance',
      'spill',
      'manual',
      'regulatory',
      'note',
      'correction',
      'calculation',
    ]),
    recordId: id,
    revision: id,
    excerpt: z.string().min(1).max(4000),
    observedAt: instant.optional(),
    locator: z
      .object({
        page: z.number().int().positive().max(100000).optional(),
        section: text.optional(),
        row: z.string().min(1).max(100).optional(),
      })
      .strict()
      .optional(),
    visibility: z.enum(['shared', 'private']),
    inputSourceIds: references.optional(),
    supersedes: references.optional(),
  })
  .strict();
export type Evidence = z.infer<typeof evidenceSchema>;
const evidence = z.array(evidenceSchema).min(1).max(1000);

function validateEvidence(records: Evidence[], context: z.RefinementCtx) {
  const ids = new Set(records.map((record) => record.id));
  if (ids.size !== records.length)
    context.addIssue({
      code: 'custom',
      message: 'Duplicate evidence identifier',
      path: ['evidence'],
    });
  for (const record of records)
    for (const sourceId of [...(record.inputSourceIds || []), ...(record.supersedes || [])]) {
      if (!ids.has(sourceId) || sourceId === record.id)
        context.addIssue({
          code: 'custom',
          message: 'Unknown or self-referencing evidence provenance',
          path: ['evidence'],
        });
    }
  return ids;
}

export const operationalVisualSchema = z
  .object({
    kind: z.literal('artifact'),
    schemaVersion: z.literal(1),
    runId: id,
    resultId: id,
    artifactRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    phase: z.literal('ready'),
    readOnly: z.literal(true),
    artifact: artifactSchema,
    meta: z
      .object({
        asOf: instant,
        evaluatedAt: instant,
        dataRevision: id,
        timeZone: z
          .string()
          .min(1)
          .max(1000)
          .refine((value) => {
            try {
              new Intl.DateTimeFormat('en', { timeZone: value });
              return true;
            } catch {
              return false;
            }
          }, 'Expected an IANA time zone'),
        completeness: z.enum(['complete', 'partial', 'unknown']),
        warnings: z.array(z.string().min(1).max(1000)).max(20),
      })
      .strict(),
    evidence,
  })
  .strict()
  .superRefine((payload, context) => {
    const ids = validateEvidence(payload.evidence, context);
    for (const sourceId of payload.artifact.sourceIds)
      if (!ids.has(sourceId))
        context.addIssue({
          code: 'custom',
          message: 'Unknown artifact evidence reference',
          path: ['artifact', 'sourceIds'],
        });
  });
export type OperationalVisual = z.infer<typeof operationalVisualSchema>;

// Optional answer-only format: applications can return citations without a visual artifact.
export const citationsSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: id,
    evidence,
    claims: z
      .array(
        z
          .object({
            id,
            text: z.string().min(1).max(4000),
            sourceIds: references.refine((ids) => ids.length > 0, 'Claims require evidence'),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((payload, context) => {
    const ids = validateEvidence(payload.evidence, context);
    if (new Set(payload.claims.map((claim) => claim.id)).size !== payload.claims.length)
      context.addIssue({ code: 'custom', message: 'Duplicate claim identifier', path: ['claims'] });
    for (const claim of payload.claims)
      for (const sourceId of claim.sourceIds)
        if (!ids.has(sourceId))
          context.addIssue({
            code: 'custom',
            message: 'Unknown claim evidence reference',
            path: ['claims'],
          });
  });
export type CitedAnswer = z.infer<typeof citationsSchema>;
