import { randomUUID } from 'node:crypto';
import { type Visual, visualSchema } from '@repo/contracts';
import { type LanguageModel, type ToolExecutionOptions, type ToolSet, tool } from 'ai';
import { z } from 'zod';
import type { AnalyticsService, DateWindow } from '../evidence/analytics.js';
import { InvalidEquipmentCategoryError } from '../evidence/analytics.js';
import { assessSupportedDeadline, type SupportedDeadlineInput } from '../evidence/deadlines.js';
import { assessIncidentTimings } from '../evidence/incident-timings.js';
import { locateAssets } from '../evidence/locations.js';
import { metricCatalogue } from '../evidence/metrics.js';
import { type OperationsPort, operationalTopics } from '../evidence/operations/service.js';
import { traceAssetRelationships } from '../evidence/relationships.js';
import type { EvidenceService } from '../evidence/service.js';
import type { Document, Source } from '../evidence/types.js';
import { createOperatorAgent, modelProjection } from './agent.js';
import {
  explanationText,
  isMeasureClarification,
  UnsupportedQuantityError,
  unsupportedProductionRequest,
} from './capabilities.js';
import { normalizeEvidenceCitations } from './citations.js';
import type { ConversationComponent, ConversationViewPort } from './conversation-views.js';
import { type ResultFact, renderFacts, resultFacts } from './facts.js';
import { evaluateFinalAnswer } from './final-evaluator.js';
import type { OperatorContextPort } from './operator-context.js';
import { type AgentDataResult, describeDataResult } from './results.js';

export type ModelObservation = {
  text: string;
  finishReason: string;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  toolCalls: { toolCallId: string; toolName: string; input: unknown; invalid: boolean }[];
  sources: Source[];
  answerSupport?: { mode: string; explanationStatus: string; warnings: string[] };
  questionCoverage?: { status: string };
};

export type ExecutionEvent =
  | {
      type: 'tool-start';
      toolCallId: string;
      toolName: string;
      input: unknown;
      agent?: string;
      parentToolCallId?: string;
    }
  | {
      type: 'tool-result';
      toolCallId: string;
      output: unknown;
      dataResult?: AgentDataResult;
      agent?: string;
      parentToolCallId?: string;
    }
  | {
      type: 'tool-error';
      toolCallId: string;
      error: string;
      agent?: string;
      parentToolCallId?: string;
    };

export type CoordinatorOptions = {
  model: LanguageModel;
  evaluatorModel?: LanguageModel;
  conversationViews?: ConversationViewPort;
  operations?: OperationsPort;
  operatorContext?: OperatorContextPort;
  evidence: EvidenceService;
  analytics?: AnalyticsService;
  traceRelationships?: (
    assetId: string,
    window: DateWindow,
    signal?: AbortSignal,
  ) => ReturnType<typeof traceAssetRelationships>;
  assessIncidentTimings?: (
    assetId: string,
    inspectionId: string,
    signal?: AbortSignal,
  ) => ReturnType<typeof assessIncidentTimings>;
  assessDeadline?: (
    input: SupportedDeadlineInput,
    signal?: AbortSignal,
  ) => ReturnType<typeof assessSupportedDeadline>;
  specialistModels?: { evidence?: LanguageModel; procedures?: LanguageModel };
  signal?: AbortSignal;
  onEvent?: (event: ExecutionEvent) => void;
  /** Evaluation observation before final response validation, including rejected candidates. */
  onModelResult?: (observation: ModelObservation) => void;
};

const assetId = z.string().regex(/^WELL-[A-Za-z0-9-]{1,60}$/);
const instructions = `You are an oil-field operator assistant. Answer the latest user request in its conversation context. Historical questions supply references, not new tasks. Prior assistant prose can be wrong: current tools and source records are authoritative.
Resolve intent, scope, measure and dates with validateQuestion first. Use the actual As-of date. A named document's publication month is not its coverage period; governing documents define their own applicability. A new explicit well replaces a prior selection unless the user is adding it. Ask a concise clarification when an entity or essential measure cannot be resolved; do not choose arbitrary wells.
Use assessOperations for structured operational investigations: gas response deadlines, bypass/MOC approvals, status conflicts, regulator-letter compliance, freeze checks, installed-pump recall, team ownership, operator notes, repair priorities, repair waiting reasons and comparable regional temperatures. Those operations join complete scoped structured records and applicable policies. Do not try to enumerate field-wide JSON notes by searching Markdown. Follow linked report IDs for exact narrative/measurements; never take a reading from an unrelated report. Search discovers candidates, not exhaustive counts or proof of absence. Delegate a genuinely unresolved multi-source investigation or procedure interpretation to the evidence/procedure specialist.
For 'which region of the field runs hotter', compare the named FIELD AREAS/BLOCKS first, and retain broader parent regions separately. A hottest block and its parent-region mean are different answers: report the most specific supported block with its recorded mean and weekly hottest counts. Never collapse several blocks into one directional region and hide the hottest block. assessOperations regional-temperatures returns both granular field-block rows and a separately labeled broader rollup. Lead with recorded wellhead means and weekly hottest counts. Those are directly observed temperatures. Adjusted wellhead-minus-ambient or matched well-type deltas answer a different question: include only as labeled secondary context, never use them to deny an observed hotter region. Do not infer geography causes or statistical significance.
Use the existing analytics tools for supported temperature, downtime, spill, cost and repeat-repair calculations. Preserve exact quantities, units, dates, missing values, corrections and provenance. An inspection-derived weekly downtime estimate is not continuous shut-in time, repair duration, oil volume or oil output. There is no metered production-volume or oil-output forecast tool: explain this plainly, with no proxy ranking. Inspect data-availability before claiming missing measurements; equipment pressure ratings are not reservoir pressure.
For lists, comparisons, rankings and compliance assessments choose responseMode=visual and bind the canonical result with presentResult. Default other answers to text; respect text-only. Location/where-is-it defaults to one geo map unless text-only. Batch multiple wells with assetIds onto one map. Different measures may share one composed response. A repair-waiting breakdown uses bar: the backend supplies stacked bars and the exact table together. Do not generate JSX, HTML, SQL, values or coordinates for visuals.
Always finish using publishAnswer. Pass the exact resultRefs/fact IDs supplied by tools; auxiliary explanation and memory resultIds are valid too. Write a concise operator-facing explanation grounded in the supplied facts, canonical rows and governing evidence. In a visual answer use at most 150 words: lead with the answer, explain the rule or comparison and the important uncertainty. Do not enumerate all rows or repeat the entire table; it is already rendered. Counts must come from summary, never guessed from the preview. At most three named examples are enough. Cite actual source IDs. Distinguish observations, attributed reports and inference. Never invent a causal claim or calibrated failure probability. The final evaluator sees canonical rows and governing documents; revise concrete errors it identifies, then stop after publication succeeds.
Recall inventory means installed pumps, INCLUDING shut-in wells. Filter by producing/not-producing only if the user asks about oil-production status. Current installed equipment supersedes historical affected lots; a later job's planned completion is not proof that a replacement happened.
Read getOperatorContext for the actual acting person, their team, private preferences and explicitly shared operator reports. My area uses that person's current team ownership, not an area guessed from an earlier question. recordOperatorMemory stores only the CURRENT user's explicit replacement report or private preference. A direct report remains attributed and awaits a work order; hearsay never confirms a replacement. Never claim persistence without a successful memory tool call, and never share another person's personal preferences. Original domain records remain unchanged.
For references such as keep that, bring back the costs, or put those together, listConversationComponents and reuseViewComponents preserve original data, filters and evidence. Additive follow-ups such as their temperatures would be handy too retain the current view and add the new component; only/just selects a subset. For of the wells we discussed, derive the actual earlier asset set from retained result entityRefs/components; never substitute a new fleet-wide top ranking. Text-only definitions do not inherit old visuals.`;

