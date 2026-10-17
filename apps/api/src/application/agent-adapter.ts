import type { DatabaseConnection } from '@repo/db';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { runCoordinator } from '../agents/coordinator.js';
import type { AnalysisInput } from '../evidence/analytics.js';
import { createQueryEmbedder } from '../evidence/query-embedding.js';
import { createSnapshotServices } from '../evidence/snapshot.js';
import type { ApplicationData } from './data.js';
import type { AgentRunner, ApplicationReadOutput, ExecutionContext } from './ports.js';

const analysisInput = z
  .object({
    metric: z.enum([
      'current-status',
      'temperature-history',
      'downtime',
      'spills',
      'repair-costs',
      'repeat-repairs',
    ]),
    assetId: z.string().max(128).optional(),
    area: z.string().max(120).optional(),
    from: z.iso.date().optional(),
    through: z.iso.date().optional(),
    equipmentKind: z.string().max(80).optional(),
    onlyNonProducing: z.boolean().optional(),
    groupBy: z.enum(['asset', 'area-month']).optional(),
    limit: z.number().int().min(1).max(500),
  })
  .strict();
const analysisTools = new Set([
  'analyzeAssetOperations',
  'analyzeAreaOperations',
  'analyzeFleetOperations',
]);
const safeLabels: Record<string, string> = {
  getOperationalContext: 'Reading latest operational evidence',
  getApplicableProcedures: 'Reading applicable procedures',
  readRecord: 'Reading an original record',
  readEvidence: 'Reading retained document evidence',
  searchEvidence: 'Finding supporting documents',
  listAssets: 'Resolving assets',
  analyzeAssetOperations: 'Calculating asset metrics',
  analyzeAreaOperations: 'Calculating area metrics',
  analyzeFleetOperations: 'Calculating fleet metrics',
  getOperationalRecords: 'Reading operational records',
  investigateEvidence: 'Investigating supporting evidence',
  assessProcedures: 'Assessing procedures',
};

/** Owns no tools or application persistence; the coordinator remains the agent execution boundary. */
export function createApplicationAgent(
  connection: DatabaseConnection,
  data: ApplicationData,
  options: {
    model: () => LanguageModel;
    specialistModels?: () => { evidence?: LanguageModel; procedures?: LanguageModel };
  },
): AgentRunner {
  return async (input, onProgress) => {
    const { context } = input;
    context.signal.throwIfAborted();
    const running = new Map<string, string>();
    const result = await runCoordinator(input.messages, {
      model: options.model(),
      specialistModels: options.specialistModels?.(),
      signal: context.signal,
      ...createSnapshotServices(
        connection.pool,
        context.namespace,
        context.asOf,
        createQueryEmbedder(process.env),
      ),
      onEvent(event) {
        if (event.type === 'tool-start') {
          const label = safeLabels[event.toolName] ?? 'Reading evidence';
          running.set(event.toolCallId, label);
          onProgress({ operationId: event.toolCallId, label, state: 'running' });
        } else {
          const label = running.get(event.toolCallId);
          if (label)
            onProgress({
              operationId: event.toolCallId,
              label,
              state: event.type === 'tool-result' ? 'completed' : 'failed',
            });
          running.delete(event.toolCallId);
        }
      },
    });
    context.signal.throwIfAborted();
    return adaptCoordinatorResult(result, data, context, input.runId);
  };
}

export async function adaptCoordinatorResult(
  result: Awaited<ReturnType<typeof runCoordinator>>,
  data: ApplicationData,
  context: ExecutionContext,
  runId: string,
) {
  // Adapt accepted successful executions with their paired original input. Never requery domain metrics.
  const starts = new Map(
    result.trace.flatMap((event) =>
      event.type === 'tool-start' ? [[event.toolCallId, event] as const] : [],
    ),
  );
  const aggregate: ApplicationReadOutput = {
    panels: [],
    evidence: await data.hydrate(result.sources, context),
    entityRefs: [],
    warnings: [],
  };
  for (const event of result.trace) {
    if (
      event.type !== 'tool-result' ||
      !event.dataResult ||
      !result.selectedResultIds.includes(event.dataResult.id)
    )
      continue;
    const start = starts.get(event.toolCallId);
    if (
      !start ||
      (!analysisTools.has(start.toolName) && start.toolName !== 'getOperationalContext')
    )
      continue;
    if (aggregate.panels.length >= 8) {
      aggregate.warnings.push(
        'Additional successful tool results were omitted from inline panels.',
      );
      break;
    }
    const descriptor = {
      result: { id: event.dataResult.id, integrity: event.dataResult.integrity },
      presentation: result.presentationBindings[event.dataResult.id] as
        | 'status'
        | 'table'
        | 'ranking'
        | 'series'
        | 'geo'
        | 'matrix'
        | undefined,
      id: `${runId}:panel:${aggregate.panels.length + 1}`,
      title:
        start.toolName === 'getOperationalContext'
          ? 'Current operational status'
          : 'Operational analysis',
    };
    try {
      let adapted: ApplicationReadOutput;
      if (analysisTools.has(start.toolName)) {
        const parsed = analysisInput.parse(start.input);
        if (
          (start.toolName === 'analyzeAssetOperations' && !parsed.assetId) ||
          (start.toolName === 'analyzeAreaOperations' && !parsed.area) ||
          (parsed.metric !== 'current-status' && (!parsed.from || !parsed.through))
        )
          throw new Error('Unsupported tool input.');
        const { from, through, ...selection } = parsed;
        const parameters: AnalysisInput = {
          ...selection,
          ...(from && through ? { window: { from, through } } : {}),
        };
        adapted = await data.adaptAnalysis(parameters, event.output, descriptor, context);
      } else {
        const selected = z.object({ assetId: z.string() }).strict().parse(start.input);
        const outputAsset = z.object({ asset: z.object({ id: z.string() }) }).parse(event.output);
        if (outputAsset.asset.id !== selected.assetId)
          throw new Error('Status selection mismatch.');
        adapted = await data.adaptStatus(event.output, descriptor, context);
      }
      aggregate.panels.push(...adapted.panels);
      aggregate.evidence.push(...adapted.evidence);
      aggregate.entityRefs.push(...adapted.entityRefs);
      aggregate.warnings.push(...adapted.warnings);
    } catch {
      context.signal.throwIfAborted();
      aggregate.warnings.push(
        'A tool result had no compatible evidence-backed panel; its answer remains available as text.',
      );
    }
  }
  aggregate.evidence = [...new Map(aggregate.evidence.map((item) => [item.id, item])).values()];
  aggregate.entityRefs = [...new Map(aggregate.entityRefs.map((item) => [item.id, item])).values()];
  aggregate.warnings = [...new Set(aggregate.warnings)];
  return {
    ...aggregate,
    text: result.text,
    answerSupport: result.answerSupport,
    questionCoverage: result.questionCoverage,
    resolvedScope: result.resolvedScope,
    agentExecutionId: result.runId,
  };
}
