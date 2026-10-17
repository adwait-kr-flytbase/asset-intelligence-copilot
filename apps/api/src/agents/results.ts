import type { AnalyticsService } from '../evidence/analytics.js';
import type { assessIncidentTimings } from '../evidence/incident-timings.js';
import type { locateAssets } from '../evidence/locations.js';
import type { OperationalAssessment } from '../evidence/operations/types.js';
import type { traceAssetRelationships } from '../evidence/relationships.js';
import type { EvidenceService } from '../evidence/service.js';
import type { Source } from '../evidence/types.js';
import { resultIntegrity } from './result-integrity.js';

type Payloads = {
  'operational-assessment': OperationalAssessment;
  'asset-locations': Awaited<ReturnType<typeof locateAssets>>;
  relationships: Awaited<ReturnType<typeof traceAssetRelationships>>;
  'incident-timings': Awaited<ReturnType<typeof assessIncidentTimings>>;
  'asset-overview': Awaited<ReturnType<EvidenceService['overview']>>;
  analysis: Awaited<ReturnType<AnalyticsService['analyze']>>;
  'operational-records': Awaited<ReturnType<AnalyticsService['records']>>;
  deadline: {
    triggerDate: string;
    withinDays: number;
    dueDate: string;
    assessedDate: string;
    asOf: string;
    precision: string;
    overdueCalendarDays: number;
    dueState: string;
    completion: string;
    inputSourceIds: string[];
    warnings: string[];
    protocolId?: string;
    completionEvidence?: { status: string; completedDate?: string | null };
    sources?: Source[];
  };
};
export type AgentDataResult = {
  [Kind in keyof Payloads]: {
    schemaVersion: 1;
    id: string;
    runId: string;
    toolCallId: string;
    operation: string;
    kind: Kind;
    readOnly: true;
    integrity: ReturnType<typeof resultIntegrity>;
    availability: 'available' | 'partial' | 'unavailable';
    coverage: Record<string, unknown> | null;
    warnings: string[];
    parameters: unknown;
    asOf: string;
    evaluatedAt: string;
    presentation: { preferredKind: string };
    units: Record<string, string>;
    sources: Source[];
    payload: Payloads[Kind];
  };
}[keyof Payloads];

const operations: Record<string, keyof Payloads> = {
  assessOperations: 'operational-assessment',
  locateAssets: 'asset-locations',
  traceRelationships: 'relationships',
  assessIncidentTimings: 'incident-timings',
  getOperationalContext: 'asset-overview',
  analyzeAssetOperations: 'analysis',
  analyzeAreaOperations: 'analysis',
  analyzeFleetOperations: 'analysis',
  getOperationalRecords: 'operational-records',
  calculateDeadline: 'deadline',
  assessDeadline: 'deadline',
};

/** Wrap trusted domain-service outputs, never model-authored facts or UI/code. */
export function describeDataResult(input: {
  operation: string;
  output: unknown;
  parameters: unknown;
  runId: string;
  toolCallId: string;
  asOf: string;
  sources: ReadonlyMap<string, Source>;
}): AgentDataResult | undefined {
  const kind = operations[input.operation];
  if (
    !kind ||
    (input.operation === 'assessDeadline' &&
      (input.output as { status?: string }).status !== 'assessed')
  )
    return;
  const payload = input.output as Record<string, unknown>;
  const metric = payload.metric;
  const warnings = Array.isArray(payload.warnings) ? (payload.warnings as string[]) : [];
  const coverage =
    payload.coverage && typeof payload.coverage === 'object'
      ? (payload.coverage as Record<string, unknown>)
      : null;
  const unavailable = payload.status === 'not-found' || payload.status === 'unresolved-selection';
  const partial =
    warnings.length > 0 ||
    coverage?.truncated === true ||
    (kind === 'asset-overview' && payload.production === null);
  const units: Record<string, string> =
    metric === 'downtime'
      ? { downtimeDays: 'days' }
      : metric === 'repair-costs'
        ? { totalUsd: 'USD' }
        : metric === 'spills'
          ? { volumeBbl: 'bbl', totalBbl: 'bbl', spillCount: 'count' }
          : kind === 'deadline'
            ? { withinDays: 'calendar-days', overdueCalendarDays: 'calendar-days' }
            : kind === 'asset-overview' ||
                metric === 'temperature-history' ||
                metric === 'current-status'
              ? { ambientC: '°C', wellheadC: '°C', deltaC: '°C', thresholdC: '°C' }
              : {};
  const sourceRefs = Array.isArray(payload.sources)
    ? (payload.sources as Source[])
    : Array.isArray(payload.inputSourceIds)
      ? payload.inputSourceIds.flatMap((id) => {
          const source = typeof id === 'string' ? input.sources.get(id) : undefined;
          return source ? [source] : [];
        })
      : [];
  const presentation = payload.presentation as { kind?: string } | undefined;
  // Operation-to-kind mapping above binds the payload produced by that typed service.
  return {
    schemaVersion: 1,
    id: `${input.runId}:${input.toolCallId}`,
    runId: input.runId,
    toolCallId: input.toolCallId,
    operation: input.operation,
    kind,
    readOnly: true,
    integrity: resultIntegrity(input.operation, input.parameters, input.output),
    availability: unavailable ? 'unavailable' : partial ? 'partial' : 'available',
    coverage,
    warnings,
    parameters: input.parameters,
    asOf: input.asOf,
    evaluatedAt: new Date().toISOString(),
    presentation: {
      preferredKind: presentation?.kind ?? (kind === 'asset-overview' ? 'well-status' : 'table'),
    },
    units,
    sources: sourceRefs,
    payload: input.output,
  } as AgentDataResult;
}
