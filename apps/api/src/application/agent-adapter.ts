import type { DatabaseConnection } from '@repo/db';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { runCoordinator } from '../agents/coordinator.js';
import type { AnalysisInput } from '../evidence/analytics.js';
import { createOperationsService } from '../evidence/operations/service.js';
import { createQueryEmbedder } from '../evidence/query-embedding.js';
import { createSnapshotServices } from '../evidence/snapshot.js';
import { composePanels } from './compose-panels.js';
import type { ApplicationData } from './data.js';
import { locationPanel } from './location-panel.js';
import { withOperatorContext } from './operational-agent.js';
import { assessmentPanel } from './operational-panel.js';
import { createOperatorContext } from './operator-context.js';
import type { AgentRunner, ApplicationReadOutput, ExecutionContext } from './ports.js';
import { createApplicationRepository } from './repository.js';
import {
  combineViewComponents,
  componentDescriptor,
  resolveViewComponents,
} from './view-composition.js';

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
    assetIds: z.array(z.string().max(128)).min(1).max(200).optional(),
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
  locateAssets: 'Reading asset locations',
  explainCapability: 'Explaining the calculation and available capabilities',
  evaluateAnswer: 'Checking the answer against your request',
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
    evaluatorModel?: () => LanguageModel;
  },
): AgentRunner {
  const repository = createApplicationRepository(connection);
  return async (input, onProgress) => {
    const { context } = input;
    const operatorContext = createOperatorContext(
      connection,
      data,
      context,
      input.runId,
      input.messages.filter((message) => message.role === 'user').at(-1)?.content ?? '',
    );
    context.signal.throwIfAborted();
    const trace = (event: Record<string, unknown>) => {
      if (process.env.APP_AGENT_TRACE === '1')
        console.log(
          JSON.stringify({
            component: 'application-agent',
            runId: input.runId,
            at: new Date().toISOString(),
            ...event,
          }),
        );
    };
    trace({ type: 'run-start' });
    const running = new Map<string, string>();
    const toolStarts = new Map<string, { name: string; at: number }>();
    const result = await runCoordinator(input.messages, {
      model: options.model(),
      specialistModels: options.specialistModels?.(),
      evaluatorModel: options.evaluatorModel?.(),
      operatorContext,
      operations: withOperatorContext(
        createOperationsService(connection.pool, context.namespace, context.asOf),
        operatorContext,
        input.messages.filter((message) => message.role === 'user').at(-1)?.content ?? '',
      ),
      ...(input.conversationId
        ? {
            conversationViews: {
              list: () => repository.componentCatalogue(context, input.conversationId as string),
              resolve: async (references: { resultId: string; panelId: string }[]) =>
                (
                  await resolveViewComponents(
                    repository,
                    context,
                    input.conversationId as string,
                    references,
                  )
                ).map(({ result, panel }) => componentDescriptor(result, panel)),
            },
          }
        : {}),
      signal: context.signal,
      ...createSnapshotServices(
        connection.pool,
        context.namespace,
        context.asOf,
        createQueryEmbedder(process.env),
      ),
      onModelResult(observation) {
        trace({
          type: 'model-result',
          finishReason: observation.finishReason,
          answerSupport: observation.answerSupport,
          questionCoverage: observation.questionCoverage?.status,
          usage: observation.usage,
          toolCalls: observation.toolCalls.map(({ toolCallId, toolName, invalid }) => ({
            toolCallId,
            toolName,
            invalid,
          })),
        });
      },
      onEvent(event) {
        if (event.type === 'tool-start') {
          toolStarts.set(event.toolCallId, { name: event.toolName, at: Date.now() });
          const selection =
            event.input && typeof event.input === 'object'
              ? Object.fromEntries(
                  Object.entries(event.input).filter(([key]) =>
                    [
                      'assetId',
                      'topic',
                      'team',
                      'assetIds',
                      'components',
                      'area',
                      'metric',
                      'from',
                      'through',
                      'window',
                      'limit',
                      'equipmentKind',
                      'onlyNonProducing',
                      'groupBy',
                      'inspectionId',
                      'protocolId',
                      'eventId',
                      'recordId',
                      'reportId',
                    ].includes(key),
                  ),
                )
              : {};
          trace({
            type: event.type,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            agent: event.agent,
            parentToolCallId: event.parentToolCallId,
            selection,
          });
          const label = safeLabels[event.toolName] ?? 'Reading evidence';
          running.set(event.toolCallId, label);
          onProgress({ operationId: event.toolCallId, label, state: 'running' });
        } else {
          const started = toolStarts.get(event.toolCallId);
          trace({
            type: event.type,
            toolCallId: event.toolCallId,
            toolName: started?.name,
            elapsedMs: started ? Date.now() - started.at : undefined,
            ...(event.type === 'tool-error'
              ? { error: event.error }
              : { resultId: event.dataResult?.id, coverage: event.dataResult?.coverage }),
            ...(event.type === 'tool-result' &&
            ['publishAnswer', 'presentResult', 'validateQuestion'].includes(started?.name ?? '') &&
            event.output &&
            typeof event.output === 'object'
              ? {
                  decision: Object.fromEntries(
                    Object.entries(event.output).filter(([key]) =>
                      ['status', 'reason', 'feedback', 'allowed', 'component'].includes(key),
                    ),
                  ),
                }
              : {}),
            ...(event.type === 'tool-result' && started?.name === 'evaluateAnswer'
              ? { evaluation: event.output }
              : {}),
          });
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
    }).catch((error: unknown) => {
      trace({
        type: 'run-failed',
        reason: context.signal.aborted ? 'aborted' : 'execution-failed',
      });
      throw error;
    });
    context.signal.throwIfAborted();
    let adapted = await adaptCoordinatorResult(result, data, context, input.runId);
    if (input.conversationId && result.reusedComponents.length) {
      const selected = await resolveViewComponents(
        repository,
        context,
        input.conversationId,
        result.reusedComponents,
      );
      const { panels, evidence, entityRefs, warnings } = combineViewComponents(selected, adapted);
      adapted = { ...adapted, panels, evidence, entityRefs, warnings };
    }
    adapted.panels = composePanels(
      adapted.panels,
      /\b(?:separate|individual|side.by.side)\b/i.test(
        input.messages.filter((message) => message.role === 'user').at(-1)?.content ?? '',
      ),
    );
    trace({
      type: 'run-adapted',
      panelCount: adapted.panels.length,
      evidenceCount: adapted.evidence.length,
      explanationStatus: adapted.answerSupport.explanationStatus,
    });
    return adapted;
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
    warnings: [...result.answerSupport.warnings],
  };
  for (const event of result.trace) {
    if (
      event.type !== 'tool-result' ||
      !event.dataResult ||
      !result.presentationBindings[event.dataResult.id] ||
      !result.selectedResultIds.includes(event.dataResult.id)
    )
      continue;
    const start = starts.get(event.toolCallId);
    if (event.dataResult.kind === 'operational-assessment') {
      const evidence = await data.hydrate(event.dataResult.sources, context);
      aggregate.evidence.push(...evidence);
      if (result.presentationBindings[event.dataResult.id] === 'bar')
        aggregate.panels.push(
          assessmentPanel(
            event.dataResult,
            evidence,
            `${runId}:panel:${aggregate.panels.length + 1}`,
            'table',
          ),
        );
      aggregate.panels.push(
        assessmentPanel(
          event.dataResult,
          evidence,
          `${runId}:panel:${aggregate.panels.length + 1}`,
          result.presentationBindings[event.dataResult.id],
        ),
      );
      aggregate.entityRefs.push(
        ...event.dataResult.payload.rows
          .filter((row) => typeof row.assetId === 'string')
          .map((row) => ({ type: 'asset' as const, id: String(row.assetId) })),
      );
      continue;
    }
    if (event.dataResult.kind === 'asset-locations') {
      const evidence = await data.hydrate(event.dataResult.sources, context);
      aggregate.evidence.push(...evidence);
      aggregate.panels.push(
        locationPanel(
          event.dataResult,
          evidence,
          `${runId}:panel:${aggregate.panels.length + 1}`,
          result.presentationBindings[event.dataResult.id],
        ),
      );
      aggregate.entityRefs.push(
        ...event.dataResult.payload.rows.map((row) => ({
          type: 'asset' as const,
          id: row.assetId,
        })),
      );
      continue;
    }
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
