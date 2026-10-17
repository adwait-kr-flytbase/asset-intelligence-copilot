import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseAnalysis } from '../evidence/result-schema.js';
import { sourceSchema } from '../evidence/source-schema.js';
import type { Source } from '../evidence/types.js';

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, item]) => item !== undefined && key !== 'readProvenance')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
};
export const digest = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)) ?? 'undefined')
    .digest('hex');
export function collectSources(value: unknown, into = new Map<string, Source>()): Source[] {
  if (!value || typeof value !== 'object') return [...into.values()];
  const parsed = sourceSchema.safeParse(value);
  if (parsed.success)
    into.set(
      JSON.stringify([parsed.data.id, parsed.data.sourceId, parsed.data.locator]),
      parsed.data,
    );
  else for (const item of Object.values(value)) collectSources(item, into);
  return [...into.values()];
}
const overview = z.object({
  status: z.literal('found'),
  asset: z.object({ id: z.string() }),
  sources: z.array(sourceSchema),
  production: z
    .object({
      producing: z.boolean(),
      deltaC: z.string().regex(/^-?\d+(?:\.\d+)?$/),
      thresholdC: z.string().regex(/^\d+(?:\.\d+)?$/),
    })
    .nullable(),
});
export function validateDomainResult(operation: string, parameters: unknown, output: unknown) {
  const p = parameters as Record<string, unknown>,
    o = output as Record<string, unknown>;
  if (operation.startsWith('analyze')) {
    const { from, through, ...rest } = p;
    parseAnalysis(
      {
        ...rest,
        window:
          typeof from === 'string' && typeof through === 'string' ? { from, through } : undefined,
      } as Parameters<typeof parseAnalysis>[0],
      output,
    );
  } else if (operation === 'getOperationalContext' && o.status === 'found') {
    const parsed = overview.parse(output);
    if (parsed.asset.id !== p.assetId) throw new Error('Result asset does not match execution.');
  }
}
export function resultIntegrity(operation: string, parameters: unknown, output: unknown) {
  validateDomainResult(operation, parameters, output);
  const sources = collectSources(output);
  const o = output as { readProvenance?: { isolation?: string } };
  return {
    contentHash: digest({ operation, parameters, output }),
    sourceManifestHash: digest(sources),
    calculationVersion: 'domain-v2',
    consistency:
      o.readProvenance?.isolation === 'repeatable-read'
        ? ('single-domain-operation' as const)
        : ('adapter-defined' as const),
  };
}
