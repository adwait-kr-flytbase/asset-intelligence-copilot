import type { UIMessage } from 'ai';
import { z } from 'zod';

export const sourceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  path: z.string().min(1),
});

// Extend additively with new visual variants when their first consumer is built.
export const visualSchema = z.object({
  kind: z.literal('well-status'),
  assetId: z.string().min(1),
  producing: z.boolean(),
  temperatureDeltaC: z.number().finite(),
  observedAt: z.iso.datetime(),
  sources: z.array(sourceSchema).min(1),
});

export type Visual = z.infer<typeof visualSchema>;
export type CopilotMessage = UIMessage<never, { visual: Visual }>;

// The SDK validates message parts separately; scope and size are our responsibility.
export const chatRequestSchema = z.object({
  userId: z.string().trim().min(1).max(100),
  conversationId: z.string().trim().min(1).max(100),
  messages: z.array(z.unknown()).min(1).max(100),
});

export const healthSchema = z.object({
  status: z.literal('ok'),
  mode: z.literal('fixture'),
});
