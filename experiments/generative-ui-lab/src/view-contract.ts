import { z } from 'zod';
import { operatorParametersSchema, planSchema } from './protocol';

export const savedViewSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.literal(1),
    name: z.string().trim().min(1).max(80),
    createdAt: z.string().datetime(),
    catalogVersion: z.literal(1),
    operation: z.literal('well-inspection-read-v1'),
    plan: planSchema,
    defaults: operatorParametersSchema,
  })
  .strict();
export type SavedView = z.infer<typeof savedViewSchema>;
export const savedRunRequestSchema = z
  .object({
    runId: z.string().uuid(),
    definition: savedViewSchema,
    parameters: operatorParametersSchema,
    fault: z.enum(['none', 'slow', 'error']).default('none'),
  })
  .strict();

// Only an explicit named invocation can bypass normal generation in this review app.
export function resolveSavedInvocation(text: string, definitions: SavedView[]) {
  const input = text.trim().replace(/[.!?]+$/, '');
  if (!/^(use|run|open)\s+/i.test(input)) return null;
  for (const definition of definitions) {
    const escaped = definition.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = input.match(
      new RegExp(
        `^(?:use|run|open)\\s+(?:my\\s+)?["']?${escaped}["']?(?:\\s+for\\s+(LAB-W0[1-6]))?$`,
        'i',
      ),
    );
    if (match)
      return {
        definition,
        parameters: {
          ...definition.defaults,
          ...(match[1]
            ? { wellId: match[1].toUpperCase() as SavedView['defaults']['wellId'] }
            : {}),
        },
      };
  }
  return null;
}
