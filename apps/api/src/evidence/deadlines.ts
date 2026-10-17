import { z } from 'zod';
import type { AnalyticsService } from './analytics.js';
import type { EvidenceService } from './service.js';

export type SupportedDeadlineInput = {
  assetId: string;
  protocolId: 'SR-03' | 'RC-04' | 'WS-07';
  eventId: string;
};
/** Supported company-rule bindings only. The caller cannot supply a trigger date or interval. */
export async function assessSupportedDeadline(
  input: SupportedDeadlineInput,
  evidence: EvidenceService,
  analytics?: AnalyticsService,
  signal?: AbortSignal,
) {
  const kind =
    input.protocolId === 'SR-03'
      ? 'inspection'
      : input.protocolId === 'RC-04'
        ? 'regulatory'
        : 'maintenance';
  const record = await evidence.record(kind, input.eventId, signal);
  if (!record)
    return {
      status: 'not-assessed' as const,
      reason: 'Trigger record is unavailable.',
      sources: [],
    };
  const original = JSON.parse(record.text) as Record<string, unknown>;
  if (original.asset_id !== input.assetId)
    return {
      status: 'not-assessed' as const,
      reason: 'Trigger asset does not match requested asset.',
      sources: [record.source],
    };
  const rules = await evidence.procedures(input.assetId, signal);
  const found = rules.flatMap((doc) =>
    doc.markdown
      .split('\n')
      .flatMap((text, index) =>
        text.startsWith(`| **${input.protocolId}** |`) ? [{ doc, text, index }] : [],
      ),
  );
  if (found.length !== 1)
    return {
      status: 'not-assessed' as const,
      reason: 'One unambiguous applicable operative clause is required.',
      sources: [record.source],
    };
  const rule = found[0];
  if (!rule) throw new Error('Missing rule.');
  const clause = rule.text.replaceAll('**', '');
  const days = clause.match(/within\s+(\d+)\s+days/i)?.[1];
  const trigger =
    input.protocolId === 'SR-03'
      ? original.inspected_at
      : input.protocolId === 'RC-04'
        ? original.date
        : original.completed_at;
  const applicable =
    input.protocolId === 'SR-03'
      ? original.spill_detected === true && Number(original.spill_est_volume_bbl) >= 5
      : input.protocolId === 'RC-04'
        ? original.event_type === 'notice_of_violation'
        : true;
  if (
    !days ||
    typeof trigger !== 'string' ||
    !applicable ||
    !Number.isFinite(Date.parse(trigger)) ||
    Date.parse(trigger) > Date.parse(evidence.asOf)
  )
    return {
      status: 'not-assessed' as const,
      reason: 'Unsupported clause, missing/pending trigger or applicability not established.',
      sources: [record.source, rule.doc.source],
    };
  const triggerDate = z.iso.date().parse(trigger.slice(0, 10));
  const withinDays = z.number().int().min(1).max(36600).parse(Number(days));
  const due = new Date(`${triggerDate}T00:00:00.000Z`);
  due.setUTCDate(due.getUTCDate() + withinDays);
  const dueDate = due.toISOString().slice(0, 10);
  const assessedDate = evidence.asOf.slice(0, 10);
  const calendarDays = Math.round(
    (Date.parse(`${assessedDate}T00:00:00Z`) - due.getTime()) / 86400000,
  );
  const ruleSource = {
    ...rule.doc.source,
    locator: { startLine: rule.index + 1, endLine: rule.index + 1 },
  };
  const records = analytics
    ? await analytics.records(input.assetId, { from: triggerDate, through: assessedDate }, signal)
    : null;
  const expectedType = input.protocolId === 'RC-04' ? 'nov_response_filed' : 'site_inspection';
  const matched = (records?.records ?? []).filter((value) => {
    const event = value as {
      type?: string;
      inspectionId?: string;
      status?: string;
      detail?: string;
    };
    const targetInspection =
      input.protocolId === 'SR-03' ? input.eventId : original.related_inspection_id;
    return (
      event.type === expectedType &&
      typeof targetInspection === 'string' &&
      event.inspectionId === targetInspection &&
      (input.protocolId !== 'SR-03' ||
        (event.status === 'closed' &&
          /pass|verified|verification complete/i.test(event.detail ?? '')))
    );
  });
  let completionStatus = matched.length
    ? 'requires-target-and-passing-evidence-confirmation'
    : 'no-matching-completion-in-retrieved-records';
  let completedDate: string | null = null;
  let completionSource = null;
  if (input.protocolId === 'WS-07') {
    const report = await evidence.read(input.eventId, signal);
    const written = report?.markdown.match(
      /\*\*Report written:\*\*\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/,
    )?.[1];
    if (
      report?.assetId === input.assetId &&
      written &&
      Number.isFinite(Date.parse(`${written} UTC`))
    ) {
      completedDate = new Date(Date.parse(`${written} UTC`)).toISOString().slice(0, 10);
      if (completedDate <= assessedDate) {
        completionStatus =
          completedDate <= dueDate
            ? 'report-states-completed-on-time'
            : 'report-states-completed-late';
        completionSource = report.source;
      } else {
        completedDate = null;
        completionStatus = 'report-authorship-is-in-the-future';
      }
    } else completionStatus = 'maintenance-report-authorship-not-confirmed';
  }
  // A response for a different notice must never prove this notice answered.
  const completion = 'not-assessed' as const;
  return {
    status: 'assessed' as const,
    protocolId: input.protocolId,
    assetId: input.assetId,
    eventId: input.eventId,
    ruleText: rule.text,
    triggerDate,
    withinDays,
    dueDate,
    assessedDate,
    asOf: evidence.asOf,
    precision: 'UTC-calendar-date',
    overdueCalendarDays: Math.max(0, calendarDays),
    dueState: calendarDays > 0 ? 'overdue' : calendarDays === 0 ? 'due-today' : 'upcoming',
    completion,
    completionEvidence: {
      candidateRecords: matched.length,
      status: completionStatus,
      completedDate,
      scope: records?.coverage ?? null,
    },
    inputSourceIds: [
      ruleSource.id,
      record.source.id,
      ...(completionSource ? [completionSource.id] : []),
    ],
    sources: [
      ruleSource,
      record.source,
      ...(completionSource ? [completionSource] : []),
      ...(records?.sources ?? []),
    ],
    warnings: [
      'Calendar-date precision only. Passing a due date does not prove an action was missed. Payment status is not established by an open notice. Completion remains unconfirmed unless target-specific evidence is checked.',
    ],
  };
}
