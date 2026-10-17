import type { AppEvidence, ApplicationPanel } from '@repo/contracts';
import { digest } from '../agents/result-integrity.js';
import type { AgentDataResult } from '../agents/results.js';
import { metricCatalogue } from '../evidence/metrics.js';

/** Compares actual application projections with their originating immutable tool results. */
export function scoreArtifacts(
  results: AgentDataResult[],
  panels: ApplicationPanel[],
  evidence: AppEvidence[],
) {
  const issues: string[] = [];
  const available = new Set(evidence.map((item) => item.id));
  const evidenceSources = new Map(evidence.map((item) => [item.id, item.recordId]));
  for (const panel of panels) {
    const result = results.find((result) => result.id === panel.resultBinding?.resultId);
    if (!result || panel.resultBinding?.contentHash !== result.integrity.contentHash) {
      issues.push(`${panel.id}: result binding mismatch`);
      continue;
    }
    const references = [
      ...panel.evidenceIds,
      ...panel.rows.flatMap((row) => (Array.isArray(row.evidenceIds) ? row.evidenceIds : [])),
      ...(panel.geo?.features.flatMap((feature) => feature.properties.evidenceIds) ?? []),
      ...(panel.series?.flatMap((series) => series.points.flatMap((point) => point.evidenceIds)) ??
        []),
      ...(panel.corrections?.flatMap((correction) => correction.evidenceIds) ?? []),
    ];
    if (references.some((id) => !available.has(id)))
      issues.push(`${panel.id}: unresolved evidence`);
    if (result.kind === 'asset-overview') {
      const p = result.payload;
      if (
        p.status === 'found' &&
        (!panel.status ||
          panel.status.assetId !== p.asset.id ||
          panel.status.deltaC !== (p.production?.deltaC ?? null) ||
          panel.status.producing !== (p.production?.producing ?? null) ||
          panel.status.thresholdC !== (p.production?.thresholdC ?? null))
      )
        issues.push(`${panel.id}: status value mismatch`);
      continue;
    }
    if (result.kind !== 'analysis') continue;
    const p = result.payload;
    if (
      panel.resultBinding?.quantity !== metricCatalogue[p.metric].quantity ||
      panel.resultBinding.metric !== p.metric
    )
      issues.push(`${panel.id}: quantity binding mismatch`);
    if (
      panel.resultBinding?.nullPolicy !== 'unknown-not-zero' ||
      panel.resultBinding.timeZone !== 'UTC'
    )
      issues.push(`${panel.id}: null/time semantics mismatch`);
    if (JSON.stringify(panel.parameters.window ?? null) !== JSON.stringify(p.window ?? null))
      issues.push(`${panel.id}: date window mismatch`);
    if (JSON.stringify(panel.coverage) !== JSON.stringify(p.coverage)) {
      // Public coverage is a selected subset of domain coverage, not an invented total.
      for (const key of ['totalRows', 'returnedRows', 'truncated'] as const)
        if (panel.coverage[key] !== p.coverage[key]) issues.push(`${panel.id}: coverage mismatch`);
    }
    if ('totals' in p && digest(panel.totals) !== digest(p.totals))
      issues.push(`${panel.id}: full totals mismatch`);
    if (panel.rows.length !== p.rows.length) issues.push(`${panel.id}: table row count mismatch`);
    for (const [index, row] of p.rows.entries()) {
      const expected = row as Record<string, unknown>,
        actual = panel.rows[index];
      for (const [key, value] of Object.entries(expected)) {
        if (key === 'sources' || Array.isArray(value)) continue;
        if (actual?.[key] !== (value ?? null))
          issues.push(`${panel.id}: row ${index} ${key} mismatch`);
      }
    }
    if (panel.geo) {
      const mapped = panel.geo.features.filter((feature) => feature.geometry);
      if (
        panel.mapCoverage?.returnedEvents !== panel.geo.features.length ||
        panel.mapCoverage.mappedEvents !== mapped.length ||
        panel.mapCoverage.unmappedEvents !== panel.geo.features.length - mapped.length ||
        panel.mapCoverage.distinctMappedAssets !==
          new Set(mapped.map((feature) => feature.properties.assetId)).size
      )
        issues.push(`${panel.id}: map coverage mismatch`);
      if (panel.geo.features.length !== p.rows.length)
        issues.push(`${panel.id}: map feature count mismatch`);
      for (const feature of panel.geo.features) {
        const row = p.rows.find(
          (row) => 'inspectionId' in row && `${row.assetId}:${row.inspectionId}` === feature.id,
        ) as Record<string, unknown> | undefined;
        if (
          !row ||
          feature.properties.eventId !== row.inspectionId ||
          feature.properties.assetId !== row.assetId ||
          feature.properties.volumeBbl !== row.volumeBbl ||
          feature.properties.status !== 'unknown'
        ) {
          issues.push(`${panel.id}: map event mismatch`);
          continue;
        }
        const valid =
          row.lon !== null &&
          row.lon !== undefined &&
          row.lat !== null &&
          row.lat !== undefined &&
          row.lon !== '' &&
          row.lat !== '' &&
          Number.isFinite(Number(row.lon)) &&
          Number.isFinite(Number(row.lat)) &&
          Math.abs(Number(row.lon)) <= 180 &&
          Math.abs(Number(row.lat)) <= 90;
        if (
          valid
            ? feature.geometry?.coordinates[0] !== Number(row.lon) ||
              feature.geometry.coordinates[1] !== Number(row.lat)
            : feature.geometry !== null
        )
          issues.push(`${panel.id}: map coordinates mismatch`);
      }
    }
    if (panel.series) {
      const assetIds = [
        ...new Set(p.rows.flatMap((row) => ('assetId' in row ? [String(row.assetId)] : []))),
      ];
      const shown = assetIds.slice(0, 100);
      if (
        panel.series.length !== shown.length ||
        panel.seriesSemantics?.returnedSeries !== assetIds.length ||
        panel.seriesSemantics.displayedSeries !== shown.length
      )
        issues.push(`${panel.id}: series coverage mismatch`);
      for (const series of panel.series) {
        const expectedRows = p.rows.filter((row) => 'assetId' in row && row.assetId === series.id);
        if (
          !shown.includes(series.id) ||
          series.points.length !== expectedRows.length ||
          new Set(series.points.map((point) => point.id)).size !== series.points.length
        )
          issues.push(`${panel.id}: series point count mismatch`);
      }
      for (const series of panel.series)
        for (const point of series.points) {
          const row = p.rows.find(
            (row) =>
              'inspectionId' in row && row.inspectionId === point.id && row.assetId === series.id,
          ) as Record<string, unknown> | undefined;
          if (!row || point.value !== row.deltaC || point.at !== row.observedAt)
            issues.push(`${panel.id}: series point mismatch`);
        }
      if (
        panel.seriesSemantics?.valueField !== 'deltaC' ||
        panel.seriesSemantics.missing !== 'gap' ||
        panel.seriesSemantics.timeZone !== 'UTC'
      )
        issues.push(`${panel.id}: series semantics mismatch`);
    }
    if (panel.matrix)
      for (const cell of panel.matrix.cells) {
        const row = p.rows.find(
          (row) => 'areaId' in row && row.areaId === cell.rowId && row.month === cell.columnId,
        ) as Record<string, unknown> | undefined;
        if (cell.value !== (row ? String(row.count) : null))
          issues.push(`${panel.id}: matrix cell mismatch`);
      }
    if ('correctionAudit' in p && p.correctionAudit) {
      if (panel.corrections?.length !== p.correctionAudit.length)
        issues.push(`${panel.id}: correction audit lost`);
      for (const correction of p.correctionAudit)
        if (
          !panel.corrections?.some(
            (item) =>
              item.inspectionId === correction.inspectionId &&
              item.action === correction.action &&
              item.evidenceIds.some((id) =>
                correction.sources.some((source) => source.id === evidenceSources.get(id)),
              ),
          )
        )
          issues.push(`${panel.id}: correction evidence mismatch`);
    }
  }
  const expected = results.filter(
    (result) =>
      result.kind === 'analysis' ||
      (result.kind === 'asset-overview' && result.payload.status === 'found'),
  );
  for (const result of expected)
    if (!panels.some((panel) => panel.resultBinding?.resultId === result.id))
      issues.push(`${result.id}: selected result has no application panel`);
  return {
    status: issues.length
      ? ('failed' as const)
      : !panels.length && !expected.length
        ? ('not-applicable' as const)
        : ('passed' as const),
    panelsChecked: panels.length,
    issues,
  };
}
