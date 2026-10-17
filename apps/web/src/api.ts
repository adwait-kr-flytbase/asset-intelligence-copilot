import {
  applicationChatRequestSchema,
  applicationResultSchema,
  type ReadParameters,
  type ReadRecipe,
} from '@repo/contracts';
import { z } from 'zod';
import type { ChatRequest } from './types';
import {
  areaSchema,
  assetSchema,
  conversationSchema,
  conversationSummarySchema,
  executionSchema,
  pageSchema,
  personaSchema,
  runSchema,
  savedViewSchema,
  savedViewSummarySchema,
  sessionSchema,
} from './types';

export class ApiError extends Error {
  public status: number;
  public code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export async function applicationFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
}
async function json<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await applicationFetch(path, init);
  if (!response.ok) {
    let code = 'HTTP_ERROR';
    let message = `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      code = typeof body.error?.code === 'string' ? body.error.code : code;
      message = typeof body.error?.message === 'string' ? body.error.message : message;
    } catch {
      /* Error responses need not contain JSON. */
    }
    throw new ApiError(response.status, code, message);
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success)
    throw new ApiError(
      502,
      'INVALID_RESPONSE',
      'The server returned data that could not be verified.',
    );
  return parsed.data;
}
type ListOptions = { after?: string; limit?: number };
const query = (values: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined) search.set(key, String(value));
  return search.size ? `?${search}` : '';
};
const post = (body: unknown, signal?: AbortSignal): RequestInit => ({
  method: 'POST',
  body: JSON.stringify(body),
  signal,
});
export const api = {
  getSession: (signal?: AbortSignal) => json('/api/session', sessionSchema, { signal }),
  personas: (options: ListOptions = {}, signal?: AbortSignal) =>
    json('/api/personas' + query(options), pageSchema(personaSchema), { signal }),
  selectPersona: (id: string) =>
    json(
      '/api/session/persona',
      z.object({ persona: personaSchema, identityMode: z.literal('demo-persona') }),
      post({ personaId: id }),
    ),
  conversations: (options: ListOptions = {}, signal?: AbortSignal) =>
    json('/api/conversations' + query(options), pageSchema(conversationSummarySchema), { signal }),
  createConversation: (title: string) =>
    json('/api/conversations', conversationSummarySchema, post({ title })),
  conversation: (
    id: string,
    options: { before?: number; limit?: number } = {},
    signal?: AbortSignal,
  ) =>
    json(`/api/conversations/${encodeURIComponent(id)}` + query(options), conversationSchema, {
      signal,
    }),
  getResult: (id: string, signal?: AbortSignal) =>
    json(`/api/results/${encodeURIComponent(id)}`, applicationResultSchema, { signal }),
  assets: (options: ListOptions & { area?: string; search?: string } = {}, signal?: AbortSignal) =>
    json('/api/assets' + query(options), pageSchema(assetSchema), { signal }),
  areas: (options: ListOptions = {}, signal?: AbortSignal) =>
    json('/api/areas' + query(options), pageSchema(areaSchema), { signal }),
  savedViews: (options: ListOptions = {}, signal?: AbortSignal) =>
    json('/api/saved-views' + query(options), pageSchema(savedViewSummarySchema), { signal }),
  savedView: (id: string, signal?: AbortSignal) =>
    json(`/api/saved-views/${encodeURIComponent(id)}`, savedViewSchema, { signal }),
  compose: (
    body: {
      requestId: string;
      conversationId: string;
      components: { resultId: string; panelId: string }[];
    },
    signal?: AbortSignal,
  ) => json('/api/results/compose', executionSchema, post(body, signal)),
  saveView: (body: { sourceResultId: string; name: string; panelIds: string[] }) =>
    json('/api/saved-views', savedViewSchema, post(body)),
  runView: (
    id: string,
    body: { requestId: string; parameters?: Partial<ReadParameters>; panelIds?: string[] },
    signal?: AbortSignal,
  ) => json(`/api/saved-views/${encodeURIComponent(id)}/runs`, executionSchema, post(body, signal)),
  read: (
    body: { requestId: string; panels: { id: string; title: string; recipe: ReadRecipe }[] },
    signal?: AbortSignal,
  ) => json('/api/read-runs', executionSchema, post(body, signal)),
  cancelRun: (id: string) =>
    json(`/api/runs/${encodeURIComponent(id)}/cancel`, runSchema, post({})),
  run: (id: string, signal?: AbortSignal) =>
    json(`/api/runs/${encodeURIComponent(id)}`, runSchema, { signal }),
};

export function chatRequestBody(request: ChatRequest) {
  return applicationChatRequestSchema.parse({
    conversationId: request.conversationId,
    requestId: request.id,
    message: { text: request.question },
  });
}
