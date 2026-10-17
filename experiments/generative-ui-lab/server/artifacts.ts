import { type Artifact, artifactSchema } from '../src/artifact-contract.ts';
import type { OperatorParameters, Plan, Result } from '../src/protocol.ts';

type Source = Result['sources'][number];
const from = '2026-09-24';
const to = '2026-10-31';
const costs = [18400, 6200, 900, 12750, 3800, 1200];
const dates = ['2026-09-24', '2026-10-01', '2026-10-08', '2026-10-15'];

// These are standalone, explicitly synthetic records, not facts inferred from inspections.
// The same pure adapter serves both chat reads and approved saved definitions.
export function buildArtifacts(
  plan: Plan,
  rows: Result['rows'],
  parameters: OperatorParameters,
  originalRows: Result['rows'],
) {
  const artifacts: Artifact[] = [];
  const sources: Source[] = [];
  if (!rows.length) return { artifacts, sources };
  const scope = (label: string, selected = rows, start = from, end = to) => ({
    label,
    wellIds: selected.map((row) => row.id),
    from: start,
    to: end,
  });
  const addSource = (family: string, wellId: string, body: string) => {
    const id = `LAB-${family}-${wellId}`;
    if (!sources.some((source) => source.id === id))
      sources.push({
        id,
        label: `Synthetic ${family.toLowerCase()} record · ${wellId}`,
        body: `Dedicated synthetic lab fixture for ${wellId}. ${body} No production dataset, regulatory determination or actual transaction is represented.`,
      });
    return id;
  };
  const add = (artifact: Artifact) => artifacts.push(artifactSchema.parse(artifact));
  const allInspectionSources = [...new Set(rows.flatMap((row) => row.sourceIds))];
  const index = (wellId: string) => Number(wellId.slice(-2)) - 1;
  if (plan.views.includes('map')) {
    const points = rows.map((row) => ({
      id: row.id,
      wellId: row.id,
      label: row.id,
      lat: row.lat,
      lon: row.lon,
      status: row.producing ? ('producing' as const) : ('below-threshold' as const),
      volumeBbl: row.spillBbl,
      eventDate: row.spillDate,
      sourceIds: [
        ...row.sourceIds,
        addSource(
          'LOCATION',
          row.id,
          row.lat === null
            ? 'Demo coordinate is unavailable; no position may be inferred.'
            : `Fictional demo coordinate ${row.lat}, ${row.lon}; never an actual asset location.`,
        ),
      ],
    }));
    add({
      id: 'well-geography',
      kind: 'geo',
      title: 'Synthetic well locations and spill events',
      scope: scope(
        'Fictional locations; latest status and 24 Sep–15 Oct spill records',
        rows,
        from,
        '2026-10-15',
      ),
      sourceIds: [...new Set(points.flatMap((point) => point.sourceIds))],
      points,
    });
  }
  if (plan.views.includes('line'))
    for (const row of rows) {
      const readings = row.trend.map((point) => {
        const ambient = Number(
          (20 + index(row.id) * 0.7 + (3 - dates.indexOf(point.date))).toFixed(1),
        );
        return {
          date: point.date,
          ambient,
          wellhead: point.deltaC === null ? null : Number((ambient + point.deltaC).toFixed(1)),
        };
      });
      const rawSource = addSource(
        'RAW-TEMPERATURE',
        row.id,
        `Standalone invented sensor fixture; these absolute temperatures are not present in the inspection source. ${readings.length ? readings.map((point) => `${point.date}: ambient ${point.ambient} °C, wellhead ${point.wellhead === null ? 'not observed' : `${point.wellhead} °C`}`).join('; ') : 'No readings in the requested trend date range.'} Synthetic wellhead temperatures are constructed from the demo ambient fixture plus the recorded inspection difference; this is not a reconstruction of actual observations.`,
      );
      add({
        id: `temperatures-${row.id}`,
        kind: 'series',
        title: `${row.id} · synthetic wellhead and ambient temperatures`,
        scope: scope(
          'Trend date filter only; absolute temperatures from dedicated invented sensor fixtures',
          [row],
          parameters.trendStart,
          parameters.trendEnd,
        ),
        sourceIds: [...row.sourceIds, rawSource],
        unit: '°C',
        series: [
          {
            id: `${row.id}-wellhead`,
            label: 'Wellhead (synthetic sensor)',
            points: readings.map((point) => ({ date: point.date, value: point.wellhead })),
          },
          {
            id: `${row.id}-ambient`,
            label: 'Ambient (synthetic sensor)',
            points: readings.map((point) => ({ date: point.date, value: point.ambient })),
          },
        ],
        events:
          row.spillDate &&
          row.spillDate >= parameters.trendStart &&
          row.spillDate <= parameters.trendEnd
            ? [
                {
                  id: `spill-${row.id}`,
                  date: row.spillDate,
                  label: `Recorded spill · ${row.spillBbl} bbl`,
                  sourceIds: [row.sourceIds[0]],
                },
              ]
            : [],
      });
    }
  if (plan.views.includes('bar')) {
    const spills = plan.query === 'spills';
    add({
      id: spills ? 'spill-ranking' : 'downtime-ranking',
      kind: 'ranking',
      title: spills ? 'Recorded spill volumes by well' : 'Inspection-derived downtime by well',
      scope: scope(
        'Full inspection window; independent of trend dates/count',
        rows,
        from,
        '2026-10-15',
      ),
      sourceIds: allInspectionSources,
      unit: spills ? 'bbl' : 'days',
      metricLabel: spills ? 'Spill volume' : 'Estimated downtime',
      items: rows
        .map((row) => ({
          id: row.id,
          label: row.id,
          value: spills ? row.spillBbl : row.downtimeDays,
          sourceIds: row.sourceIds,
        }))
        .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id)),
    });
  }
  if (plan.views.includes('costs')) {
    const items = rows
      .map((row) => {
        const value = costs[index(row.id)];
        return {
          id: row.id,
          label: row.id,
          value,
          sourceIds: [
            addSource(
              'COST',
              row.id,
              `Recorded repair ledger total: USD ${value} for 24 Sep–15 Oct 2026. Synthetic parts ${Math.round(value * 0.6)} USD and labor ${value - Math.round(value * 0.6)} USD. Recorded totals only; no invoice line items, forecasts or approval are available.`,
            ),
          ],
        };
      })
      .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
    add({
      id: 'repair-costs',
      kind: 'ranking',
      title: 'Recorded synthetic repair costs',
      scope: scope(
        'Synthetic repair ledger · 24 Sep–15 Oct; independent of trend filter',
        rows,
        from,
        '2026-10-15',
      ),
      sourceIds: items.flatMap((item) => item.sourceIds),
      unit: 'USD',
      metricLabel: 'Recorded repair cost',
      items,
    });
  }
  if (plan.views.includes('heatmap')) {
    if (plan.query === 'spills') {
      const areas = [...new Set(rows.map((row) => row.area))];
      const months = [
        { id: '2026-09', label: 'Sep 2026' },
        { id: '2026-10', label: 'Oct 2026' },
      ];
      const inspectionSources = rows.map((row) => row.sourceIds[0]);
      add({
        id: 'spill-event-matrix',
        kind: 'matrix',
        title: 'Recorded spill events by area and month',
        scope: scope(
          'Event counts in the complete synthetic inspection window, 24 Sep–15 Oct; zero means no recorded event among selected wells, not proof of no real spill',
          rows,
          from,
          '2026-10-15',
        ),
        sourceIds: inspectionSources,
        unit: 'events',
        rows: areas.map((area) => ({ id: area, label: area })),
        columns: months,
        cells: areas.flatMap((area) => {
          const areaWells = rows.filter((row) => row.area === area);
          return months.map((month) => ({
            rowId: area,
            columnId: month.id,
            value: areaWells.filter(
              (row) => row.spillBbl > 0 && row.spillDate?.startsWith(month.id),
            ).length,
            sourceIds: areaWells.map((row) => row.sourceIds[0]),
          }));
        }),
      });
    } else {
      // A matrix always retains the complete original four-week scope, including null observations.
      // The line chart alone follows the independent trend date input.
      const cells = rows.flatMap((row) =>
        dates.map((date) => ({
          rowId: row.id,
          columnId: date,
          value:
            originalRows
              .find((original) => original.id === row.id)
              ?.trend.find((point) => point.date === date)?.deltaC ?? null,
          sourceIds: row.sourceIds,
        })),
      );
      add({
        id: 'inspection-temperature-matrix',
        kind: 'matrix',
        title: 'Weekly inspection temperature differences',
        scope: scope(
          'All four weekly observations; independent of trend dates/count',
          rows,
          from,
          '2026-10-15',
        ),
        sourceIds: allInspectionSources,
        unit: '°C',
        rows: rows.map((row) => ({ id: row.id, label: row.id })),
        columns: dates.map((date) => ({ id: date, label: date })),
        cells,
      });
    }
  }
  if (plan.views.includes('obligations')) {
    const states = ['breach', 'pending', 'compliant', 'unknown', 'pending', 'compliant'] as const;
    const items = rows.map((row) => {
      const status = states[index(row.id)];
      const dueAt =
        status === 'pending' ? '2026-10-22' : status === 'unknown' ? null : '2026-10-15';
      const observed =
        status === 'compliant'
          ? 'Checklist received on 2026-10-14.'
          : status === 'breach'
            ? 'No checklist received by the synthetic deadline.'
            : status === 'pending'
              ? 'Checklist requested; demo deadline has not passed as of 17 Oct.'
              : 'Evidence missing; compliance cannot be established.';
      const rule =
        'Demo-only obligation: submit the weekly containment checklist by the stated deadline.';
      return {
        id: `obligation-${row.id}`,
        wellId: row.id,
        title: 'Containment checklist',
        status,
        dueAt,
        rule,
        observed,
        sourceIds: [
          addSource(
            'OBLIGATION',
            row.id,
            `As of 2026-10-17. ${rule} Due: ${dueAt || 'unknown'}. ${observed} Fixture status: ${status}. This invented rule is not a legal requirement.`,
          ),
        ],
      };
    });
    add({
      id: 'containment-obligations',
      kind: 'obligations',
      title: 'Synthetic obligations and deadlines',
      scope: scope('Invented containment checklist rules; as of 17 Oct, deadlines through 22 Oct'),
      sourceIds: items.flatMap((item) => item.sourceIds),
      items,
    });
  }
  if (plan.views.includes('timeline')) {
    const items = rows
      .flatMap((row) => {
        const sourceId = addSource(
          'HISTORY',
          row.id,
          `Synthetic event log: 2026-09-25 operator note “Containment walk scheduled”; 2026-10-09 repair “Valve seal checked; return-to-service not established”. These event records are independent of inspection status and do not establish causality.`,
        );
        return [
          {
            id: `note-${row.id}`,
            at: '2026-09-25',
            title: `${row.id} · containment walk scheduled`,
            description: 'Synthetic operator note; completion not established.',
            category: 'note' as const,
            sourceIds: [sourceId],
          },
          ...(row.spillDate
            ? [
                {
                  id: `spill-${row.id}`,
                  at: row.spillDate,
                  title: `${row.id} · spill recorded`,
                  description: `Recorded ${row.spillBbl} bbl in the synthetic inspection.`,
                  category: 'spill' as const,
                  sourceIds: [row.sourceIds[0]],
                },
              ]
            : []),
          {
            id: `repair-${row.id}`,
            at: '2026-10-09',
            title: `${row.id} · valve seal checked`,
            description: 'Synthetic repair log; does not prove a cause or restoration.',
            category: 'repair' as const,
            sourceIds: [sourceId],
          },
          {
            id: `inspection-${row.id}`,
            at: '2026-10-15',
            title: `${row.id} · weekly inspection`,
            description: `Temperature difference ${row.deltaC} °C against threshold ${row.thresholdC} °C.`,
            category: 'inspection' as const,
            sourceIds: row.sourceIds,
          },
        ];
      })
      .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    add({
      id: 'evidence-timeline',
      kind: 'timeline',
      title: 'Chronological synthetic evidence',
      scope: scope(
        'Full synthetic event window; independent of trend filter',
        rows,
        from,
        '2026-10-15',
      ),
      sourceIds: [...new Set(items.flatMap((item) => item.sourceIds))],
      items,
    });
  }
  if (plan.views.includes('claims')) {
    const items = rows.flatMap((row) => {
      const sourceId = addSource(
        'CLAIMS',
        row.id,
        '2026-10-14 Shift supervisor reported “Scheduled maintenance is complete”. 2026-10-15 Field operator disputed closure: “Completion sign-off is still missing”. Both statements are retained; neither replaces measured observations.',
      );
      return [
        {
          id: `claim-supervisor-${row.id}`,
          wellId: row.id,
          author: 'Shift supervisor (synthetic)',
          at: '2026-10-14',
          text: 'Scheduled maintenance is complete.',
          status: 'reported' as const,
          sourceIds: [sourceId],
        },
        {
          id: `claim-operator-${row.id}`,
          wellId: row.id,
          author: 'Field operator (synthetic)',
          at: '2026-10-15',
          text: 'Completion sign-off is still missing; closure is disputed.',
          status: 'disputed' as const,
          sourceIds: [sourceId],
        },
        {
          id: `claim-inspection-${row.id}`,
          wellId: row.id,
          author: 'Weekly inspection (synthetic)',
          at: '2026-10-15',
          text: `Measured temperature difference ${row.deltaC} °C; this observation does not resolve the maintenance claims.`,
          status: 'observed' as const,
          sourceIds: row.sourceIds,
        },
      ];
    });
    add({
      id: 'competing-claims',
      kind: 'claims',
      title: 'Competing synthetic reports and observations',
      scope: scope(
        'Reports and observations retained separately; 14–15 Oct',
        rows,
        '2026-10-14',
        '2026-10-15',
      ),
      sourceIds: [...new Set(items.flatMap((item) => item.sourceIds))],
      items,
    });
  }
  if (plan.views.includes('correction'))
    for (const row of rows) {
      const original = String(100 + index(row.id) * 10);
      const proposed = String(105 + index(row.id) * 10);
      const sourceId = addSource(
        'CORRECTION',
        row.id,
        `Synthetic repair log record REPAIR-${row.id}: original labor duration ${original} minutes. Operator proposes ${proposed} minutes after checking the field note. Proposal only: no write, approval or recalculation has occurred. Original is retained.`,
      );
      add({
        id: `correction-${row.id}`,
        kind: 'correction',
        title: `${row.id} · proposed record correction`,
        scope: scope(
          'Read-only proposal recorded 15 Oct; independent of trend filter',
          [row],
          '2026-10-15',
          '2026-10-15',
        ),
        sourceIds: [sourceId],
        recordId: `REPAIR-${row.id}`,
        field: 'Labor duration',
        original,
        proposed,
        unit: 'minutes',
        reason: 'Synthetic operator proposal after checking a field note; awaiting human review.',
        impacts: [
          'Repair labor duration would change if approved.',
          'Recorded cost totals and inspection-derived downtime have not been recalculated.',
          'Original record remains available; this demo cannot apply changes.',
        ],
        state: 'proposed',
      });
    }
  return { artifacts, sources };
}
