import { createOpenRouterModel, type ProviderObservation } from './openrouter.js';

/** Development candidate; model quality is measured separately from configuration. */
export const defaultDevelopmentModel = 'anthropic/claude-haiku-5.5';

export type AgentModelIds = {
  coordinator: string;
  evidence: string;
  procedures: string;
  evaluator?: string;
};

export function resolveAgentModelIds(input: {
  model?: string;
  evidence?: string;
  procedures?: string;
  evaluator?: string;
}): AgentModelIds {
  const coordinator = input.model?.trim() || defaultDevelopmentModel;
  return {
    coordinator,
    evidence: input.evidence?.trim() || coordinator,
    procedures: input.procedures?.trim() || coordinator,
    evaluator: input.evaluator?.trim() || coordinator,
  };
}

export function agentModelIdsFromEnv(env: Record<string, string | undefined>): AgentModelIds {
  return resolveAgentModelIds({
    model: env.OPENROUTER_MODEL,
    evidence: env.OPENROUTER_EVIDENCE_MODEL,
    procedures: env.OPENROUTER_PROCEDURE_MODEL,
    evaluator: env.OPENROUTER_EVALUATOR_MODEL,
  });
}

/** Agent code consumes SDK LanguageModels; provider construction is isolated here. */
export function createAgentModels(
  apiKey: string,
  ids: AgentModelIds,
  options: { onResponse?: (observation: ProviderObservation) => void; provider?: string } = {},
) {
  const models = new Map<string, ReturnType<typeof createOpenRouterModel>>();
  const get = (modelId: string) => {
    let model = models.get(modelId);
    if (!model) {
      model = createOpenRouterModel({ apiKey, modelId, ...options });
      models.set(modelId, model);
    }
    return model;
  };
  return {
    model: get(ids.coordinator),
    evaluatorModel: get(ids.evaluator || ids.coordinator),
    specialistModels: { evidence: get(ids.evidence), procedures: get(ids.procedures) },
  };
}
