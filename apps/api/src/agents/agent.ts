import { type LanguageModel, stepCountIs, ToolLoopAgent, type ToolSet } from 'ai';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export function modelProjection(value: unknown): Json {
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
    // Full analytics rows and source manifests stay in the immutable tool/UI result.
    // The model selects supported facts and can page further facts with inspectResult.
    if (typeof row.resultRef === 'string' && Array.isArray(row.supportedFacts))
      return Object.fromEntries(
        Object.entries({
          resultRef: row.resultRef,
          metric: row.metric,
          topic: row.topic,
          title: row.title,
          coverage: row.coverage,
          executedParameters: row.executedParameters,
          warnings: row.warnings,
          supportedFacts: row.supportedFacts,
          factCount: row.factCount,
          columns: row.columns,
          summary: row.summary,
          governingEvidence: row.governingEvidence,
          rows:
            typeof row.topic === 'string' && Array.isArray(row.rows)
              ? row.rows.slice(0, 60).map((entry) =>
                  entry && typeof entry === 'object'
                    ? Object.fromEntries(
                        Object.entries(entry)
                          .filter(([key]) => key !== '_sourceIds')
                          .map(([key, value]) => [
                            key,
                            typeof value === 'string' && value.length > 500
                              ? `${value.slice(0, 500)} [preview abbreviated]`
                              : value,
                          ]),
                      )
                    : entry,
                )
              : undefined,
          modelRowsShown:
            typeof row.topic === 'string' && Array.isArray(row.rows)
              ? Math.min(60, row.rows.length)
              : undefined,
          inspectionHint:
            'Complete rows are retained for the UI. Use inspectResult with this resultRef to page additional supported facts.',
        })
          .filter(([, item]) => item !== undefined)
          .map(([key, item]) => [key, modelProjection(item)]),
      );
    // Keep citation IDs for reasoning; hashes/locators stay in full UI/eval tool outputs.
    if (typeof row.text === 'string' && Array.isArray(row.sourceIds) && row.sourceIds.length > 8)
      return Object.fromEntries(
        Object.entries({
          ...row,
          sourceIds: row.sourceIds.slice(0, 8),
          sourceCount: row.sourceIds.length,
        }).map(([key, item]) => [key, modelProjection(item)]),
      );
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
  requireInitialTool?: boolean;
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
    stopWhen: [
      stepCountIs(config.maxSteps),
      ({ steps }) =>
        steps
          .at(-1)
          ?.toolResults.some(
            (result) =>
              result.toolName === 'publishAnswer' &&
              (result.output as { status?: string })?.status &&
              ['published', 'revision-limit'].includes(
                (result.output as { status: string }).status,
              ),
          ) ?? false,
    ],
    maxOutputTokens: config.maxOutputTokens,
    maxRetries: 0,
    toolCallConcurrency: 2,
    // Reserve the final step for synthesis rather than ending on another tool request.
    prepareStep: ({ stepNumber }) =>
      stepNumber >= config.maxSteps - 1
        ? config.tools.publishAnswer
          ? {
              toolChoice: { type: 'tool', toolName: 'publishAnswer' },
              activeTools: ['publishAnswer'],
            }
          : { toolChoice: 'none' }
        : stepNumber === 0 && config.tools.validateQuestion
          ? {
              toolChoice: { type: 'tool', toolName: 'validateQuestion' },
              activeTools: ['validateQuestion'],
            }
          : config.tools.publishAnswer
            ? { toolChoice: 'required' }
            : stepNumber === 0 && config.requireInitialTool
              ? { toolChoice: 'required' }
              : {},
  });
}
