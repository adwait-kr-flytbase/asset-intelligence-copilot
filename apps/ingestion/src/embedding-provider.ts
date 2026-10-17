import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import type { embeddingProfile } from './embedding-profile.js';

type Profile = ReturnType<typeof embeddingProfile>;
/** Provider diagnostics deliberately exclude response bodies, headers and raw errors. */
export function createEmbedder(
  apiKey: string,
  profile: Profile,
  dependencies: { fetch?: typeof fetch; sleep?: (milliseconds: number) => Promise<void> } = {},
) {
  if (!apiKey.trim()) throw new Error('OPENROUTER_API_KEY is required for indexing.');
  const request = dependencies.fetch ?? fetch;
  const pause = dependencies.sleep ?? sleep;
  return async (texts: string[]): Promise<number[][]> => {
    if (
      texts.length < 1 ||
      texts.length > 16 ||
      texts.some((text) => !text.length || text.length > 2000)
    )
      throw new Error('Embedding batches require 1–16 nonempty chunks of at most 2000 code units.');
    for (let attempt = 0; attempt < 3; attempt++) {
      let response: Response;
      try {
        response = await request('https://openrouter.ai/api/v1/embeddings', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: profile.model,
            dimensions: profile.dimensions,
            encoding_format: 'float',
            input: texts,
          }),
          signal: AbortSignal.timeout(45_000),
        });
      } catch {
        if (attempt === 2) throw new Error('Embedding request failed after 3 network attempts.');
        await pause(1000 * 2 ** attempt);
        continue;
      }
      if (!response.ok) {
        const retry = response.status === 429 || response.status >= 500;
        const retryAfter = Number(response.headers.get('retry-after'));
        await response.body?.cancel();
        if (!retry || attempt === 2)
          throw new Error(`Embedding request failed (HTTP ${response.status}).`);
        await pause(
          Math.min(
            10_000,
            Math.max(1000 * 2 ** attempt, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0),
          ),
        );
        continue;
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error('Embedding provider returned invalid JSON.');
      }
      const parsed = z
        .object({
          model: z.string(),
          data: z.array(z.object({ index: z.number().int(), embedding: z.array(z.number()) })),
        })
        .safeParse(payload);
      if (!parsed.success) throw new Error('Embedding response has an invalid shape.');
      const body = parsed.data;
      if (
        ![profile.model, 'text-embedding-3-small'].includes(String(body?.model)) ||
        !Array.isArray(body?.data) ||
        body.data.length !== texts.length
      )
        throw new Error('Embedding response model or batch count mismatch.');
      const vectors: number[][] = new Array(texts.length);
      for (const item of body.data) {
        if (
          !item ||
          !Number.isInteger(item.index) ||
          item.index < 0 ||
          item.index >= texts.length ||
          vectors[item.index] ||
          !Array.isArray(item.embedding) ||
          item.embedding.length !== profile.dimensions ||
          !item.embedding.every((value) => typeof value === 'number' && Number.isFinite(value)) ||
          !item.embedding.some((value) => value !== 0)
        )
          throw new Error('Embedding response contains invalid indices or vectors.');
        vectors[item.index] = item.embedding;
      }
      return vectors;
    }
    throw new Error('Embedding attempts exhausted.');
  };
}
