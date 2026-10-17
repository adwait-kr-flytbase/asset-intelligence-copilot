import { type LanguageModel, stepCountIs, ToolLoopAgent, type ToolSet } from 'ai';

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
    tools: config.tools,
    stopWhen: stepCountIs(config.maxSteps),
    maxOutputTokens: config.maxOutputTokens,
    maxRetries: 0,
    toolCallConcurrency: 2,
    // Reserve the final step for synthesis rather than ending on another tool request.
    prepareStep: ({ stepNumber }) =>
      stepNumber >= config.maxSteps - 1 ? { toolChoice: 'none' } : {},
  });
}
