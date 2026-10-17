import { z } from 'zod';
import {
  responseSchema,
  savedViewSchema,
  type AgentResponse,
  type ReadParameters,
} from './contracts';
export const entrySchema = z
  .object({
    id: z.string(),
    requestId: z.string(),
    role: z.enum(['user', 'assistant']),
    text: z.string(),
    status: z.enum(['ready', 'pending', 'failed', 'stopped']),
    response: responseSchema.optional(),
  })
  .strict();
export type Entry = z.infer<typeof entrySchema>;
export const threadSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    updatedAt: z.string(),
    sample: z.boolean(),
    entries: z.array(entrySchema),
  })
  .strict();
export type Thread = z.infer<typeof threadSchema>;
export const storeSchema = z
  .object({
    version: z.literal(1),
    activeId: z.string(),
    threads: z.array(threadSchema),
    views: z.array(savedViewSchema),
  })
  .strict();
export type Store = z.infer<typeof storeSchema>;
export type Request = {
  id: string;
  threadId: string;
  question: string;
  parameters: ReadParameters;
  kind: 'agent' | 'saved';
  fromFocus?: boolean;
};
export const storageKey = 'fieldwork-next-v1';
export function loadStore(): { store: Store; blocked: boolean; sample: boolean } {
  const fresh = (): Store => {
    const id = crypto.randomUUID();
    return {
      version: 1,
      activeId: id,
      threads: [
        {
          id,
          title: 'Field overview',
          updatedAt: new Date().toISOString(),
          sample: true,
          entries: [],
        },
      ],
      views: [],
    };
  };
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { store: fresh(), blocked: false, sample: true };
    const parsed = storeSchema.parse(JSON.parse(raw));
    if (
      !parsed.threads.some((t) => t.id === parsed.activeId) ||
      new Set(parsed.threads.map((t) => t.id)).size !== parsed.threads.length ||
      new Set(parsed.views.map((v) => v.id)).size !== parsed.views.length ||
      new Set(parsed.views.map((v) => v.name.toLowerCase())).size !== parsed.views.length
    )
      throw Error('Invalid storage identity');
    for (const thread of parsed.threads)
      for (const entry of thread.entries) {
        if (
          entry.response &&
          (entry.role !== 'assistant' ||
            entry.status !== 'ready' ||
            entry.response.requestId !== entry.requestId ||
            entry.response.visuals.some((v) => v.runId !== entry.requestId) ||
            (entry.response.citations && entry.response.citations.runId !== entry.requestId))
        )
          throw Error('Invalid result identity');
        if (entry.status === 'pending') {
          entry.status = 'stopped';
          entry.text = 'This investigation was interrupted. Ask again to read the records.';
        }
      }
    return { store: parsed, blocked: false, sample: false };
  } catch {
    return { store: fresh(), blocked: true, sample: false };
  }
}
export function checkedResponse(raw: unknown, id: string): AgentResponse {
  const response = responseSchema.parse(raw);
  if (
    response.requestId !== id ||
    response.visuals.some((v) => v.runId !== id) ||
    (response.citations && response.citations.runId !== id)
  )
    throw Error('Response does not belong to this investigation');
  return response;
}
