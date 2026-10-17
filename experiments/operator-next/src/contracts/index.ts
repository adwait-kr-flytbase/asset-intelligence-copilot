import { z } from 'zod';
import type { UIMessage } from 'ai';
import { artifactDateSchema } from './artifact';
import { operationalVisualSchema, citationsSchema } from './visual';
export * from './artifact';
export * from './visual';
export const kinds = [
  'geo',
  'series',
  'ranking',
  'matrix',
  'obligations',
  'timeline',
  'claims',
  'correction',
] as const;
export const kindSchema = z.enum(kinds);
export const parametersSchema = z
  .object({
    wellId: z.string().min(1).max(100).default('all'),
    wellIds: z.array(z.string().min(1).max(100)).min(1).max(500).optional(),
    dataset: z.enum(['fixture', 'sample']).optional(),
    area: z.string().min(1).max(100).optional(),
    status: z.enum(['all', 'below-threshold']).optional(),
    spillOnly: z.boolean().optional(),
    obligation: z.enum(['containment', 'all']).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    metric: z.enum(['repair-cost', 'downtime', 'spill-volume']).optional(),
    from: artifactDateSchema.optional(),
    to: artifactDateSchema.optional(),
  })
  .strict()
  .refine(
    (p) => (!p.from && !p.to) || (!!p.from && !!p.to && p.from <= p.to),
    'Provide an ordered date range',
  );
export type ReadParameters = z.infer<typeof parametersSchema>;
export const savedViewSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.literal(1),
    name: z.string().trim().min(1).max(80),
    kind: kindSchema,
    presentation: z.enum(['auto', 'table', 'card']).optional(),
    parameters: parametersSchema,
    createdAt: z.string().datetime(),
  })
  .strict();
export type SavedView = z.infer<typeof savedViewSchema>;
export const responseSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: z.string().min(1),
    answer: z.string(),
    visuals: z.array(operationalVisualSchema).max(8),
    citations: citationsSchema.optional(),
    intent: kindSchema.nullable(),
    mode: z.enum(['fixture', 'sample']),
    presentation: z.enum(['auto', 'table', 'card']).optional(),
    parameters: parametersSchema,
    savedView: z
      .object({ id: z.string().uuid(), revision: z.literal(1), name: z.string() })
      .strict()
      .optional(),
  })
  .strict();
export type AgentResponse = z.infer<typeof responseSchema>;
export type AgentMessage = UIMessage<
  never,
  { result: AgentResponse; progress: { requestId: string; label: string } }
>;
export const assetSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    area: z.string(),
    type: z.string(),
    status: z.enum(['producing', 'below-threshold']),
    spillBbl: z.number(),
    lat: z.number().nullable(),
    lon: z.number().nullable(),
  })
  .strict();
export type Asset = z.infer<typeof assetSchema>;
export const assetsSchema = z.array(assetSchema);
