import type { AppEvidence, ApplicationPanel, ApplicationResult, ReadRecipe } from '@repo/contracts';
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
  questionCoverage?: ApplicationResult['questionCoverage'];
  resolvedScope?: ApplicationResult['resolvedScope'];
  answerSupport?: {
    mode:
      | 'deterministic-facts'
      | 'quoted-evidence'
      | 'grounded-synthesis'
      | 'unverified'
      | 'unavailable';
    explanationStatus: 'available' | 'unavailable' | 'not-assessed';
    warnings: string[];
  };
};
export type AgentOutput = ApplicationReadOutput & { text: string; agentExecutionId?: string };
export type AgentRunner = (
  input: {
    runId: string;
    conversationId?: string;
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
