import type { LanguageModel } from 'ai';
import { z } from 'zod';

type Model = Extract<LanguageModel, { specificationVersion: 'v3' }>;
type Call = Parameters<Model['doGenerate']>[0];
export type ProviderObservation = {
  modelId: string;
  provider?: string;
  finishReason: string | null;
  textCharacters: number;
  toolCalls: number;
  calls: { name: string; arguments: string }[];
  reasoningCharacters: number;
  costUsd?: number;
};
const responseSchema = z.object({
  provider: z.string().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable(),
        message: z.object({
          content: z.string().nullable().optional(),
          reasoning: z.string().nullable().optional(),
          tool_calls: z
            .array(
              z.object({
                id: z.string().min(1),
                type: z.literal('function'),
                function: z.object({ name: z.string().min(1), arguments: z.string() }),
              }),
            )
            .optional(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      cost: z.number().optional(),
    })
    .optional(),
});

function promptMessages(prompt: Call['prompt']) {
  return prompt.flatMap((message): Record<string, unknown>[] => {
    if (message.role === 'system') return [{ role: 'system', content: message.content }];
    if (message.role === 'tool')
      return message.content.map((part) => {
        if (part.type !== 'tool-result') throw new Error('Unsupported provider message.');
        if (!['text', 'json', 'error-text', 'error-json'].includes(part.output.type))
          throw new Error('Unsupported provider tool result.');
        return {
          role: 'tool',
          tool_call_id: part.toolCallId,
          content:
            'value' in part.output && typeof part.output.value === 'string'
              ? part.output.value
              : JSON.stringify('value' in part.output ? part.output.value : null),
        };
      });
    const content: string[] = [];
    const calls: Record<string, unknown>[] = [];
    for (const part of message.content) {
      if (part.type === 'text') content.push(part.text);
      else if (part.type === 'tool-call')
        calls.push({
          id: part.toolCallId,
          type: 'function',
          function: { name: part.toolName, arguments: JSON.stringify(part.input) },
        });
      else throw new Error('Only text and application tool calls are supported by this adapter.');
    }
    return [
      {
        role: message.role,
        content: content.join('\n') || null,
        ...(calls.length ? { tool_calls: calls } : {}),
      },
    ];
  });
}

/** Narrow text/function-call adapter, using the pinned SDK's supported v3 interface.
 * No streaming provider, reasoning, files, structured outputs or remote tools.
 * Replace with the maintained provider when dependency coordination is authorized.
 */
export function createOpenRouterModel(config: {
  apiKey: string;
  modelId: string;
  fetch?: typeof fetch;
  onResponse?: (observation: ProviderObservation) => void;
  /** Optional reproducible hosting route, independent of model identity. */
  provider?: string;
}): Model {
  if (!config.apiKey.trim() || !config.modelId.trim())
    throw new Error('OpenRouter key and model are required.');
  return {
    specificationVersion: 'v3',
    provider: 'openrouter-text-tools',
    modelId: config.modelId,
    supportedUrls: {},
    async doGenerate(options) {
      if (options.responseFormat?.type === 'json')
        throw new Error('Structured model output is not supported.');
      const tools = options.tools?.map((entry) => {
        if (entry.type !== 'function')
          throw new Error('Provider-executed tools are not supported.');
        return {
          type: 'function',
          function: {
            name: entry.name,
            description: entry.description,
            parameters: entry.inputSchema,
          },
        };
      });
      const choice = options.toolChoice;
      const response = await (config.fetch ?? fetch)(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
          signal: options.abortSignal,
          body: JSON.stringify({
            model: config.modelId,
            provider: {
              require_parameters: false,
              ...(config.provider ? { only: [config.provider], allow_fallbacks: false } : {}),
            },
            messages: promptMessages(options.prompt),
            stream: false,
            // This text/tool adapter does not replay provider-specific reasoning state.
            reasoning: { enabled: false },
            max_tokens: options.maxOutputTokens ?? 1600,
            temperature: options.temperature,
            ...(tools?.length
              ? {
                  tools,
                  tool_choice:
                    choice?.type === 'tool'
                      ? { type: 'function', function: { name: choice.toolName } }
                      : (choice?.type ?? 'auto'),
                }
              : {}),
          }),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Model request failed (HTTP ${response.status}).`);
      }
      // Never retain raw provider responses/headers (may include sensitive metadata).
      const parsed = responseSchema.parse(await response.json());
      const first = parsed.choices[0];
      if (!first) throw new Error('Model response has no choice.');
      config.onResponse?.({
        modelId: config.modelId,
        provider: parsed.provider,
        finishReason: first.finish_reason,
        textCharacters: first.message.content?.length ?? 0,
        toolCalls: first.message.tool_calls?.length ?? 0,
        calls: (first.message.tool_calls ?? []).map((call) => ({
          name: call.function.name,
          arguments: call.function.arguments,
        })),
        reasoningCharacters: first.message.reasoning?.length ?? 0,
        costUsd: parsed.usage?.cost,
      });
      const content: Awaited<ReturnType<Model['doGenerate']>>['content'] = [];
      if (first.message.content) content.push({ type: 'text', text: first.message.content });
      for (const call of first.message.tool_calls ?? [])
        content.push({
          type: 'tool-call',
          toolCallId: call.id,
          toolName: call.function.name,
          input: call.function.arguments,
        });
      const raw = first.finish_reason ?? undefined;
      const unified =
        raw === 'stop'
          ? 'stop'
          : raw === 'tool_calls'
            ? 'tool-calls'
            : raw === 'length'
              ? 'length'
              : raw === 'content_filter'
                ? 'content-filter'
                : 'other';
      return {
        content,
        finishReason: { unified, raw },
        warnings: [],
        usage: {
          inputTokens: {
            total: parsed.usage?.prompt_tokens,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: parsed.usage?.completion_tokens,
            text: undefined,
            reasoning: undefined,
          },
        },
      };
    },
    async doStream() {
      throw new Error('Use generateText; provider streaming is not supported by this adapter.');
    },
  };
}