export async function runCoordinator(
  messages: { role: 'user' | 'assistant'; content: string }[],
  options: CoordinatorOptions,
) {
  options.signal?.throwIfAborted();
  const conversationViews = options.conversationViews;
  const runId = randomUUID();
  const independentlyUnsupportedQuantity = unsupportedProductionRequest(messages);
  let unsupportedQuantity = independentlyUnsupportedQuantity;
  let mixedCapabilities = false;
  const measureClarification =
    isMeasureClarification(messages) &&
    /oil|volume|barrels|produced/i.test(
      messages.filter((m) => m.role === 'user').at(-1)?.content ?? '',
    );
  const requestedAssets = new Set(
    messages
      .filter((message) => message.role === 'user')
      .at(-1)
      ?.content.match(/WELL-[A-Za-z0-9-]+/g) ?? [],
  );
  const trace: ExecutionEvent[] = [];
  const sources = new Map<string, Source>();
  const aliases = new Map<string, string>();
  const visuals = new Map<string, Visual>();
  const dataResults: AgentDataResult[] = [];
  const facts = new Map<string, ResultFact>();
  const documents = new Map<string, Document>();
  const passages = new Map<
    string,
    { id: string; text: string; sourceId: string; source: Source }
  >();
  let published:
    | {
        text: string;
        resultIds: string[];
        mode: 'deterministic-facts' | 'quoted-evidence' | 'grounded-synthesis';
        warnings?: string[];
      }
    | undefined;
  let retainedCandidate: { text: string; resultIds: string[]; warnings: string[] } | undefined;
  const presentations = new Map<string, string>();
  const retainedComponents = new Map<string, ConversationComponent>();
  let evaluationAttempts = 0;
  const needSchema = z.enum([
    'status',
    'analysis',
    'source-passage',
    'incident-assessment',
    'open-records',
    'relationship-trace',
    'method-explanation',
    'capability',
    'location',
    'view-composition',
    'operational-assessment',
    'memory',
  ]);
  let questionPlan:
    | {
        scope: 'asset' | 'area' | 'fleet' | 'unresolved';
        assetIds: string[];
        area?: string;
        window?: DateWindow;
        metric?: string;
        responseMode: 'text' | 'visual';
        viewOperation: 'replace' | 'extend';
        parts: { id: string; question: string; needs: z.infer<typeof needSchema> }[];
      }
    | undefined;
  let questionCoverage:
    | {
        method: 'declared-parts-and-result-references';
        status: 'complete' | 'partial' | 'unavailable';
        parts: {
          id: string;
          question: string;
          status: 'answered' | 'unanswered';
          resultIds: string[];
          sourceIds: string[];
        }[];
      }
    | undefined;
  let calls = 0;
  function bindAssessmentDefaults() {
    if (!questionPlan) return;
    const latest = messages.filter((message) => message.role === 'user').at(-1)?.content ?? '';
    const explicitTextOnly =
      /\b(?:text[- ]only|no (?:chart|map|table)|without (?:a )?(?:chart|map|table))\b/i.test(
        latest,
      );
    for (const result of dataResults) {
      if (result.kind !== 'operational-assessment') continue;
      const parameters = result.parameters as { from?: string; through?: string; topic: string };
      if (parameters.from && parameters.through)
        questionPlan.window = { from: parameters.from, through: parameters.through };
      if (!explicitTextOnly && result.payload.rows.length > 1) {
        questionPlan.responseMode = 'visual';
        if (!presentations.has(result.id))
          presentations.set(
            result.id,
            parameters.topic === 'repair-delays'
              ? 'bar'
              : /\b(?:chart|graph|plot)\b/i.test(latest) &&
                  ['regional-temperatures', 'inspection-summary'].includes(parameters.topic)
                ? 'ranking'
                : 'table',
          );
        if (!retainedCandidate)
          retainedCandidate = {
            text: resultFacts(result)[0]?.text ?? result.payload.title,
            resultIds: [result.id],
            warnings: [],
          };
      }
    }
  }
  function emit(event: ExecutionEvent) {
    trace.push(event);
    options.onEvent?.(event);
  }
  function remember(items: Source[]) {
    for (const source of items) {
      const existing = sources.get(source.id);
      if (existing && existing.sourceId !== source.sourceId)
        throw new Error(
          'Evidence source version changed within this run; retry against stable data.',
        );
      if (existing && !source.path.endsWith('.jsonl')) {
        const first =
          'line' in existing.locator ? existing.locator.line : existing.locator.startLine;
        const last = 'line' in existing.locator ? existing.locator.line : existing.locator.endLine;
        const nextFirst = 'line' in source.locator ? source.locator.line : source.locator.startLine;
        const nextLast = 'line' in source.locator ? source.locator.line : source.locator.endLine;
        sources.set(source.id, {
          ...source,
          locator: { startLine: Math.min(first, nextFirst), endLine: Math.max(last, nextLast) },
        });
      } else sources.set(source.id, source);
    }
  }
  function retainedDocument(document: Document) {
    documents.set(document.id, structuredClone(document));
  }
  function rememberDocuments(documents: Document[]) {
    for (const document of documents) {
      if (requestedAssets.size && document.assetId && !requestedAssets.has(document.assetId))
        throw new Error('Document is outside the explicitly requested asset scope.');
      retainedDocument(document);
      remember([document.source]);
      const alias = document.markdown.match(/Document ID:\s*([A-Za-z0-9_-]+)/)?.[1];
      if (alias) aliases.set(alias, document.source.id);
      if (document.kind === 'sop')
        for (const match of document.markdown.matchAll(/\|\s*\*\*([A-Z]{2}-\d{2})\*\*\s*\|/g)) {
          if (match[1]) aliases.set(match[1], document.source.id);
        }
      if (document.kind === 'maintenance_report') {
        const reportId = document.markdown.match(
          /^#\s+Maintenance Report\s*[—:-]+\s*([A-Z]+-[A-Za-z0-9-]+)/m,
        )?.[1];
        if (reportId) aliases.set(reportId, document.source.id);
      }
    }
  }
  const normalizeCitations = (text: string) => normalizeEvidenceCitations(text, sources, aliases);
  async function executeTool<T>(
    name: string,
    input: unknown,
    id: string,
    work: () => Promise<T>,
    metadata: { agent?: string; parentToolCallId?: string } = { agent: 'coordinator' },
  ) {
    options.signal?.throwIfAborted();
    emit({ type: 'tool-start', toolCallId: id, toolName: name, input, ...metadata });
    try {
      if (
        unsupportedQuantity &&
        !mixedCapabilities &&
        !['explainCapability', 'evaluateAnswer'].includes(name)
      )
        throw new UnsupportedQuantityError(
          `This request needs unsupported ${unsupportedQuantity}. Do not substitute operational metrics or select a well. Call explainCapability with topic=${unsupportedQuantity}, then publish its supported explanation.`,
        );
      if (++calls > 40) throw new Error('Tool budget exhausted.');
      const output = await work();
      options.signal?.throwIfAborted();
      const dataResult = describeDataResult({
        operation: name,
        output,
        parameters:
          (output && typeof output === 'object' && 'executedParameters' in output
            ? output.executedParameters
            : undefined) ?? input,
        runId,
        toolCallId: id,
        asOf: options.evidence.asOf,
        sources,
      });
      if (dataResult) {
        dataResults.push(dataResult);
        bindAssessmentDefaults();

        for (const fact of resultFacts(dataResult)) facts.set(fact.id, fact);
      }
      emit({
        type: 'tool-result',
        toolCallId: id,
        output,
        ...(dataResult ? { dataResult } : {}),
        ...metadata,
      });
      return dataResult && output && typeof output === 'object'
        ? {
            ...output,
            resultRef: dataResult.id,
            supportedFacts: [...facts.values()]
              .filter((fact) => fact.resultId === dataResult.id)
              .slice(0, 12),
            factCount: [...facts.values()].filter((fact) => fact.resultId === dataResult.id).length,
          }
        : output;
    } catch (error) {
      const message =
        error instanceof InvalidEquipmentCategoryError || error instanceof UnsupportedQuantityError
          ? error.message
          : 'Evidence operation failed or was cancelled.';
      emit({
        ...metadata,
        type: 'tool-error',
        toolCallId: id,
        error: message,
      });
      throw new Error(message);
    }
  }
  type Role = 'coordinator' | 'evidence-investigator' | 'procedure-specialist';
  const childUsage: ModelObservation['usage'][] = [];
  const childCalls: ModelObservation['toolCalls'] = [];
  const idFor = (agent: Role, id: string, parent?: string) =>
    parent ? `${agent}:${parent}:${id}` : id;
  function baseTools(agent: Role, parent?: string, selectedAsset?: string): ToolSet {
    const execute = async <T>(name: string, input: unknown, id: string, work: () => Promise<T>) => {
      const callId = idFor(agent, id, parent);
      return executeTool(
        name,
        input,
        callId,
        async () => {
          const requested = input as {
            assetId?: string;
            assetIds?: string[];
            area?: string;
            metric?: string;
            from?: string;
            through?: string;
          };
          const requestedAsset = requested.assetId;
          if (name.startsWith('analyze') && questionPlan) {
            if (questionPlan.metric && requested.metric !== questionPlan.metric)
              throw new Error('Metric differs from the resolved question.');
            if (questionPlan.area && requested.area !== questionPlan.area)
              throw new Error('Area differs from the resolved question.');
            if (
              questionPlan.window &&
              requested.metric !== 'current-status' &&
              (requested.from !== questionPlan.window.from ||
                requested.through !== questionPlan.window.through)
            )
              throw new Error('Window differs from the resolved question.');
          }
          const permittedAssets =
            questionPlan?.viewOperation === 'extend'
              ? new Set(questionPlan.assetIds)
              : requestedAssets;
          if (permittedAssets.size && requestedAsset && !permittedAssets.has(requestedAsset))
            throw new Error('Requested asset is outside the explicit user scope.');
          if (permittedAssets.size && requested.assetIds?.some((id) => !permittedAssets.has(id)))
            throw new Error('Selected assets are outside the explicit user scope.');
          if (selectedAsset && requestedAsset && requestedAsset !== selectedAsset)
            throw new Error('This specialist is scoped to the selected well.');
          return work();
        },
        { agent, parentToolCallId: parent },
      );
    };
    const tools: ToolSet = {
      citePassage: tool({
        description:
          'Extract an exact paragraph from an already-read original document, matching a literal phrase. Returns a passage ID for publishAnswer; no model-authored quotation or interpretation is accepted. Read the full linked report first.',
        inputSchema: z
          .object({ documentId: z.string().min(1).max(300), contains: z.string().min(3).max(300) })
          .strict(),
        execute: ({ documentId, contains }) => {
          const doc = documents.get(aliases.get(documentId) ?? documentId);
          if (!doc || (selectedAsset && doc.assetId && doc.assetId !== selectedAsset))
            return { status: 'not-found' };
          const paragraphs = doc.markdown.split(/\n\s*\n/);
          let paragraph = paragraphs.find((text) =>
            text.toLowerCase().includes(contains.toLowerCase()),
          );
          if (paragraph?.trimStart().startsWith('|'))
            paragraph = paragraph
              .split('\n')
              .find((line) => line.toLowerCase().includes(contains.toLowerCase()));
          if (!paragraph || paragraph.length > 4000)
            return {
              status: 'not-found',
              reason: 'Exact bounded paragraph not found; choose a more specific phrase.',
            };
          const id = `${doc.id}:passage:${doc.markdown.indexOf(paragraph)}`;
          const offset = doc.markdown.indexOf(paragraph);
          const startLine = doc.markdown.slice(0, offset).split('\n').length;
          const source = {
            ...doc.source,
            locator: { startLine, endLine: startLine + paragraph.split('\n').length - 1 },
          };
          passages.set(id, { id, text: paragraph, sourceId: doc.source.id, source });
          remember([source]);
          return { status: 'found', passageId: id, text: paragraph, source: doc.source };
        },
      }),
      traceRelationships: tool({
        description:
          'Trace explicit stored inspection→maintenance→report and inspection→regulatory links for a well/time window. Checks target existence and asset identity. Coincidence/shared asset is not causal proof. Read linked reports for attributed causes.',
        inputSchema: z
          .object({ assetId, window: z.object({ from: z.iso.date(), through: z.iso.date() }) })
          .strict(),
        execute: (input, { toolCallId }) =>
          execute('traceRelationships', input, toolCallId, async () => {
            if (!options.analytics)
              return {
                status: 'unavailable',
                reason: 'Relationship data unavailable.',
                sources: [],
              };
            const result = await (options.traceRelationships
              ? options.traceRelationships(input.assetId, input.window, options.signal)
              : traceAssetRelationships(
                  input.assetId,
                  input.window,
                  options.evidence,
                  options.analytics,
                  options.signal,
                ));
            remember(result.sources);
            return result;
          }),
      }),
      assessIncidentTimings: tool({
        description:
          'Assess SR-01 reporting and SR-02 containment for an identified spill. Reads its exact inspection, linked reports, regulatory filings and company clauses. Returns observed versus allowed hours and missed/met/unknown, with sources. Other protocols remain not assessed.',
        inputSchema: z.object({ assetId, inspectionId: z.string().min(1).max(200) }).strict(),
        execute: (input, { toolCallId }) =>
          execute('assessIncidentTimings', input, toolCallId, async () => {
            if (!options.analytics)
              return { status: 'not-assessed', reason: 'Analytics unavailable.', sources: [] };
            const result = await (options.assessIncidentTimings
              ? options.assessIncidentTimings(input.assetId, input.inspectionId, options.signal)
              : assessIncidentTimings(
                  input.assetId,
                  input.inspectionId,
                  options.evidence,
                  options.analytics,
                  options.signal,
                ));
            remember(result.sources);
            return result;
          }),
      }),
      assessDeadline: tool({
        description:
          'Preferred authoritative calendar-date assessment for supported company SR-03 verification (inspection trigger), RC-04 NOV response (notice trigger), WS-07 report (maintenance completion trigger). Reads original event/rule itself and derives dates; never supply an invented trigger date or interval. Returns not-assessed for unsupported/missing evidence. Completion/payment are separate questions.',
        inputSchema: z
          .object({
            assetId,
            protocolId: z.enum(['SR-03', 'RC-04', 'WS-07']),
            eventId: z.string().min(1).max(200),
          })
          .strict(),
        execute: (input, { toolCallId }) =>
          execute('assessDeadline', input, toolCallId, async () => {
            const result = await (options.assessDeadline
              ? options.assessDeadline(input, options.signal)
              : assessSupportedDeadline(
                  input,
                  options.evidence,
                  options.analytics,
                  options.signal,
                ));
            remember(result.sources);
            return result;
          }),
      }),
      calculateDeadline: tool({
        description:
          'Deterministic UTC calendar-date arithmetic for rules expressed in DAYS, never hour-based deadlines. Never pass 24 hours as 24 days. Read/cite the real rule and event first. Returns a due date and calendar days overdue; it does not establish completion, payment or a legal breach. Date-only sources do not support exact hours.',
        inputSchema: z
          .object({
            triggerDate: z.iso.date(),
            withinDays: z.number().int().min(0).max(36600),
            ruleSourceId: z.string().min(1).max(300),
            eventSourceId: z.string().min(1).max(300),
          })
          .strict(),
        execute: (input, { toolCallId }) =>
          execute('calculateDeadline', input, toolCallId, async () => {
            const ids = [input.ruleSourceId, input.eventSourceId].map(
              (id) => aliases.get(id) ?? id,
            );
            if (ids.some((id) => !sources.has(id)))
              throw new Error('Read the rule and triggering event before calculating.');
            const due = new Date(`${input.triggerDate}T00:00:00.000Z`);
            due.setUTCDate(due.getUTCDate() + input.withinDays);
            const dueDate = z.iso.date().parse(due.toISOString().slice(0, 10));
            const assessedDate = options.evidence.asOf.slice(0, 10);
            const calendarDays = Math.round(
              (Date.parse(`${assessedDate}T00:00:00.000Z`) - due.getTime()) / 86_400_000,
            );
            return {
              triggerDate: input.triggerDate,
              withinDays: input.withinDays,
              dueDate,
              assessedDate,
              asOf: options.evidence.asOf,
              precision: 'UTC-calendar-date',
              overdueCalendarDays: Math.max(0, calendarDays),
              dueState:
                calendarDays > 0 ? 'overdue' : calendarDays === 0 ? 'due-today' : 'upcoming',
              completion: 'not-assessed',
              inputSourceIds: ids,
              warnings: [
                'Conditional on the supplied trigger date and rule interval being supported by the cited evidence. Date-only calculation does not establish precise due time or completion.',
              ],
            };
          }),
      }),
      readRecord: tool({
        description:
          'Read one exact inspection, maintenance, regulatory event or human note by ID. Returns the preserved original JSONL line and citation, not a generated summary. Use for targeted old observations or disagreements.',
        inputSchema: z
          .object({
            kind: z.enum(['inspection', 'maintenance', 'regulatory', 'note']),
            id: z.string().min(1).max(200),
          })
          .strict(),
        execute: (input, { toolCallId }) =>
          execute('readRecord', input, toolCallId, async () => {
            const record = await options.evidence.record(input.kind, input.id, options.signal);
            if (record) {
              const original = JSON.parse(record.text) as { asset_id?: string };
              if (
                requestedAssets.size &&
                original.asset_id &&
                !requestedAssets.has(original.asset_id)
              )
                throw new Error('Record is outside the explicitly requested asset scope.');
              remember([record.source]);
            }
            return { status: record ? 'found' : 'not-found', record };
          }),
      }),
      getOperationalContext: tool({
        description:
          'Latest observation, decimal-exact production status, attributed notes/corrections and latest ten repairs with report IDs. Not exhaustive history.',
        inputSchema: z.object({ assetId }).strict(),
        execute: ({ assetId }, { toolCallId }) =>
          execute('getOperationalContext', { assetId }, toolCallId, async () => {
            const result = await options.evidence.overview(assetId, options.signal);
            remember(result.sources);
            visuals.delete(assetId);
            if (
              result.status === 'found' &&
              result.production &&
              result.observation &&
              result.ruleSource
            ) {
              const delta = Number(result.production.deltaC);
              if (Number.isFinite(delta))
                visuals.set(
                  assetId,
                  visualSchema.parse({
                    kind: 'well-status',
                    assetId,
                    producing: result.production.producing,
                    temperatureDeltaC: delta,
                    observedAt: result.observation.observedAt,
                    sources: [result.observation.source, result.ruleSource].map(
                      ({ id, label, path }) => ({ id, label, path }),
                    ),
                  }),
                );
            }
            return result;
          }),
      }),
      getApplicableProcedures: tool({
        description:
          'Read applicable manual/SOP originals including explicitly inherited parent procedures. Primary manual overrides parent.',
        inputSchema: z.object({ assetId }).strict(),
        execute: ({ assetId }, { toolCallId }) =>
          execute('getApplicableProcedures', { assetId }, toolCallId, async () => {
            const documents = await options.evidence.procedures(assetId, options.signal);
            rememberDocuments(documents);
            return {
              documents,
              coverage: 'applicable-procedures',
              warnings: [
                'Procedure conclusions are evidence-backed assessments. Missing records are not proof an action never happened.',
              ],
            };
          }),
      }),
      readEvidence: tool({
        description:
          'Read an original document by its returned document ID, or resolve a maintenance job ID through its stored report link. Returns the real document ID as the citation. Does not fetch arbitrary files or URLs. If not found, discover the linked report with getOperationalRecords/searchEvidence before concluding evidence is unavailable.',
        inputSchema: z.object({ documentId: z.string().min(1).max(300) }).strict(),
        execute: ({ documentId }, { toolCallId }) =>
          execute('readEvidence', { documentId }, toolCallId, async () => {
            const document = await options.evidence.read(documentId, options.signal);
            if (document) rememberDocuments([document]);
            return { status: document ? 'found' : 'not-found', document };
          }),
      }),
      searchEvidence: tool({
        description:
          'Scoped lexical discovery of narrative documents. Ranked hits are not an exhaustive incident set or evidence of absence.',
        inputSchema: z
          .object({
            query: z.string().trim().min(1).max(500),
            assetId: assetId.optional(),
            kind: z.enum(['manual', 'sop', 'maintenance_report']).optional(),
            limit: z.number().int().min(1).max(8).default(5),
          })
          .strict(),
        execute: (input, { toolCallId }) =>
          execute('searchEvidence', input, toolCallId, async () => {
            const result = await options.evidence.search(input, options.signal);
            rememberDocuments(result.hits);
            return result;
          }),
      }),
    };
    if (options.operations) {
      tools.assessOperations = tool({
        description:
          'Exhaustive source-backed operational investigations. Select a topic and exact scope/date filters. Returns a resultRef, supported facts and a canonical UI table. Use instead of searching documents for fleet-wide note/repair joins. pump-recall supports currentStatus; team-directory resolves named leaders and ownership counts; operator-notes searches original JSON records, with kind/query filters. inspection-summary is a reusable aggregation tool: select a recorded measure, groupBy region/area/team/well/well-type, timeGrain all/week/month, and orderBy mean/maximum/minimum/observations; returns exact deterministic aggregates with units, counts and scope. Date filters use inclusive UTC dates; absent upper date is asOf.',
        inputSchema: z
          .object({
            topic: z.enum(operationalTopics),
            assetIds: z.array(assetId).min(1).max(600).optional(),
            area: z.string().max(120).optional(),
            team: z.string().max(120).optional(),
            from: z.iso.date().optional(),
            through: z.iso.date().optional(),
            limit: z.number().int().min(1).max(500).default(100),
            measure: z
              .enum(['wellhead-temperature', 'ambient-temperature', 'temperature-difference'])
              .optional()
              .describe(
                'Explicit recorded measure for inspection-summary; wellhead-temperature is default. Temperature difference is a distinct measure, never silently substitute it.',
              ),
            groupBy: z.enum(['region', 'area', 'team', 'well', 'well-type']).optional(),
            timeGrain: z.enum(['all', 'week', 'month']).optional(),
            orderBy: z.enum(['mean', 'maximum', 'minimum', 'observations']).optional(),
            query: z.string().max(500).optional(),
            kind: z.enum(['operator_note', 'note', 'maintenance', 'inspection']).optional(),
            currentStatus: z
              .enum(['not-producing', 'producing'])
              .optional()
              .describe(
                'Only filter when the operator asks which wells are producing/not producing oil. A recalled pump STILL IN THE GROUND is installed even if its well is shut in: omit this filter for recall inventory questions.',
              ),
          })
          .strict(),
        execute: (input, { toolCallId }) => {
          const latest =
            messages.filter((message) => message.role === 'user').at(-1)?.content ?? '';
          const calendarYear = latest.match(/\b(?:in|during|for)\s+(20\d{2})\b/i)?.[1];
          if (calendarYear && input.topic === 'repair-delays') {
            input.from = `${calendarYear}-01-01`;
            input.through = `${calendarYear}-12-31`;
          }
          if (
            input.topic === 'pump-recall' &&
            input.currentStatus &&
            !/\b(?:produc\w*|shut|running|stopped|idle|off|offline|inactive|status)\b/i.test(latest)
          )
            input.currentStatus = undefined;
          return execute('assessOperations', input, toolCallId, async () => {
            const output = await options.operations!(input, options.signal);
            remember(output.sources);
            return output;
          });
        },
      });
    }
    if (options.analytics) {
      const dateWindow = z
        .object({
          from: z.iso
            .date()
            .describe('Inclusive UTC calendar date YYYY-MM-DD. Never an ISO timestamp.'),
          through: z.iso
            .date()
            .describe('Inclusive UTC calendar date YYYY-MM-DD. Never an ISO timestamp.'),
        })
        .strict();
      toolsWithAnalytics(tools, execute, dateWindow);
    }
    return tools;
  }
  function toolsWithAnalytics(
    tools: ToolSet,
    execute: <T>(name: string, input: unknown, id: string, work: () => Promise<T>) => Promise<T>,
    dateWindow: z.ZodObject<{ from: z.ZodISODate; through: z.ZodISODate }>,
  ) {
    const analytics = options.analytics;
    if (!analytics) return;
    tools.locateAssets = tool({
      description:
        'Read recorded well locations and area names with coordinate provenance. For several wells on ONE map pass assetIds in ONE call; do not call once per well. Resolve where-is-it/this from current context or prior chat. Does not query production status or spills. Returns supported location facts and an immutable resultRef for geo/table presentation.',
      inputSchema: z
        .object({
          assetId: assetId.optional(),
          assetIds: z.array(assetId).min(1).max(200).optional(),
          area: z.string().min(1).max(120).optional(),
          limit: z.number().int().min(1).max(500).default(50),
        })
        .strict(),
      execute: (input, { toolCallId }) =>
        execute('locateAssets', input, toolCallId, async () => {
          const result = await locateAssets(analytics, input, options.signal);
          remember(result.sources);
          return result;
        }),
    });
    tools.listAssets = tool({
      description:
        'Resolve well IDs, types and area names. Namespace-scoped asset inventory; no generated results.',
      inputSchema: z
        .object({ assetId: assetId.optional(), area: z.string().max(120).optional() })
        .strict(),
      execute: (input, { toolCallId }) =>
        execute('listAssets', input, toolCallId, async () => {
          const assets = await analytics.listAssets(input, options.signal);
          remember(assets.map((asset) => asset.source));
          return {
            assets: assets.map(({ manual, manualSource, ...asset }) => asset),
            count: assets.length,
          };
        }),
    });
    const analysisSchema = z
      .object({
        assetIds: z
          .array(assetId)
          .min(1)
          .max(200)
          .optional()
          .describe(
            'Exact selected wells for one multi-well comparison/table; omit for the whole fleet.',
          ),
        metric: z.enum([
          'current-status',
          'temperature-history',
          'downtime',
          'spills',
          'repair-costs',
          'repeat-repairs',
        ]),
        from: z.iso
          .date()
          .describe('Inclusive UTC start date YYYY-MM-DD; required except current-status.')
          .optional(),
        through: z.iso
          .date()
          .describe('Inclusive UTC end date YYYY-MM-DD; required except current-status.')
          .optional(),
        equipmentKind: z
          .string()
          .trim()
          .min(1)
          .max(80)
          .describe(
            'Optional exact repair equipment category from records. A well is an asset, not an equipment category. Omit for total repair costs across wells; never infer this filter from the word wells.',
          )
          .optional(),
        onlyNonProducing: z.boolean().optional(),
        groupBy: z.enum(['asset', 'area-month']).optional(),
        limit: z.number().int().min(1).max(500).default(50),
      })
      .strict();
    type FlatAnalysis = z.infer<typeof analysisSchema> & { assetId?: string; area?: string };
    const registerAnalysis = (
      name: string,
      schema: z.ZodType<FlatAnalysis>,
      scopeLabel: string,
    ) => {
      tools[name] = tool({
        description: `Calculate ${scopeLabel} metrics over ALL selected records: current-status, temperature-history, downtime (7 days per non-producing inspection), corrected spills, repair-costs and repeat-repairs. Pass flat from/through YYYY-MM-DD dates except current-status, which always uses latest readings. Exact USD/barrel decimals, full-input coverage, bounded output. Maintenance periods use start dates. Never substitute repair hours for inspection downtime.`,
        inputSchema: schema.refine(
          (input) =>
            input.metric === 'current-status'
              ? !input.from && !input.through
              : !!input.from && !!input.through,
          {
            message:
              'Use both from and through as YYYY-MM-DD dates for historical metrics; omit both for current-status.',
          },
        ),
        execute: (input, { toolCallId }) =>
          execute(name, input, toolCallId, async () => {
            const { from, through, ...parameters } = input;
            const result = await analytics.analyze(
              { ...parameters, window: from && through ? { from, through } : undefined },
              options.signal,
            );
            remember(result.sources);
            return result;
          }),
      });
    };
    registerAnalysis('analyzeAssetOperations', analysisSchema.extend({ assetId }), 'one well');
    registerAnalysis(
      'analyzeAreaOperations',
      analysisSchema.extend({ area: z.string().trim().min(1).max(120) }),
      'one area',
    );
    registerAnalysis('analyzeFleetOperations', analysisSchema, 'the entire accessible fleet');
    tools.getOperationalRecords = tool({
      description:
        'All maintenance/report links and regulatory events in inclusive UTC dates, plus later regulatory follow-ups through asOf linked to inspections in that window. Use for incident obligations, fines and evidence. Dates select maintenance by start; future completion is a plan. An open case does not establish payment status.',
      inputSchema: z.object({ assetId, window: dateWindow }).strict(),
      execute: (input, { toolCallId }) =>
        execute('getOperationalRecords', input, toolCallId, async () => {
          const result = await analytics.records(input.assetId, input.window, options.signal);
          remember(result.sources);
          return result;
        }),
    });
  }
  async function specialist(
    role: 'evidence-investigator' | 'procedure-specialist',
    question: string,
    parent: string,
    selectedAsset?: string,
  ) {
    // Pass whole, same-asset evidence already read in this run, avoiding duplicate investigations.
    // Omit entire oversized items with an explicit count; never silently truncate records.
    const priorEvidence: unknown[] = [];
    let priorCharacters = 0;
    let omittedPriorEvidence = 0;
    if (selectedAsset) {
      for (const event of [...trace].reverse()) {
        if (event.type !== 'tool-result') continue;
        const start = trace.find(
          (item) => item.type === 'tool-start' && item.toolCallId === event.toolCallId,
        );
        if (
          start?.type !== 'tool-start' ||
          !['getOperationalRecords', 'getOperationalContext', 'readEvidence'].includes(
            start.toolName,
          )
        )
          continue;
        const input = start.input as { assetId?: string };
        const output = event.output as { document?: { assetId?: string } };
        if (input.assetId !== selectedAsset && output.document?.assetId !== selectedAsset) continue;
        const item = modelProjection({ toolName: start.toolName, output: event.output });
        const length = JSON.stringify(item).length;
        if (priorCharacters + length > 20_000) {
          omittedPriorEvidence++;
          continue;
        }
        priorCharacters += length;
        priorEvidence.push(item);
      }
    }
    const applicable =
      role === 'procedure-specialist' && selectedAsset
        ? await executeTool(
            'getApplicableProcedures',
            { assetId: selectedAsset },
            idFor(role, 'applicable-rules', parent),
            async () => {
              const documents = await options.evidence.procedures(selectedAsset, options.signal);
              rememberDocuments(documents);
              return { documents };
            },
            { agent: role, parentToolCallId: parent },
          )
        : null;
    const agent = createOperatorAgent({
      role,
      model:
        role === 'evidence-investigator'
          ? (options.specialistModels?.evidence ?? options.model)
          : (options.specialistModels?.procedures ?? options.model),
      instructions: `${instructions}\nYour role: ${role}. Publishing/delegation tools are unavailable to specialists; return a compact source-backed investigation, not a final user answer; complete the investigation using only tools in your actual tool list. ${
        role === 'evidence-investigator'
          ? 'Investigate records, report narratives and calculations. Return supported findings, source IDs, uncertainty and useful structured tool results. Never invent cause.'
          : 'Read applicable SOPs/manuals including inherited procedures. Apply operative company clauses, not background industry examples. Follow maintenance report links for actual narrative containment/cleanup timings and repeated failures; structured records alone are insufficient. Link observations/report narratives/regulatory events to exact clauses. Compute deadlines from the triggering discovery/notice date and operative clause; assess against asOf, never the end of a narrower incident window. Distinguish established breach, overdue obligation, met, missing evidence and not assessed. Do not equate absence of records with absence of action or an open fine with nonpayment. Cite exact sources. This is an evidence-backed assessment, not a write or a new policy.'
      }\nAs-of: ${options.evidence.asOf}.`,
      tools: baseTools(role, parent, selectedAsset),
      maxSteps: 5,
      maxOutputTokens: 2000,
    });
    const result = await agent.generate({
      messages: [
        {
          role: 'user',
          content: `${question}${applicable ? `\nAlready retrieved applicable originals (use their source.id for citations):\n${JSON.stringify(modelProjection(applicable))}` : ''}${priorEvidence.length || omittedPriorEvidence ? `\nPreviously retrieved same-asset evidence from this run. Respect its coverage/warnings; use tools for missing details. Whole items omitted for context budget: ${omittedPriorEvidence}.\n${JSON.stringify(priorEvidence)}` : ''}`,
        },
      ],
      abortSignal: options.signal,
    });
    childUsage.push(result.totalUsage);
    childCalls.push(
      ...(result?.steps ?? []).flatMap((step) =>
        step.toolCalls.map((call) => ({
          toolCallId: idFor(role, call.toolCallId, parent),
          toolName: call.toolName,
          input: call.input,
          invalid: 'invalid' in call && call.invalid === true,
        })),
      ),
    );
    if (!result.text.trim() || result.finishReason !== 'stop')
      throw new Error('Specialist did not finish its investigation.');
    const findings = normalizeCitations(result.text);
    const citations = [...findings.matchAll(/\[([^\]\n]+)\]/g)].flatMap((match) =>
      match[1] ? [match[1]] : [],
    );
    if (!citations.length || citations.some((id) => !sources.has(id)))
      throw new Error('Specialist findings lack retrieved evidence.');
    return {
      agent: role,
      findings,
      sourceIds: citations,
      childToolCallIds: [
        ...new Set(
          trace
            .filter((event) => event.parentToolCallId === parent)
            .map((event) => event.toolCallId),
        ),
      ],
    };
  }
  const tools = {
    ...baseTools('coordinator'),
    ...(options.operatorContext
      ? {
          getOperatorContext: tool({
            description:
              'Read the actual acting operator, their team and explicit shared reports/private preferences. Does not expose other people’s private conversation history.',
            inputSchema: z.object({}).strict(),
            execute: (_, { toolCallId }) =>
              executeTool('getOperatorContext', {}, toolCallId, () =>
                options.operatorContext!.read(),
              ),
          }),
          recordOperatorMemory: tool({
            description:
              'Persist the CURRENT user’s explicit replacement report or private display preference with exact text and attribution. Hearsay remains unverified; this never rewrites work orders.',
            inputSchema: z
              .object({
                kind: z.enum(['replacement-report', 'preference']),
                assetId: assetId.optional(),
              })
              .strict(),
            execute: (input, { toolCallId }) =>
              executeTool('recordOperatorMemory', input, toolCallId, async () => {
                const memory = await options.operatorContext!.remember(input);
                const fact: ResultFact = {
                  id: `${runId}:memory:${facts.size + 1}`,
                  resultId: `${runId}:operator-memory`,
                  kind: 'reported',
                  text:
                    memory.kind === 'preference'
                      ? `Saved a private preference for ${memory.authorName}: ${JSON.stringify(memory.text)}. Source: ${memory.authorName}'s explicit request (${memory.id}); it is not shared with other people.`
                      : `Recorded ${memory.authorName}'s ${memory.confidence === 'hearsay' ? 'unverified second-hand' : 'direct operator'} report for ${memory.assetId}: ${JSON.stringify(memory.text)}. Source: ${memory.authorName} (${memory.authorId}), ${memory.at}, ${memory.id}. ${memory.confidence === 'hearsay' ? 'This does not establish a replacement and does not clear the recall.' : 'Replacement is operator-reported, awaiting a system work order; original maintenance records are preserved.'}`,
                  sourceIds: [],
                };
                facts.set(fact.id, fact);
                return { status: 'saved', memory, supportedFacts: [fact] };
              }),
          }),
        }
      : {}),
    ...(conversationViews
      ? {
          listConversationComponents: tool({
            description:
              'List this operator conversation’s recent components, newest first, with stable result/panel references, title, kind, measure, filters and source snapshot date. Resolve natural references like earlier cost table, that map, or put those together. No values are regenerated.',
            inputSchema: z.object({}).strict(),
            execute: (_input: unknown, { toolCallId }: { toolCallId: string }) =>
              executeTool('listConversationComponents', {}, toolCallId, async () => ({
                components: await conversationViews.list(),
                order: 'newest-first',
              })),
          }),
          reuseViewComponents: tool({
            description:
              'Include earlier components in this response’s ONE composed view using exact returned resultId/panelId references. Select all components the user wants to keep, including the latest map when adding an earlier table. Preserves original scope, values/evidence and recipes; presentation is bound automatically. Returns supported inclusion facts for publishAnswer.',
            inputSchema: z
              .object({
                components: z
                  .array(
                    z
                      .object({
                        resultId: z.string().min(1).max(256),
                        panelId: z.string().min(1).max(256),
                      })
                      .strict(),
                  )
                  .min(1)
                  .max(8),
              })
              .strict(),
            execute: (
              input: { components: { resultId: string; panelId: string }[] },
              { toolCallId }: { toolCallId: string },
            ) =>
              executeTool('reuseViewComponents', input, toolCallId, async () => {
                if (questionPlan?.responseMode !== 'visual')
                  return {
                    status: 'text-only',
                    reason:
                      'Validate this view-composition request with responseMode=visual before selecting components.',
                  };
                const available = await conversationViews.list();
                if (
                  input.components.some(
                    (reference) =>
                      !available.some(
                        (component) =>
                          component.resultId === reference.resultId &&
                          component.panelId === reference.panelId,
                      ),
                  )
                )
                  return {
                    status: 'invalid-component-reference',
                    reason:
                      'Use the exact paired resultId and panelId from these available original components. Tool result IDs are not saved application result IDs.',
                    components: available,
                  };
                const selected = await conversationViews.resolve(input.components);
                const supportedFacts = selected.map((component) => {
                  retainedComponents.set(`${component.resultId}:${component.panelId}`, component);
                  const fact: ResultFact = {
                    id: `${runId}:retained:${facts.size + 1}`,
                    resultId: `${runId}:retained-components`,
                    kind: 'view-reference',
                    text: `Included the earlier ${component.title} ${component.kind} with its original filters and source snapshot (${component.asOf}).`,
                    sourceIds: [],
                  };
                  facts.set(fact.id, fact);
                  return fact;
                });
                return {
                  status: 'bound',
                  components: selected,
                  supportedFacts,
                  remainingStep:
                    'Publish these supported facts; reused component presentations are already bound.',
                };
              }),
          }),
        }
      : {}),
    validateQuestion: tool({
      description:
        'REQUIRED first step: resolve the latest turn using prior USER intent and retained scope/window. Declare requestedQuantity before selecting a supported metric: oil-volume and production-forecast are unsupported, never status/downtime. Use method-explanation for metric definitions, capability for unavailable capabilities, source-passage for explanations from reports, incident-assessment plus open-records for deadlines/fines, analysis for supported totals/rankings. Default responseMode=text; visual for requested chart/map/table or multi-item comparison. Never omit a requested question part.',
      inputSchema: z
        .object({
          scope: z.enum(['asset', 'area', 'fleet', 'unresolved']),
          viewOperation: z.enum(['replace', 'extend']).default('replace'),
          requestedQuantity: z
            .enum([
              'current-status',
              'temperature-history',
              'downtime',
              'spills',
              'repair-costs',
              'repeat-repairs',
              'oil-volume',
              'production-forecast',
              'documents',
              'method-definition',
              'unknown',
              'operational-assessment',
              'operator-memory',
              ...operationalTopics,
            ])
            .optional(),
          responseMode: z
            .enum(['text', 'visual'])
            .default('text')
            .describe(
              'Text for explanations, one answer or just-one requests. Visual only for requested charts/maps/tables/dashboards or multi-item comparisons.',
            ),
          assetIds: z.array(assetId).max(200).default([]),
          area: z.string().min(1).max(120).optional(),
          window: z
            .object({ from: z.iso.date(), through: z.iso.date() })
            .refine((v) => v.from <= v.through)
            .optional(),
          metric: z
            .enum([
              'current-status',
              'temperature-history',
              'downtime',
              'spills',
              'repair-costs',
              'repeat-repairs',
            ])
            .optional(),
          parts: z
            .array(
              z
                .object({
                  id: z.string().min(1).max(60),
                  question: z.string().min(1).max(500),
                  needs: needSchema,
                })
                .strict(),
            )
            .min(1)
            .max(8),
        })
        .strict(),
      execute: (plan) => {
        const latest = messages.filter((message) => message.role === 'user').at(-1)?.content ?? '';
        // Explicit presentation requests are a wire invariant, not a stochastic reviewer decision.
        if (
          !/\b(?:text[- ]only|no (?:chart|map|table)|without (?:a )?(?:chart|map|table))\b/i.test(
            latest,
          ) &&
          /\b(?:(?:show|give|make|create|draw|plot)\b[^.!?]{0,100}\b(?:table|chart|map|graph)|(?:chart|plot|map) (?:this|that|the|these)|on (?:a |one |the )?map)\b/i.test(
            latest,
          )
        )
          plan.responseMode = 'visual';
        if (
          plan.requestedQuantity === 'oil-volume' ||
          plan.requestedQuantity === 'production-forecast'
        )
          unsupportedQuantity ??= plan.requestedQuantity;
        if (measureClarification) {
          unsupportedQuantity = undefined;
          plan.requestedQuantity = 'method-definition';
          plan.responseMode = 'text';
          plan.parts = [
            {
              id: 'measure-clarification',
              question:
                messages
                  .filter((m) => m.role === 'user')
                  .at(-1)
                  ?.content.slice(0, 500) ?? 'Clarify the previous measure',
              needs: 'method-explanation',
            },
          ];
        }
        mixedCapabilities =
          !!unsupportedQuantity &&
          plan.parts.some((part) => part.needs === 'capability') &&
          plan.parts.some((part) => part.needs !== 'capability');
        if (unsupportedQuantity && !mixedCapabilities) {
          plan.metric = undefined;
          plan.window = undefined;
          plan.responseMode = 'text';
          plan.parts = [
            {
              id: 'unsupported-quantity',
              question:
                messages
                  .filter((m) => m.role === 'user')
                  .at(-1)
                  ?.content.slice(0, 500) ?? 'Requested production quantity',
              needs: 'capability',
            },
          ];
        }
        if (
          requestedAssets.size &&
          (plan.viewOperation === 'extend'
            ? [...requestedAssets].some((id) => !plan.assetIds.includes(id)) ||
              plan.assetIds.some(
                (id) =>
                  !requestedAssets.has(id) &&
                  !messages.slice(0, -1).some((message) => message.content.includes(id)),
              )
            : plan.assetIds.length !== requestedAssets.size ||
              plan.assetIds.some((id) => !requestedAssets.has(id)))
        )
          return {
            status: 'invalid-scope',
            reason:
              'Plan must retain every explicitly requested asset and introduce no other asset.',
          };
        if (new Set(plan.parts.map((part) => part.id)).size !== plan.parts.length)
          return { status: 'invalid-parts', reason: 'Question part IDs must be unique.' };
        if (
          (plan.scope === 'area' && !plan.area) ||
          (plan.scope === 'asset' && !plan.assetIds.length)
        )
          return { status: 'unresolved-scope', reason: 'An area or asset identifier is required.' };
        if (!plan.parts.some((part) => part.needs === 'analysis' || part.needs === 'status'))
          plan.metric = undefined;
        if (plan.metric === 'current-status') plan.window = undefined; // Latest observation is bounded by server asOf, not an invented historical window.
        questionPlan = plan;
        bindAssessmentDefaults();
        return {
          status: 'validated',
          plan,
          warning:
            'Actual executed query parameters and question coverage are checked independently. Unclear interpretation remains a limitation.',
        };
      },
    }),
    explainCapability: tool({
      description:
        'Explain a calculation in plain language, or why oil volume / production forecasts are unavailable. No measurement query and no UI. Returns backend-authored supported facts for publishAnswer. Use for what-does-this-mean and to correct an earlier substitution of downtime/status for oil output.',
      inputSchema: z
        .object({
          topic: z.enum([
            'current-status',
            'temperature-history',
            'downtime',
            'spills',
            'repair-costs',
            'repeat-repairs',
            'oil-volume',
            'production-forecast',
            'available-capabilities',
            'missing-asset',
            'missing-window',
            'missing-measure',
          ]),
        })
        .strict(),
      execute: ({ topic }, { toolCallId }) =>
        executeTool('explainCapability', { topic }, toolCallId, async () => {
          const resolvedTopic = measureClarification
            ? 'oil-volume'
            : !mixedCapabilities && unsupportedQuantity
              ? unsupportedQuantity
              : topic;
          const fact: ResultFact = {
            id: `${runId}:explanation:${resolvedTopic}`,
            resultId: `${runId}:explanation`,
            kind: resolvedTopic.startsWith('missing-')
              ? 'clarification'
              : !measureClarification &&
                  (resolvedTopic === 'oil-volume' || resolvedTopic === 'production-forecast')
                ? 'capability'
                : 'definition',
            text: explanationText(resolvedTopic, messages),
            sourceIds: [],
          };
          facts.set(fact.id, fact);
          return {
            topic: resolvedTopic,
            supportedFacts: [fact],
            basis: 'implemented-tool-capabilities-and-metric-catalogue',
            createsPanel: false,
          };
        }),
    }),
    describeMetric: tool({
      description:
        'Inspect supported metric meanings, units, grain, filters and view types. Does not calculate values.',
      inputSchema: z.object({}).strict(),
      execute: () => metricCatalogue,
    }),
    inspectResult: tool({
      description:
        'Read immutable results and supported factual sentences from this run, by resultRef. No new query or numerical reconstruction. Use these fact IDs for publishAnswer.',
      inputSchema: z
        .object({
          resultId: z.string().min(1),
          offset: z.number().int().min(0).default(0),
          limit: z.number().int().min(1).max(40).default(12),
        })
        .strict(),
      execute: ({ resultId, offset, limit }) => {
        const result = dataResults.find((item) => item.id === resultId);
        if (!result) return { status: 'not-found' };
        const all = [...facts.values()].filter((fact) => fact.resultId === resultId);
        return {
          resultId,
          parameters: result.parameters,
          units: result.units,
          coverage: result.coverage,
          warnings: result.warnings,
          facts: all.slice(offset, offset + limit),
          totalFacts: all.length,
        };
      },
    }),
    presentResult: tool({
      description:
        'Bind an existing resultRef to a supported component; ranking renders a horizontal BAR CHART with exact values (including regional temperatures). bar renders stacked repair-delay shares. No generated values, SQL or transformations.',
      inputSchema: z
        .object({
          resultId: z.string().min(1),
          component: z.enum(['status', 'table', 'ranking', 'series', 'geo', 'matrix', 'bar']),
        })
        .strict(),
      execute: ({ resultId, component }) => {
        if (questionPlan?.responseMode !== 'visual')
          return {
            status: 'text-only',
            reason:
              'This turn requests a textual answer. Result references support the answer without creating UI.',
          };
        const result = dataResults.find((item) => item.id === resultId);
        if (!result) return { status: 'not-found' };
        const metric = result.kind === 'analysis' ? result.payload.metric : null;
        const allowed: readonly string[] =
          result.kind === 'asset-locations'
            ? ['geo', 'table']
            : metric
              ? metricCatalogue[metric].presentations
              : result.kind === 'asset-overview'
                ? ['status', 'table']
                : result.kind === 'operational-assessment' &&
                    (result.parameters as { topic: string }).topic === 'repair-delays'
                  ? ['table', 'bar']
                  : ['table', 'ranking'];
        if (!allowed.includes(component)) return { status: 'unsupported-presentation', allowed };
        if (
          component === 'matrix' &&
          (result.parameters as { groupBy?: string }).groupBy !== 'area-month'
        )
          return {
            status: 'unsupported-presentation',
            reason: 'Matrix requires area-month grouping in the original executed query.',
          };
        const asksChart = /\b(?:chart|graph|plot)\b/i.test(
          messages.filter((m) => m.role === 'user').at(-1)?.content ?? '',
        );
        const comparisonChart =
          result.kind === 'operational-assessment' &&
          ['regional-temperatures', 'inspection-summary'].includes(
            (result.parameters as { topic: string }).topic,
          );
        const chosen =
          comparisonChart && asksChart && component === 'table'
            ? 'ranking'
            : result.kind === 'operational-assessment' &&
                (result.parameters as { topic: string }).topic === 'repair-delays' &&
                component === 'table' &&
                !/table only|only a table|no chart|without.*chart/i.test(
                  messages.filter((m) => m.role === 'user').at(-1)?.content ?? '',
                )
              ? 'bar'
              : component;
        presentations.set(resultId, chosen);
        return { status: 'bound', resultId, component: chosen, integrity: result.integrity };
      },
    }),
    publishAnswer: tool({
      description:
        'REQUIRED final step. Select resultRefs and optional fact/passage IDs. For a canonical operational table, pass its resultRef and write a short explanation interpreting the supplied facts/table/policy evidence, with source citations. Explain outcome, scope, relevant caveats and why; do not repeat every table row. Values in visuals remain backend-authored. Never invent quantities, measurements or causes. If explanation is omitted, backend summary facts are used. Stop after successful publication.',
      inputSchema: z
        .object({
          factIds: z.array(z.string()).max(100).default([]),
          passageIds: z.array(z.string()).max(12).default([]),
          resultIds: z.array(z.string()).max(8).default([]),
          explanation: z
            .string()
            .min(1)
            .max(8000)
            .optional()
            .describe(
              'Concise operator-facing interpretation grounded only in selected current tool results, facts and actual governing sources. Cite actual source IDs. Label judgements as evidence-based judgement, never calibrated prediction. Does not alter table/chart values.',
            ),
        })
        .strict(),
      execute: async ({ factIds, passageIds, resultIds, explanation }) => {
        if (explanation && !options.evaluatorModel)
          return {
            status: 'review-required',
            reason: 'Grounded explanatory prose requires the configured final evaluator.',
          };
        if (
          new Set(factIds).size !== factIds.length ||
          factIds.some((id) => !facts.has(id)) ||
          passageIds.some((id) => !passages.has(id)) ||
          resultIds.some(
            (id) =>
              !dataResults.some((result) => result.id === id) &&
              ![...facts.values()].some((fact) => fact.resultId === id) &&
              ![...retainedComponents.values()].some((component) => component.resultId === id),
          )
        )
          return {
            status: 'invalid-reference',
            reason:
              'Use resultIds with the exact resultRef below; omit optional factIds instead of inventing IDs.',
            availableResultRefs: dataResults.map((result) => ({
              resultRef: result.id,
              kind: result.kind,
            })),
          };
        const selected = factIds.flatMap((id) =>
          facts.has(id) ? [facts.get(id) as ResultFact] : [],
        );
        // A canonical table carries every row. Publish concise summaries instead of retyping it.
        const assessmentIds = new Set(
          [...resultIds, ...presentations.keys(), ...selected.map((fact) => fact.resultId)].filter(
            (id) =>
              dataResults.some(
                (result) =>
                  result.id === id &&
                  result.kind === 'operational-assessment' &&
                  presentations.has(id),
              ),
          ),
        );
        for (const id of assessmentIds) {
          const result = dataResults.find((result) => result.id === id)!;
          const compiled = resultFacts(result);
          const summary = compiled.filter(
            (fact, index) =>
              index === 0 ||
              fact.kind === 'unknown' ||
              (result.kind === 'operational-assessment' && result.payload.rows.length <= 3),
          );
          for (let index = selected.length - 1; index >= 0; index--)
            if (selected[index]?.resultId === id) selected.splice(index, 1);
          selected.push(...summary);
        }
        if (!selected.length && !passageIds.length)
          for (const id of resultIds) {
            const result = dataResults.find((item) => item.id === id);
            if (result) {
              const summary = resultFacts(result)[0];
              if (summary) selected.push(summary);
            } else selected.push(...[...facts.values()].filter((fact) => fact.resultId === id));
          }
        if (unsupportedQuantity && !selected.some((fact) => fact.kind === 'capability'))
          return {
            status: 'unsupported-quantity',
            reason:
              'Use explainCapability and publish its supported limitation; operational metrics cannot answer this requested quantity.',
          };
        const quotes = passageIds.map((id) => passages.get(id)).filter((item) => !!item);
        if (!selected.length && !quotes.length)
          return {
            status: 'empty-answer',
            reason: 'Read relevant evidence and select supported facts or exact passages.',
          };
        // A corrected total cannot be published without its actual correction explanation.
        for (const resultId of new Set(selected.map((fact) => fact.resultId))) {
          const result = dataResults.find((item) => item.id === resultId);
          if (result?.kind === 'incident-timings')
            for (const fact of resultFacts(result))
              if (!selected.some((item) => item.id === fact.id)) selected.push(fact);
          if (
            result?.kind === 'analysis' &&
            'correctionAudit' in result.payload &&
            result.payload.correctionAudit?.length
          ) {
            for (const fact of resultFacts(result).filter((item) => item.kind === 'reported'))
              if (!selected.some((item) => item.id === fact.id)) selected.push(fact);
          }
        }
        if (!questionPlan)
          return {
            status: 'question-not-validated',
            reason: 'Call validateQuestion before publishing.',
          };
        const selectedIds = [
          ...new Set([
            ...resultIds,
            ...presentations.keys(),
            ...selected.map((fact) => fact.resultId),
          ]),
        ];
        const selectedResults = dataResults.filter((result) => selectedIds.includes(result.id));
        if (
          questionPlan.responseMode === 'visual' &&
          selectedResults.length &&
          !selectedResults.some((result) => presentations.has(result.id)) &&
          !retainedComponents.size
        )
          return {
            status: 'presentation-required',
            reason:
              'The user requested a visual. Call presentResult with a selected resultRef: table for records, ranking for a comparison bar chart, bar for repair-delay shares, geo for recorded locations. Then publish again.',
          };

        if (questionPlan.scope === 'asset') {
          const actualAssets = [
            ...new Set(
              selectedResults.flatMap((result) =>
                result.kind === 'asset-locations'
                  ? result.payload.rows.map((row) => row.assetId)
                  : (result.parameters as { assetId?: string; assetIds?: string[] }).assetId
                    ? [(result.parameters as { assetId: string }).assetId]
                    : ((result.parameters as { assetIds?: string[] }).assetIds ?? []),
              ),
            ),
          ];
          if (actualAssets.length) questionPlan.assetIds = actualAssets;
        }
        const parts = questionPlan.parts.map((part) => {
          const priorMatches = [...retainedComponents.values()].filter(
            (component) =>
              part.needs === 'view-composition' ||
              (part.needs === 'location' && component.quantity === 'recorded-asset-location') ||
              (part.needs === 'analysis' &&
                ['table', 'ranking', 'series', 'matrix'].includes(component.kind)) ||
              (part.needs === 'status' &&
                component.quantity === 'measured-production-classification'),
          );
          const matches = selectedResults.filter((result) =>
            result.kind === 'operational-assessment' &&
            [
              'operational-assessment',
              'analysis',
              'status',
              'incident-assessment',
              'open-records',
              'source-passage',
              'relationship-trace',
            ].includes(part.needs)
              ? true
              : part.needs === 'location'
                ? result.kind === 'asset-locations'
                : part.needs === 'status'
                  ? result.kind === 'asset-overview' ||
                    (result.kind === 'analysis' && result.payload.metric === 'current-status')
                  : part.needs === 'analysis'
                    ? result.kind === 'analysis' || result.kind === 'operational-assessment'
                    : part.needs === 'operational-assessment'
                      ? result.kind === 'operational-assessment'
                      : part.needs === 'incident-assessment'
                        ? result.kind === 'incident-timings'
                        : part.needs === 'open-records'
                          ? result.kind === 'operational-records' ||
                            result.kind === 'incident-timings'
                          : part.needs === 'relationship-trace'
                            ? result.kind === 'relationships'
                            : false,
          );
          const partResultIds = [
            ...new Set([
              ...matches.map((result) => result.id),
              ...priorMatches.map((component) => component.resultId),
              ...(part.needs === 'source-passage'
                ? selected.filter((fact) => fact.kind === 'reported').map((fact) => fact.resultId)
                : []),
            ]),
          ];
          return {
            id: part.id,
            question: part.question,
            status:
              matches.length ||
              priorMatches.length ||
              (part.needs === 'memory' &&
                selected.some((fact) => fact.resultId === `${runId}:operator-memory`)) ||
              (part.needs === 'method-explanation' &&
                selected.some((fact) => fact.kind === 'definition')) ||
              (part.needs === 'source-passage' &&
                (quotes.length || selected.some((fact) => fact.kind === 'reported')))
                ? ('answered' as const)
                : ('unanswered' as const),
            resultIds: partResultIds,
            sourceIds: [
              ...new Set([
                ...matches.flatMap((result) => result.sources.map((source) => source.id)),
                ...(part.needs === 'source-passage'
                  ? [
                      ...quotes.map((quote) => quote.sourceId),
                      ...selected
                        .filter((fact) => fact.kind === 'reported')
                        .flatMap((fact) => fact.sourceIds),
                    ]
                  : []),
              ]),
            ].slice(0, 100),
          };
        });
        questionCoverage = {
          method: 'declared-parts-and-result-references',
          status: parts.every((part) => part.status === 'answered')
            ? 'complete'
            : parts.some((part) => part.status === 'answered')
              ? 'partial'
              : 'unavailable',
          parts,
        };
        const factualText =
          [
            renderFacts(selected),
            ...quotes.map(
              (quote) =>
                `Source excerpt:\n\n${quote.text
                  .split('\n')
                  .map((line) => `> ${line}`)
                  .join('\n')}\n\n[${quote.sourceId}]`,
            ),
          ]
            .filter(Boolean)
            .join('\n\n') +
          (questionCoverage.status !== 'complete' &&
          !selected.some((fact) => fact.kind === 'capability' || fact.kind === 'clarification')
            ? `\n\nNot answered: ${parts
                .filter((part) => part.status === 'unanswered')
                .map((part) => part.question)
                .join('; ')}. Supporting evidence or capability is missing.`
            : '');
        // Keep immutable, explicitly selected visual results even if narrative review fails.
        // This is a partial result, never an approval of the rejected prose or task coverage.
        const canonicalIds = selectedResults
          .filter((result) => presentations.has(result.id))
          .map((result) => result.id);
        if (canonicalIds.length)
          retainedCandidate = {
            text: factualText,
            resultIds: canonicalIds,
            warnings: retainedCandidate?.warnings ?? [],
          };
        const text = explanation ?? factualText;
        let publicationWarnings: string[] = [];
        if (options.evaluatorModel) {
          if (++evaluationAttempts > 2)
            return {
              status: 'revision-limit',
              reason:
                'Final evaluation did not accept a supported answer within the revision budget.',
            };
          const review = await executeTool(
            'evaluateAnswer',
            { attempt: evaluationAttempts },
            `final-evaluation-${evaluationAttempts}`,
            async () => {
              // Exact, server-authored capability limits need no stochastic veto or paid query.
              // Only independently recognized unsupported intent qualifies; model-declared limits still get semantic review.
              if (
                independentlyUnsupportedQuantity &&
                unsupportedQuantity === independentlyUnsupportedQuantity &&
                selected.length === 1 &&
                selected[0]?.kind === 'capability' &&
                selected[0].text === explanationText(independentlyUnsupportedQuantity, messages) &&
                !quotes.length &&
                !selectedResults.length &&
                !presentations.size
              )
                return {
                  verdict: 'accept' as const,
                  reasons: [],
                  basis: 'deterministic-capability-contract',
                };
              const evaluation = await evaluateFinalAnswer({
                model: options.evaluatorModel as LanguageModel,
                messages,
                signal: options.signal,
                candidate: {
                  text,
                  questionPlan,
                  questionCoverage,
                  facts: selected.map(({ text, kind, resultId }) => ({ text, kind, resultId })),
                  passages: quotes.map(({ text, sourceId }) => ({ text, sourceId })),
                  bindings: Object.fromEntries(
                    [...presentations]
                      .filter(([id]) => selectedIds.includes(id))
                      .concat(
                        [...retainedComponents.values()].map((component) => [
                          `${component.resultId}:${component.panelId}`,
                          component.kind,
                        ]),
                      ),
                  ),
                  reusedComponents: [...retainedComponents.values()],
                  results: selectedResults.map((result) => ({
                    id: result.id,
                    kind: result.kind,
                    parameters: result.parameters,
                    coverage: result.coverage,
                    ...(result.kind === 'operational-assessment'
                      ? {
                          governingEvidence: result.payload.governingEvidence,
                          canonicalTable: {
                            title: result.payload.title,
                            columns: result.payload.columns,
                            rows: result.payload.rows.map(({ _sourceIds, ...row }) =>
                              Object.fromEntries(
                                Object.entries(row).map(([key, value]) => [
                                  key,
                                  typeof value === 'string' && value.length > 1200
                                    ? `${value.slice(0, 1200)} [evidence preview abbreviated]`
                                    : value,
                                ]),
                              ),
                            ),
                            warnings: result.payload.warnings,
                          },
                        }
                      : {}),
                  })),
                },
              });
              childUsage.push(evaluation.usage);
              return evaluation.verdict;
            },
            { agent: 'final-evaluator' },
          );
          if (
            review.verdict !== 'accept' &&
            'severity' in review &&
            review.severity === 'improvement'
          )
            publicationWarnings = []; // Nonblocking editor suggestions stay in the trace, not operator warnings.
          else if (review.verdict !== 'accept') {
            if (retainedCandidate) retainedCandidate.warnings = review.reasons;
            return {
              status: 'revision-required',
              feedback: review.reasons,
              reason:
                'Correct the requested outcome/scope/explanation/presentation with tools, then publish again. Do not merely repeat this candidate.',
            };
          }
        }
        published = {
          text,
          warnings: publicationWarnings,
          resultIds: [
            ...new Set([
              ...resultIds,
              ...presentations.keys(),
              ...selected.map((fact) => fact.resultId),
            ]),
          ].filter((id) => dataResults.some((result) => result.id === id)),
          mode: explanation
            ? 'grounded-synthesis'
            : quotes.length
              ? 'quoted-evidence'
              : 'deterministic-facts',
        };
        return { status: 'published', text, resultIds: published.resultIds };
      },
    }),
    investigateEvidence: tool({
      description:
        'Delegate a multi-source operational/history/root-cause investigation to the evidence investigator. Pass the exact question, selected IDs and date window. Returns findings and real child tool lineage.',
      inputSchema: z.object({ question: z.string().min(1).max(4000) }).strict(),
      execute: ({ question }, { toolCallId }) =>
        executeTool('investigateEvidence', { question }, toolCallId, () =>
          specialist('evidence-investigator', question, toolCallId),
        ),
    }),
    assessProcedures: tool({
      description:
        'Delegate applicable manuals/SOPs and evidence-backed obligation assessment to the procedure specialist. Include assets, dates and specific protocols/question. Returns cited findings with unknowns.',
      inputSchema: z.object({ assetId, question: z.string().min(1).max(4000) }).strict(),
      execute: ({ assetId, question }, { toolCallId }) =>
        executeTool('assessProcedures', { assetId, question }, toolCallId, () =>
          specialist('procedure-specialist', question, toolCallId, assetId),
        ),
    }),
  };
  const observedTools: ToolSet = tools;
  for (const name of ['validateQuestion', 'presentResult', 'publishAnswer']) {
    const definition = observedTools[name],
      execute = definition?.execute;
    if (definition && execute)
      observedTools[name] = {
        ...definition,
        execute: async (input: unknown, context: ToolExecutionOptions<unknown>) => {
          emit({
            type: 'tool-start',
            toolName: name,
            toolCallId: context.toolCallId,
            input,
            agent: 'coordinator',
          });
          const output = await execute(input, context);
          emit({
            type: 'tool-result',
            toolCallId: context.toolCallId,
            output,
            agent: 'coordinator',
          });
          return output;
        },
      };
  }
  const agent = createOperatorAgent({
    role: 'coordinator',
    model: options.model,
    instructions: `${instructions}\nAvailable tools: ${Object.keys(tools).join(', ')}. Call only these actual tools. Return only the final operator answer, without planning commentary.\nAs-of: ${options.evidence.asOf}.`,
    tools,
    maxSteps: 12,
    maxOutputTokens: 2400,
    requireInitialTool: true,
  });
  const result = await agent
    .generate({ messages, abortSignal: options.signal })
    .catch((error: unknown) => {
      options.signal?.throwIfAborted();
      if (!dataResults.length) throw error;
      return null; // Materialized data remains inspectable; generated narrative is not accepted.
    });
  const finalText =
    published?.text ??
    (retainedCandidate
      ? `The source-backed results are shown below. I could not verify the explanatory summary, so treat this as a partial answer.\n\n${retainedCandidate.text}`
      : 'I could not verify an answer to this question. No result has been confirmed.');
  if (!published && questionCoverage)
    questionCoverage = {
      ...questionCoverage,
      status: retainedCandidate ? 'partial' : 'unavailable',
      parts: questionCoverage.parts.map((part) => ({ ...part, status: 'unanswered' as const })),
    };
  const explanationWarnings = published
    ? (published.warnings ?? [])
    : [
        ...(retainedCandidate
          ? [
              'Canonical tool results are retained; explanatory prose was withheld because final review did not accept it.',
              ...retainedCandidate.warnings,
            ]
          : [
              'The model did not publish a supported final answer; no free-text factual explanation was accepted.',
            ]),
      ];
  const answerSupport = {
    mode: published?.mode ?? ('unavailable' as const),
    explanationStatus: published ? ('available' as const) : ('unavailable' as const),
    warnings: explanationWarnings,
  };
  const usage = Object.fromEntries(
    ['inputTokens', 'outputTokens', 'totalTokens'].map((key) => {
      const values = [result?.totalUsage ?? {}, ...childUsage].map(
        (item) => item[key as keyof ModelObservation['usage']],
      );
      return [
        key,
        values.every((value) => typeof value === 'number')
          ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
          : undefined,
      ];
    }),
  ) as ModelObservation['usage'];
  options.onModelResult?.({
    text: finalText,
    answerSupport,
    questionCoverage,
    finishReason: published ? 'stop' : (result?.finishReason ?? 'error'),
    usage,
    toolCalls: [
      ...childCalls,
      ...(result?.steps ?? []).flatMap((step) =>
        step.toolCalls.map((call) => ({
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: call.input,
          invalid: 'invalid' in call && call.invalid === true,
        })),
      ),
    ],
    sources: [...sources.values()],
  });
  options.signal?.throwIfAborted();
  if (!trace.some((event) => event.type === 'tool-result'))
    throw new Error('Answer has no successful evidence tools.');
  return {
    runId,
    text: finalText,
    answerSupport,
    questionCoverage,
    resolvedScope: questionPlan
      ? {
          scope: questionPlan.scope,
          assetIds: questionPlan.assetIds,
          area: questionPlan.area,
          metric: questionPlan.metric,
          window: questionPlan.window,
        }
      : undefined,
    selectedResultIds: published?.resultIds ?? retainedCandidate?.resultIds ?? [],
    reusedComponents: published ? [...retainedComponents.values()] : [],
    presentationBindings: Object.fromEntries(presentations),
    visuals: [...visuals.values()],
    dataResults,
    sources: [...sources.values()],
    trace,
    usage,
  };
}
