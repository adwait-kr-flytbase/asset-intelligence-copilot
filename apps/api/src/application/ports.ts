import type { AppEvidence, ApplicationPanel, ReadRecipe } from '@repo/contracts';
export type ExecutionContext = {
  namespace: string;
  ownerId: string;
  asOf: string;
  signal: AbortSignal;
};
export type ApplicationReadOutput = {
  panels: ApplicationPanel[];
  evidence: AppEvidence[];
  entityRefs: { type: 'asset'; id: string }[];
  warnings: string[];
};
export type AgentOutput = ApplicationReadOutput & { text: string; agentExecutionId?: string };
export type AgentRunner = (
  input: {
    runId: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
    context: ExecutionContext;
  },
  onProgress: (progress: {
    operationId: string;
    label: string;
    state: 'running' | 'completed' | 'failed';
  }) => void,
) => Promise<AgentOutput>;
export type ReadExecutor = (
  panels: { id: string; title: string; recipe: ReadRecipe }[],
  context: ExecutionContext,
) => Promise<ApplicationReadOutput>;
