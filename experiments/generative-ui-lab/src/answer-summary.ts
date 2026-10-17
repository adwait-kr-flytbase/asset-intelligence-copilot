import { resolveArtifactForView } from './artifact-bindings';
import type { Snapshot } from './protocol';

function formatTotal(value: number, unit: string) {
  if (/^[A-Z]{3}$/.test(unit) && Intl.supportedValuesOf('currency').includes(unit))
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: unit,
      maximumFractionDigits: 2,
    }).format(value);
  const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  return unit === '$' ? `$${amount}` : `${amount}${unit === '%' ? '' : ' '}${unit}`;
}

export function answerSummary(s: Snapshot) {
  const r = s.result;
  if (s.execution) {
    const scope =
      s.execution.parameters.wellId === 'all'
        ? `${r.rows.length} wells`
        : s.execution.parameters.wellId;
    const firstKind = s.plan.views[0];
    const artifact =
      firstKind === 'status'
        ? undefined
        : resolveArtifactForView(r.artifacts, firstKind, s.execution.parameters.wellId);
    if (artifact) {
      if (artifact.kind === 'ranking') {
        const total = formatTotal(
          artifact.items.reduce((sum, item) => sum + item.value, 0),
          artifact.unit,
        );
        return firstKind === 'costs'
          ? `${scope}: ${total} in recorded synthetic repair costs. Compare the ledger totals and inspect their supporting records below.`
          : `${scope}: ${total} in ${artifact.metricLabel.toLowerCase()}. Compare the values and inspect their supporting records below.`;
      }
      if (artifact.kind === 'obligations') {
        const breaches = artifact.items.filter((item) => item.status === 'breach').length;
        const pending = artifact.items.filter((item) => item.status === 'pending').length;
        return `${scope}: ${breaches} recorded ${breaches === 1 ? 'breach' : 'breaches'} and ${pending} pending ${pending === 1 ? 'obligation' : 'obligations'} under the invented demo checklist rules. Missing proof remains unknown; sources and deadlines are shown below.`;
      }
      if (artifact.kind === 'correction')
        return `${scope}: a read-only proposal with the original value retained. Review the reason, sources and potential consequences below. No records have changed.`;
      if (artifact.kind === 'claims')
        return `${scope}: competing reports and measured observations are retained separately. Compare their authors, dates and evidence before resolving the disagreement.`;
      if (artifact.kind === 'timeline')
        return `${scope}: follow the recorded events and observations in time order. Each entry links to the source used in this result.`;
      if (artifact.kind === 'series')
        return `${scope}: compare synthetic wellhead and ambient temperatures. Missing readings remain gaps; event markers link to the recorded inspections.`;
      if (artifact.kind === 'geo')
        return `${scope}: explore the recorded locations and spill events. Select a marker or a location record for evidence; missing coordinates remain explicit.`;
      if (artifact.kind === 'matrix')
        return `${scope}: ${artifact.title.toLowerCase()}. Select a cell to inspect the exact scope and supporting evidence.`;
    }
    return r.query === 'downtime'
      ? `${scope}: ${r.rows.reduce((n, w) => n + w.downtimeDays, 0)} inspection-derived downtime days in the four-week source window. Compare the readings and applicable rules below.`
      : r.query === 'spills'
        ? `${scope}: ${r.rows.reduce((n, w) => n + w.spillBbl, 0).toFixed(1)} bbl in the synthetic spill records. Locations, gaps and conflicting observations are shown below.`
        : `${scope}: ${r.rows.filter((w) => !w.producing).length} below-threshold ${r.rows.length === 1 ? 'well' : 'wells'} at the latest recorded inspection. The views below include readings, evidence and the applicable operating rule.`;
  }
  if (r.query === 'downtime')
    return `${r.rows.reduce((sum, w) => sum + w.downtimeDays, 0)} days of downtime across ${r.rows.length} wells in the synthetic inspection period. Compare wells and check their temperature trends.`;
  if (r.query === 'spills')
    return `${r.rows.reduce((sum, w) => sum + w.spillBbl, 0).toFixed(1)} bbl recorded across the synthetic wells. The result includes locations and conflicting records; missing coordinates are flagged.`;
  return `${r.rows.filter((w) => !w.producing).length} wells are below their production threshold. Inspect the locations, missing observations and conflicting records before drawing a conclusion.`;
}
