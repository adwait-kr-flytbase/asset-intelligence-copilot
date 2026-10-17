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

// Prefer literal names before optional conversational wording, independently of storage order.
export function resolveSavedInvocation(text: string, definitions: SavedView[]) {
  const command = text.trim().match(/^(?:use|run|open)\s+(.+)$/i);
  if (!command) return null;
  function findName(input: string) {
    const literal = definitions.find(
      (definition) => definition.name.toLowerCase() === input.toLowerCase(),
    );
    if (literal) return literal;
    const quoted = input.match(/^(?:"(.*)"|'(.*)')$/);
    return quoted
      ? definitions.find(
          (definition) => definition.name.toLowerCase() === (quoted[1] ?? quoted[2]).toLowerCase(),
        )
      : undefined;
  }
  function resolve(input: string) {
    // A name can itself contain "my", punctuation or a well suffix.
    const exact = findName(input);
    if (exact) return { definition: exact, parameters: { ...exact.defaults } };
    const override = input.match(/^(.*?)\s+for\s+(LAB-W0[1-6])$/i);
    const definition = override && findName(override[1]);
    return definition && override
      ? {
          definition,
          parameters: {
            ...definition.defaults,
            wellId: override[2].toUpperCase() as SavedView['defaults']['wellId'],
          },
        }
      : null;
  }
  const input = command[1],
    unpunctuated = input.replace(/[.!?]+$/, '');
  return (
    resolve(input) ||
    resolve(input.replace(/^my\s+/i, '')) ||
    (unpunctuated !== input
      ? resolve(unpunctuated) || resolve(unpunctuated.replace(/^my\s+/i, ''))
      : null)
  );
}
