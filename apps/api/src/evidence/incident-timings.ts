import type { AnalyticsService } from './analytics.js';
import { assessSupportedDeadline } from './deadlines.js';
import type { EvidenceService } from './service.js';
import type { Source } from './types.js';

/** Narrow supported parsing of company clauses and retained incident observations, not arbitrary policy inference. */
export async function assessIncidentTimings(
  assetId: string,
  inspectionId: string,
  evidence: EvidenceService,
  analytics: AnalyticsService,
  signal?: AbortSignal,
) {
  const record = await evidence.record('inspection', inspectionId, signal);
  if (!record)
    return {
      status: 'not-assessed' as const,
      reason: 'Inspection unavailable.',
      sources: [] as Source[],
      findings: [],
    };
  const raw = JSON.parse(record.text) as Record<string, unknown>;
  if (
    raw.asset_id !== assetId ||
    raw.spill_detected !== true ||
    typeof raw.inspected_at !== 'string' ||
    Date.parse(raw.inspected_at) > Date.parse(evidence.asOf)
  )
    return {
      status: 'not-assessed' as const,
      reason: 'Inspection does not establish this spill/scope.',
      sources: [record.source],
      findings: [],
    };
  const rules = await evidence.procedures(assetId, signal);
  const records = await analytics.records(
    assetId,
    { from: raw.inspected_at.slice(0, 10), through: evidence.asOf.slice(0, 10) },
    signal,
  );
  const recordRows = records.records.filter(
    (value): value is Record<string, unknown> => !!value && typeof value === 'object',
  );
  const jobs = recordRows.filter(
    (value) =>
      'inspectionId' in value &&
      value.inspectionId === inspectionId &&
      'reportId' in value &&
      value.reportId,
  );
  const candidateReports = await Promise.all(
    jobs.map((job) => evidence.read(String((job as { reportId: string }).reportId), signal)),
  );
  const reports = candidateReports.filter((report) => report?.assetId === assetId);
  const sources = [
    record.source,
    ...records.sources,
    ...reports.flatMap((doc) => (doc ? [doc.source] : [])),
  ];
  const findings: {
    protocolId: string;
    observedHours: number | null;
    limitHours: number | null;
    status: 'missed' | 'met' | 'not-assessed';
    sources: Source[];
  }[] = [];
  for (const protocolId of ['SR-01', 'SR-02']) {
    const clauses = rules.flatMap((doc) =>
      doc.markdown
        .split('\n')
        .flatMap((line, index) =>
          line.startsWith(`| **${protocolId}** |`)
            ? [{ doc, line: line.replaceAll('**', ''), index }]
            : [],
        ),
    );
    const rule = clauses.length === 1 ? clauses[0] : undefined;
    const hourMatches = rule ? [...rule.line.matchAll(/within\s+(\d+)\s+hours/gi)] : [];
    const isMajor = Number(raw.spill_est_volume_bbl) >= 25;
    const reportable = Number(raw.spill_est_volume_bbl) >= 5;
    const limit =
      protocolId === 'SR-01' && !reportable
        ? null
        : Number(hourMatches[protocolId === 'SR-01' && isMajor ? 1 : 0]?.[1] ?? NaN);
    let measured: number[] = [];
    if (protocolId === 'SR-01')
      measured = recordRows.flatMap((value) =>
        'inspectionId' in value &&
        value.inspectionId === inspectionId &&
        'type' in value &&
        value.type === 'spill_report_filed' &&
        'hoursToReport' in value &&
        value.hoursToReport !== null
          ? [Number(value.hoursToReport)]
          : [],
      );
    else
      measured = reports.flatMap((doc) =>
        doc && doc.assetId === assetId
          ? [
              ...doc.markdown
                .replaceAll('**', '')
                .matchAll(/contained\s+(?:about\s+)?(\d+(?:\.\d+)?)\s+hours\s+after/gi),
            ].map((match) => Number(match[1]))
          : [],
      );
    const unique = [...new Set(measured)].filter((n) => Number.isFinite(n) && n >= 0);
    const observedHours = unique.length === 1 ? (unique[0] ?? null) : null;
    const limitHours = Number.isFinite(limit) ? limit : null;
    const supporting = [
      ...(rule
        ? [{ ...rule.doc.source, locator: { startLine: rule.index + 1, endLine: rule.index + 1 } }]
        : []),
      record.source,
      ...reports.flatMap((doc) => (doc ? [doc.source] : [])),
      ...recordRows
        .filter((row) => row.inspectionId === inspectionId)
        .flatMap((row) => (row.source ? [row.source as Source] : [])),
    ];
    sources.push(...supporting);
    findings.push({
      protocolId,
      observedHours,
      limitHours,
      status:
        observedHours !== null && limitHours !== null
          ? observedHours > limitHours
            ? 'missed'
            : 'met'
          : 'not-assessed',
      sources: supporting,
    });
  }
  const deadlines = [
    await assessSupportedDeadline(
      { assetId, protocolId: 'SR-03', eventId: inspectionId },
      evidence,
      analytics,
      signal,
    ),
  ];
  for (const notice of recordRows.filter(
    (row) => row.type === 'notice_of_violation' && row.inspectionId === inspectionId,
  ))
    deadlines.push(
      await assessSupportedDeadline(
        { assetId, protocolId: 'RC-04', eventId: String(notice.id) },
        evidence,
        analytics,
        signal,
      ),
    );
  for (const deadline of deadlines) sources.push(...deadline.sources);
  return {
    status: 'assessed' as const,
    assetId,
    inspectionId,
    asOf: evidence.asOf,
    findings,
    deadlines,
    regulatoryEvents: recordRows.filter(
      (row) => row.kind === 'regulatory' && row.inspectionId === inspectionId,
    ),
    sources,
    warnings: [
      'Assessment covers supported reporting/containment evidence only; unchecked protocols are not assessed. Reported observations are attributed records, not independent physical verification.',
    ],
  };
}
