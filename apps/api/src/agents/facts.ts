import type { AgentDataResult } from './results.js';

export type ResultFact = {
  id: string;
  resultId: string;
  kind: 'calculated' | 'observed' | 'reported' | 'unknown';
  text: string;
  sourceIds: string[];
};
/** Sentences are compiled from trusted domain fields, never model-authored numbers or causality. */
export function resultFacts(result: AgentDataResult): ResultFact[] {
  const facts: ResultFact[] = [];
  const add = (kind: ResultFact['kind'], text: string, sourceIds: string[]) =>
    facts.push({
      id: `${result.id}:fact:${facts.length + 1}`,
      resultId: result.id,
      kind,
      text,
      sourceIds: [...new Set(sourceIds)],
    });
  const sourceIds = result.sources.map((source) => source.id);
  if (result.kind === 'asset-overview') {
    const p = result.payload;
    if (p.status === 'not-found')
      add(
        'unknown',
        `${p.assetId} was not found in the available dataset. Its production and latest inspection are unknown.`,
        [],
      );
    else {
      const o = p.observation;
      if (p.production && o)
        add(
          'calculated',
          `${p.asset.id} was ${p.production.producing ? 'producing' : 'not producing'} at its latest inspection (${o.observedAt}): wellhead ${o.wellheadC} °C minus ambient ${o.ambientC} °C = ${p.production.deltaC} °C, against the applicable ${p.production.thresholdC} °C threshold. Inspector: ${o.inspector}; method: ${o.method}. This is an observation, not live telemetry.`,
          p.production.inputSourceIds,
        );
      else
        add(
          'unknown',
          `${p.asset.id}: measured production is unknown; the required measurement, interpretable correction or applicable rule is unavailable.`,
          sourceIds,
        );
      for (const note of p.notes)
        add(
          'reported',
          `${note.type === 'correction' ? 'Correction record' : 'Unconfirmed human report'} by ${note.author} on ${note.createdAt}: ${JSON.stringify(note.text)}. This report is separate from the measured production classification; planned completion is not confirmed completion.`,
          [note.source.id],
        );
      if (p.maintenanceTruncated)
        add(
          'unknown',
          'Only the ten latest maintenance jobs were retrieved; this is not an exhaustive maintenance history.',
          [],
        );
    }
  } else if (result.kind === 'analysis') {
    const p = result.payload;
    const period = p.window
      ? ` from ${p.window.from} through ${p.window.through} (inclusive UTC dates)`
      : '';
    if ('totals' in p && p.totals) {
      const t = p.totals;
      add(
        'calculated',
        `${(result.parameters as { assetId?: string; area?: string }).assetId ?? (result.parameters as { area?: string }).area ?? 'Selected fleet'}: ${t.spillCount} effective spills${period}, totalling ${t.totalBbl} bbl of known volume. ${t.excludedFalsePositives} false-positive ${t.excludedFalsePositives === 1 ? 'detection was' : 'detections were'} excluded. ${t.unknownVolumeEvents} effective events have unknown volume. Totals cover the full selected input, not just displayed rows.`,
        sourceIds,
      );
      for (const c of p.correctionAudit)
        add(
          'reported',
          `Correction for ${c.assetId}, inspection ${c.inspectionId}: ${c.action === 'excluded-false-positive' ? 'excluded as a false positive' : 'unresolved; total provisional'}. Original estimated volume: ${c.originalVolumeBbl ?? 'unknown'} bbl. Recorded reason: ${JSON.stringify(c.reason)}.`,
          c.sources.map((source) => source.id),
        );
    }
    for (const raw of p.rows) {
      const row = raw as Record<string, unknown>;
      const ids = Array.isArray(row.sources)
        ? row.sources.map((s) => (s as { id: string }).id)
        : [];
      if (p.metric === 'downtime')
        add(
          'calculated',
          `${row.assetId}: ${row.downtimeDays} days of inspection-derived downtime${period}, calculated as 7 days per non-producing inspection (${row.nonProducingInspections} of ${row.inspectionCount} inspections). This is not measured continuous shut-in or repair duration.`,
          ids,
        );
      if (p.metric === 'repair-costs')
        add(
          'calculated',
          `${row.assetId}: USD ${row.totalUsd} across ${row.jobCount} recorded maintenance jobs${period}.`,
          ids,
        );
      if (p.metric === 'repeat-repairs')
        add(
          'calculated',
          `${row.assetId}: ${row.correctiveEvents} corrective repairs of ${row.equipmentKind}${period}.`,
          ids,
        );
      if (p.metric === 'temperature-history')
        add(
          'observed',
          `${row.assetId}, inspection ${row.inspectionId} at ${row.observedAt}: temperature difference from ambient ${row.deltaC ?? 'unknown'} °C (wellhead ${row.wellheadC} °C; ambient ${row.ambientC} °C).`,
          ids,
        );
      if (p.metric === 'current-status')
        add(
          'calculated',
          `${row.assetId}: ${row.producing === null ? 'production unknown' : row.producing ? 'producing' : 'not producing'} at ${row.observedAt ?? 'unknown observation time'}; measured difference ${row.deltaC ?? 'unknown'} °C against ${row.thresholdC} °C.`,
          ids,
        );
    }
    if (p.coverage.truncated)
      add(
        'unknown',
        `Only ${p.coverage.returnedRows} of ${p.coverage.totalRows} result rows are displayed; full-input coverage is distinct from this display limit.`,
        [],
      );
  } else if (result.kind === 'relationships') {
    for (const edge of result.payload.edges)
      add(
        'observed',
        `Stored relationship: ${edge.from.kind} ${edge.from.id} → ${edge.relation} → ${edge.to.kind} ${edge.to.id}. This is an explicit record link, not proof of cause.`,
        edge.sources.map((source) => source.id),
      );
  } else if (result.kind === 'operational-records') {
    for (const record of result.payload.records) {
      const r = record as Record<string, unknown>;
      if (r.kind !== 'regulatory') continue;
      add(
        'observed',
        `${r.id}: ${r.type} dated ${r.date}, recorded status ${r.status}. Detail: ${JSON.stringify(r.detail)}.${r.fineUsd !== undefined && String(r.fineUsd) !== '0' ? ` Recorded fine: USD ${r.fineUsd}; payment status is unknown. An open notice does not establish nonpayment.` : ''}`,
        [(r.source as { id: string }).id],
      );
    }
  } else if (result.kind === 'incident-timings') {
    for (const finding of result.payload.findings)
      add(
        finding.status === 'not-assessed' ? 'unknown' : 'calculated',
        `${finding.protocolId}: ${finding.status === 'missed' ? 'deadline missed' : finding.status === 'met' ? 'timing requirement met in the retrieved evidence' : 'not assessed'}. Recorded elapsed time ${finding.observedHours ?? 'unknown'} hours versus company limit ${finding.limitHours ?? 'unknown'} hours. Unchecked protocols are not assessed.`,
        finding.sources.map((source) => source.id),
      );
    if ('deadlines' in result.payload)
      for (const deadline of result.payload.deadlines ?? []) {
        if (deadline.status !== 'assessed') {
          add(
            'unknown',
            deadline.reason,
            deadline.sources.map((source) => source.id),
          );
          continue;
        }
        add(
          'calculated',
          `${deadline.protocolId}: due ${deadline.dueDate}, ${deadline.overdueCalendarDays} calendar days past the deadline as of ${deadline.assessedDate}. Trigger: ${deadline.triggerDate}; company interval: ${deadline.withinDays} days. ${deadline.completionEvidence.status === 'no-matching-completion-in-retrieved-records' ? 'No matching completion is evidenced in the retrieved records; completion remains unconfirmed.' : 'Candidate completion evidence requires target-specific confirmation.'} A passed deadline is not proof that no action occurred.`,
          deadline.inputSourceIds,
        );
      }
    if ('regulatoryEvents' in result.payload)
      for (const event of result.payload.regulatoryEvents ?? []) {
        const source = event.source as { id: string };
        add(
          'observed',
          `${event.id}: ${event.type}, ${event.date}, recorded status ${event.status}. ${JSON.stringify(event.detail)}.${event.type === 'notice_of_violation' ? ` Recorded fine: USD ${event.fineUsd}; payment status is unknown. An open notice does not establish nonpayment.` : ''}`,
          [source.id],
        );
      }
    if (
      'regulatoryEvents' in result.payload &&
      (result.payload.regulatoryEvents ?? []).some(
        (event) => event.type === 'notice_of_violation' && event.status === 'open',
      )
    )
      add(
        'unknown',
        'Suggested follow-up: first confirm the open notice response and its filing evidence, then confirm applicable agency remediation verification and fine payment with the responsible team. These are recommendations, not tasks already created. Unchecked protocols are not assessed.',
        sourceIds.filter(
          (id) => id.includes('regulatory-compliance') || id.includes('spill-response'),
        ),
      );
  } else if (result.kind === 'deadline') {
    const p = result.payload;
    const completed = p.completionEvidence?.status.startsWith('report-states-completed');
    add(
      'calculated',
      `${p.protocolId ? `${p.protocolId} supported company-rule deadline` : 'Conditional calendar deadline'}: trigger ${p.triggerDate}, interval ${p.withinDays} days, due ${p.dueDate}.${completed ? ` The retained report states authorship on ${p.completionEvidence?.completedDate}: ${p.completionEvidence?.status}. This is reported completion evidence, not an overdue open obligation.` : ` The due date is ${p.overdueCalendarDays} calendar days before the assessment date ${p.assessedDate}; date arithmetic alone does not establish non-completion.${p.completionEvidence ? ` Completion evidence: ${p.completionEvidence.status}.` : ''}`}`,
      p.inputSourceIds,
    );
  }
  return facts;
}
export function renderFacts(facts: ResultFact[]) {
  return [...new Map(facts.map((fact) => [fact.text, fact])).values()]
    .map(
      (fact) =>
        `${fact.text}${
          fact.sourceIds.length
            ? ` ${fact.sourceIds
                .slice(0, 8)
                .map((id) => `[${id}]`)
                .join(' ')}`
            : ''
        }`,
    )
    .join('\n\n');
}
