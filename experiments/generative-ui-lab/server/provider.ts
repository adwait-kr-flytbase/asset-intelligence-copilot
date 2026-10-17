import { type Plan, planSchema } from '../src/protocol.ts';
export interface ProviderConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
}
export function providerFromEnv(): ProviderConfig | undefined {
  const { LAB_MODEL_BASE_URL: baseUrl, LAB_MODEL: model, LAB_MODEL_API_KEY: apiKey } = process.env;
  if (!baseUrl || !model) return undefined;
  const url = new URL(baseUrl);
  if (url.username || url.password || url.search || url.hash)
    throw Error('Model base URL must not include credentials, query or fragment');
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
  )
    throw Error('Use HTTPS for remote models or HTTP on localhost');
  return { baseUrl, model, apiKey };
}
export async function generatePlan(
  config: ProviderConfig,
  prompt: string,
  signal: AbortSignal,
): Promise<Plan> {
  const timeout = AbortSignal.timeout(25_000);
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.any([signal, timeout]),
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      stream: false,
      response_format: { type: 'json_object' },
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content:
            'You choose a presentation for a SYNTHETIC operational-data lab. Return ONLY JSON with exactly query and views. query must be attention, downtime, or spills. views must be a nonempty array of unique names from status, table, line, bar, map, heatmap, conflicts (max 7). attention examines current production and contradictions; downtime examines inspection-derived downtime and temperature trends; spills examines spill locations/distribution and conflicts. All queries contain six synthetic wells in North ridge and South basin and the same four-week inspection window. Honor explicit visual requests. Choose complementary views appropriate to the question. Do not return numbers, sources, HTML, code, additional keys or prose. Example: {"query":"attention","views":["status","table","map","conflicts"]}.',
        },
        { role: 'user', content: prompt.slice(0, 5000) },
      ],
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw Error(
      `Live provider request failed (HTTP ${response.status}). Check lab server configuration.`,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error('Live provider returned an empty response');
  let text = '',
    bytes = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 64 * 1024) throw Error('Live provider response exceeded 64 KiB');
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw Error('Live provider returned invalid JSON');
  }
  const content = (json as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
    ?.message?.content;
  if (typeof content !== 'string') throw Error('Live provider returned no presentation');
  try {
    return planSchema.parse(JSON.parse(content));
  } catch {
    throw Error(
      'Live provider returned an unsupported presentation. Previous investigation retained.',
    );
  }
}
