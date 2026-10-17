import { z } from 'zod';

export const sourceSchema = z.object({
  id: z.string().min(1).max(512),
  label: z.string().min(1).max(512),
  path: z.string().min(1).max(512),
  sourceId: z.string().min(1).max(512),
  locator: z.union([
    z.object({ line: z.number().int().positive() }),
    z.object({ startLine: z.number().int().positive(), endLine: z.number().int().positive() }),
  ]),
});
