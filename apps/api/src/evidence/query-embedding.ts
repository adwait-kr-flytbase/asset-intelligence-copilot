/** Optional provider adapter; enabled explicitly, never reads another app's env. */
export type QueryEmbedder = {
  model: string;
  dimensions: number;
  embed(text: string, signal?: AbortSignal): Promise<number[]>;
};
export function createQueryEmbedder(
  env: Record<string, string | undefined>,
): QueryEmbedder | undefined {
  const model = env.OPENROUTER_EMBEDDING_MODEL?.trim(),
    apiKey = env.OPENROUTER_API_KEY;
  if (!model || !apiKey) return;
  const dimensions = Number(env.OPENROUTER_EMBEDDING_DIMENSIONS ?? '1536');
  if (dimensions !== 1536)
    throw new Error('Query dimensions must match the stored embedding profile.');
  return {
    model,
    dimensions,
    async embed(text, signal) {
      const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        signal: AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])]),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, dimensions, input: text.slice(0, 2000) }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Query embedding request failed (HTTP ${response.status}).`);
      }
      const value = (await response.json()) as {
        model?: string;
        data?: { embedding?: number[] }[];
      };
      if (value.model !== model && value.model !== model.split('/').slice(1).join('/'))
        throw new Error('Query embedding model identity mismatch.');
      const vector = value.data?.[0]?.embedding;
      if (!vector || vector.length !== dimensions || vector.some((n) => !Number.isFinite(n)))
        throw new Error('Invalid query embedding.');
      return vector;
    },
  };
}
