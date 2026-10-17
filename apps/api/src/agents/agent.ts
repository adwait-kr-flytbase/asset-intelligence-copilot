import { type LanguageModel, stepCountIs, ToolLoopAgent, type ToolSet } from 'ai';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
function modelProjection(value: unknown): Json {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  )
    return value;
  if (Array.isArray(value)) return value.map(modelProjection);
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    // Keep citation IDs for reasoning; hashes/locators stay in full UI/eval tool outputs.
    if (
      typeof row.id === 'string' &&
      typeof row.sourceId === 'string' &&
      typeof row.path === 'string'
    )
      return { id: row.id, label: String(row.label ?? row.id) };
    return Object.fromEntries(
      Object.entries(row)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, modelProjection(item)]),
    );
  }
  return null;
}

/** Native SDK loop; request state and scoped adapters stay outside the model prompt. */
export function createOperatorAgent(config: {
  role: string;
  model: LanguageModel;
  instructions: string;
  tools: ToolSet;
  maxSteps: number;
  maxOutputTokens: number;
}) {
  return new ToolLoopAgent({
    id: config.role,
    model: config.model,
    instructions: config.instructions,
    tools: Object.fromEntries(
      Object.entries(config.tools).map(([name, definition]) => [
        name,
        {
          ...definition,
          toModelOutput:
            definition.toModelOutput ??
            (({ output }: { output: unknown }) => ({
              type: 'json' as const,
              value: modelProjection(output),
            })),
        },
      ]),
    ),
    stopWhen: stepCountIs(config.maxSteps),
    maxOutputTokens: config.maxOutputTokens,
    maxRetries: 0,
    toolCallConcurrency: 2,
    // Reserve the final step for synthesis rather than ending on another tool request.
    prepareStep: ({ stepNumber }) =>
      stepNumber >= config.maxSteps - 1 ? { toolChoice: 'none' } : {},
  });
}
