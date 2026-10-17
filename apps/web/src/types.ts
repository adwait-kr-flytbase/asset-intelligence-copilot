import {
  type ApplicationResult,
  applicationResultSchema,
  savedViewDefinitionSchema,
} from '@repo/contracts';
import { z } from 'zod';

export const personaSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  teamId: z.string(),
  team: z.string(),
});
export type Persona = z.infer<typeof personaSchema>;
const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
});
export const assetSchema = z.object({
  id: z.string(),
  name: z.string(),
  wellType: z.string(),
  areaId: z.string(),
  area: z.string(),
  geometry: pointSchema.nullable(),
});
export type Asset = z.infer<typeof assetSchema>;
export const areaSchema = z.object({
  id: z.string(),
  name: z.string(),
  teamId: z.string(),
  assetCount: z.number().int().nonnegative(),
  center: pointSchema.nullable(),
});
export type Area = z.infer<typeof areaSchema>;
export const conversationSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  revision: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
export const savedViewSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  revision: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedViewSummary = z.infer<typeof savedViewSummarySchema>;
export const savedViewSchema = savedViewSummarySchema.extend({
  definition: savedViewDefinitionSchema,
});
export type SavedView = z.infer<typeof savedViewSchema>;
export const sessionSchema = z.object({
  identityMode: z.literal('demo-persona'),
  namespace: z.string(),
  persona: personaSchema.nullable(),
  capabilities: z
    .object({
      chat: z.boolean(),
      savedViews: z.boolean(),
      sharedWrites: z.boolean(),
      panels: z.array(z.string()),
    })
    .passthrough(),
});
export type Session = z.infer<typeof sessionSchema>;
export type Page<T> = { items: T[]; nextCursor: string | null };
export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
export const storedMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  metadata: z.object({ runId: z.string().optional(), resultId: z.string().optional() }).nullish(),
  parts: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()),
});
export const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  messages: z.array(storedMessageSchema),
  nextCursor: z.number().int().nonnegative().nullable(),
});
export const runSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['chat', 'read', 'saved-view']),
    status: z.enum(['running', 'completed', 'failed', 'cancelled', 'interrupted']),
    resultId: z.string().nullable(),
    errorCode: z.string().nullable(),
    conversationId: z.string().nullable(),
  })
  .passthrough();
export const executionSchema = z.object({ run: runSchema, result: applicationResultSchema });
export type Entry = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  status: 'ready' | 'pending' | 'failed' | 'stopped';
  resultId?: string;
  result?: ApplicationResult;
};
export type ChatRequest = { id: string; conversationId: string; question: string; runId?: string };
export function messageEntry(message: z.infer<typeof storedMessageSchema>): Entry {
  return {
    id: message.id,
    role: message.role,
    text: message.parts
      .filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join('\n'),
    status: 'ready',
    ...(message.metadata?.resultId ? { resultId: message.metadata.resultId } : {}),
  };
}
