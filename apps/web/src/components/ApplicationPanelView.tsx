import type { ApplicationPanel, ApplicationResult } from '@repo/contracts';
import { lazy, Suspense, useMemo, useState } from 'react';
import './artifact-view.css';
import './application-panel.css';

export type ApplicationPanelViewProps = {
  panel: ApplicationPanel;
  result: ApplicationResult;
  mode: 'inline' | 'focus';
  selected: string | null;
  onSelect: (assetId: string) => void;
  onEvidence: (evidenceId: string) => void;
};
const GeoView = lazy(() => import('./GeoView').then((module) => ({ default: module.GeoView })));
type Cell = ApplicationPanel['rows'][number][string] | undefined;
export const cellText = (value: Cell): string =>
  value === undefined
    ? 'Not returned'
    : value === null
      ? 'Unknown'
      : Array.isArray(value)
        ? value.join(', ')
        : typeof value === 'boolean'
          ? value
            ? 'Yes'
            : 'No'
          : String(value);

// Decimal sorting stays exact. Floating point projections below are for geometry only.
function compareDecimal(a: string, b: string) {
  const [ai = '0', af = ''] = a.split('.');
  const [bi = '0', bf = ''] = b.split('.');
  const scale = Math.max(af.length, bf.length);
  const integer = (whole: string, fraction: string) =>
    BigInt(
      `${whole.startsWith('-') ? '-' : ''}${whole.replace('-', '')}${fraction.padEnd(scale, '0')}`,
    );
  const x = integer(ai, af),
    y = integer(bi, bf);
  return x < y ? -1 : x > y ? 1 : 0;
}
function project(value: string | null | undefined): number | null {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
const evidenceLabels = new WeakMap<ApplicationResult, Map<string, string>>();
export function PanelEvidence({
  ids,
  result,
  onEvidence,
}: {
  ids: string[];
  result: ApplicationResult;
  onEvidence: (id: string) => void;
}) {
  let labels = evidenceLabels.get(result);
  if (!labels) {
    labels = new Map(result.evidence.map((source) => [source.id, source.label]));
    evidenceLabels.set(result, labels);
  }
  const unique = [...new Set(ids)];
  return (
    <span className="viz-sources">
      {unique.slice(0, 2).map((id) => (
        <button
          className="viz-source"
          type="button"
          key={id}
          onClick={() => onEvidence(id)}
          title={labels.get(id) ?? id}
        >
          <span>{(labels.get(id) ?? id).split('/').at(-1)}</span>
        </button>
      ))}
      {unique.length > 2 && (
        <button
          type="button"
          className="viz-source viz-source-more"
          aria-label={`Browse all ${unique.length} sources`}
          onClick={() => onEvidence(unique[2] ?? unique[0] ?? '')}
        >
          +{unique.length - 2} more
        </button>
      )}
    </span>
  );
}
function DataTable({ panel, result, selected, onSelect, onEvidence }: ApplicationPanelViewProps) {
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<{ key: string; direction: 1 | -1 } | null>(null);
  const rows = useMemo(() => {
    const entries = panel.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) =>
        panel.columns.some((column) =>
          cellText(row[column.key]).toLowerCase().includes(filter.toLowerCase()),
        ),
      );
    if (sort) {
      const column = panel.columns.find((entry) => entry.key === sort.key);
      entries.sort((a, b) => {
        const x = a.row[sort.key],
          y = b.row[sort.key];
        if (x == null || y == null) return x == null ? (y == null ? a.index - b.index : 1) : -1;
        const comparison =
          column?.valueType === 'decimal'
            ? compareDecimal(String(x), String(y))
            : typeof x === 'number' && typeof y === 'number'
              ? x - y
              : cellText(x).localeCompare(cellText(y));
        return comparison * sort.direction;
      });
    }
    return entries;
  }, [panel, filter, sort]);
  return (
    <div className="application-data">
      <div className="viz-toolbar">
        <label className="viz-control">
          Filter returned rows
          <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} />
        </label>
        <span className="viz-toolbar-note">
          {rows.length} of {panel.rows.length} returned rows
        </span>
      </div>
      <div className="viz-table-scroll">
        <table className="viz-table">
          <thead>
            <tr>
              {panel.columns.map((column) => (
                <th
                  key={column.key}
                  aria-sort={
                    sort?.key === column.key
                      ? sort.direction === 1
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    className="viz-text-button"
                    type="button"
                    onClick={() =>
                      setSort({
                        key: column.key,
                        direction: sort?.key === column.key && sort.direction === 1 ? -1 : 1,
                      })
                    }
                  >
                    {column.label}
                    {column.unit ? ` (${column.unit})` : ''}
                    {sort?.key === column.key ? (sort.direction === 1 ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row, index }) => (
              <tr
                key={index}
                className={
                  typeof row.assetId === 'string' && row.assetId === selected
                    ? 'application-selected-row'
                    : undefined
                }
              >
                {panel.columns.map((column) => (
                  <td key={column.key}>
                    {column.key === 'assetId' && typeof row.assetId === 'string' ? (
                      <button
                        className="viz-text-button"
                        type="button"
                        aria-pressed={selected === row.assetId}
                        onClick={() => onSelect(row.assetId as string)}
                      >
                        {row.assetId}
                      </button>
                    ) : (
                      cellText(row[column.key])
                    )}
                  </td>
                ))}
                <td>
                  <PanelEvidence
                    ids={Array.isArray(row.evidenceIds) ? row.evidenceIds : []}
                    result={result}
                    onEvidence={onEvidence}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="viz-chart-note">No returned rows match this filter.</p>}
    </div>
  );
}
function Status(props: ApplicationPanelViewProps) {
  const status = props.panel.status;
  if (!status) return <DataTable {...props} />;
  return (
    <>
      <div className="application-status">
        <button
          type="button"
          className="viz-text-button"
          onClick={() => props.onSelect(status.assetId)}
        >
          {status.assetId}
        </button>
        <strong>
          {status.producing === null
            ? 'Production unknown'
            : status.producing
              ? 'Producing'
              : 'Below threshold'}
        </strong>
        <dl>
          <div>
            <dt>Temperature difference</dt>
            <dd>{status.deltaC === null ? 'Unknown' : `${status.deltaC} °C`}</dd>
          </div>
          <div>
            <dt>Threshold</dt>
            <dd>{status.thresholdC === null ? 'Unknown' : `${status.thresholdC} °C`}</dd>
          </div>
          <div>
            <dt>Observed (UTC)</dt>
            <dd>{cellText(status.observedAt)}</dd>
          </div>
          <div>
            <dt>Recorded status</dt>
            <dd>{cellText(status.recordedStatus)}</dd>
          </div>
        </dl>
        <PanelEvidence
          ids={props.panel.evidenceIds}
          result={props.result}
          onEvidence={props.onEvidence}
        />
      </div>
      {props.panel.rows.length > 0 && (
        <details className="application-table-details">
          <summary>Returned records</summary>
          <DataTable {...props} />
        </details>
      )}
    </>
  );
}
function Ranking(props: ApplicationPanelViewProps) {
  const field = props.panel.resultBinding?.valueField;
  const column = props.panel.columns.find((entry) => entry.key === field);
  if (!column || !['decimal', 'integer'].includes(column.valueType))
    return <DataTable {...props} />;
  const values = props.panel.rows.map((row) =>
    typeof row[column.key] === 'string' || typeof row[column.key] === 'number'
      ? project(String(row[column.key]))
      : null,
  );
  const maximum = Math.max(
    0,
    ...values.flatMap((value) => (value === null ? [] : [Math.abs(value)])),
  );
  return (
    <>
      <p className="viz-chart-note">
        {column.label}
        {column.unit ? ` (${column.unit})` : ''} · Returned order; exact values shown. Bar length
        represents magnitude.
      </p>
      <div className="viz-bars application-ranking">
        {props.panel.rows.map((row, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Rows retain immutable backend order and contain no component state.
          <div className="viz-bar-row" key={index}>
            <div className="viz-bar-label">
              <span>
                {typeof row.assetId === 'string' ? (
                  <button
                    className="viz-text-button"
                    type="button"
                    onClick={() => props.onSelect(row.assetId as string)}
                  >
                    {cellText(row.name ?? row.assetId)}
                  </button>
                ) : (
                  cellText(row.name ?? row.group ?? row.area ?? row.region ?? row.areaId ?? row.id)
                )}
              </span>
              <strong>
                {cellText(row[column.key])}
                {column.unit ? ` ${column.unit}` : ''}
              </strong>
            </div>
            <div className="viz-bar-track" aria-hidden="true">
              <div
                className="application-bar"
                style={{
                  width: `${values[index] !== null && maximum > 0 ? (Math.abs(values[index] as number) / maximum) * 100 : 0}%`,
                }}
              />
            </div>
            <PanelEvidence
              ids={Array.isArray(row.evidenceIds) ? row.evidenceIds : []}
              result={props.result}
              onEvidence={props.onEvidence}
            />
          </div>
        ))}
      </div>
      <details className="application-table-details">
        <summary>Returned records and exact values</summary>
        <DataTable {...props} />
      </details>
    </>
  );
}
function Series(props: ApplicationPanelViewProps) {
  const [selection, setSelection] = useState<string>('');
  const series = props.panel.series ?? [];
  const active = series.find((entry) => entry.id === selection) ?? series[0];
  if (!active) return <DataTable {...props} />;
  const numeric = active.points.map((point) => project(point.value));
  const finite = numeric.filter((value): value is number => value !== null);
  const times = active.points.map((point) => Date.parse(point.at));
  const tMin = Math.min(...times),
    tMax = Math.max(...times);
  const min = Math.min(...finite),
    max = Math.max(...finite);
  const range = max - min;
  const drawable = Number.isFinite(range);
  const x = (index: number) =>
    tMax === tMin ? 320 : 45 + (((times[index] ?? tMin) - tMin) / (tMax - tMin)) * 550;
  const y = (value: number) => (max === min ? 115 : 195 - ((value - min) / range) * 160);
  return (
    <>
      <div className="viz-toolbar">
        <label className="viz-control">
          Series
          <select value={active.id} onChange={(event) => setSelection(event.target.value)}>
            {series.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <span className="viz-toolbar-note">{active.unit} · UTC · discrete observations</span>
      </div>
      <p className="viz-chart-note">
        {props.panel.seriesSemantics?.quantity ??
          props.panel.resultBinding?.quantity ??
          active.label}
        . Points are not interpolated; unknown observations have no plotted value.
      </p>
      {drawable && finite.length > 0 ? (
        <svg
          className="application-scatter"
          viewBox="0 0 640 240"
          role="img"
          aria-label={`${active.label}, ${active.unit}; exact observations and evidence in the table below`}
        >
          <path d="M45 25V195H595" fill="none" stroke="#d8deea" />
          {active.points.map((point, index) =>
            numeric[index] === null ? null : (
              <circle
                key={point.id}
                cx={x(index)}
                cy={y(numeric[index] as number)}
                r="4"
                fill="#4059d9"
              >
                <title>
                  {point.at}: {point.value} {active.unit}
                </title>
              </circle>
            ),
          )}
          <text x="45" y="224">
            {active.points[0]?.at.slice(0, 10)}
          </text>
          <text x="595" y="224" textAnchor="end">
            {active.points.at(-1)?.at.slice(0, 10)}
          </text>
        </svg>
      ) : (
        <p className="viz-chart-note">
          Values cannot be plotted on a finite numeric scale. Exact observations remain below.
        </p>
      )}
      <div className="viz-table-scroll">
        <table className="viz-table">
          <thead>
            <tr>
              <th>Observation ID</th>
              <th>Observed (UTC)</th>
              <th>Value ({active.unit})</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {active.points.map((point) => (
              <tr key={point.id}>
                <td>{point.id}</td>
                <td>{point.at}</td>
                <td>{cellText(point.value)}</td>
                <td>
                  <PanelEvidence
                    ids={point.evidenceIds}
                    result={props.result}
                    onEvidence={props.onEvidence}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="application-table-details">
        <summary>All returned records</summary>
        <DataTable {...props} />
      </details>
    </>
  );
}
function Matrix(props: ApplicationPanelViewProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const matrix = props.panel.matrix;
  if (!matrix) return <DataTable {...props} />;
  const cellMap = new Map(
    matrix.cells.map((cell) => [JSON.stringify([cell.rowId, cell.columnId]), cell]),
  );
  const maximum = Math.max(
    0,
    ...matrix.cells.flatMap((cell) => {
      const value = project(cell.value);
      return value === null ? [] : [Math.abs(value)];
    }),
  );
  const active = selected ? cellMap.get(selected) : undefined;
  return (
    <>
      <p className="viz-chart-note">
        {props.panel.resultBinding?.quantity ?? 'Returned matrix values'}. Unknown and unreturned
        cells are distinct; neither means zero.
      </p>
      <div className="viz-table-scroll">
        <table className="viz-matrix-table">
          <thead>
            <tr>
              <th>Group</th>
              {matrix.columns.map((column) => (
                <th key={column.id}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.id}>
                <th>{row.label}</th>
                {matrix.columns.map((column) => {
                  const key = JSON.stringify([row.id, column.id]);
                  const cell = cellMap.get(key);
                  const value = project(cell?.value);
                  return (
                    <td key={column.id}>
                      <button
                        type="button"
                        className={`viz-matrix-cell${cell?.value == null ? ' viz-matrix-missing' : ''}`}
                        aria-label={`${row.label}, ${column.label}: ${cellText(cell?.value)}`}
                        aria-pressed={selected === key}
                        onClick={() => setSelected(key)}
                        style={
                          value !== null
                            ? {
                                backgroundColor: `rgba(64,89,217,${0.05 + (maximum > 0 ? Math.abs(value) / maximum : 0) * 0.3})`,
                              }
                            : undefined
                        }
                      >
                        {cellText(cell?.value)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <div className="viz-cell-detail">
          <div>
            <strong>
              {matrix.rows.find((row) => row.id === JSON.parse(selected)[0])?.label} ·{' '}
              {matrix.columns.find((column) => column.id === JSON.parse(selected)[1])?.label}
            </strong>
            <span>{cellText(active?.value)}</span>
          </div>
          <PanelEvidence
            ids={active?.evidenceIds ?? []}
            result={props.result}
            onEvidence={props.onEvidence}
          />
        </div>
      )}
      <details className="application-table-details">
        <summary>Returned records and units</summary>
        <DataTable {...props} />
      </details>
    </>
  );
}
export function ApplicationPanelView(props: ApplicationPanelViewProps) {
  const { panel } = props;
  return (
    <div className={`artifact-view application-panel viz-${props.mode}`}>
      <div className="application-coverage">
        <span>
          Scope:{' '}
          {panel.parameters.assetIds?.length
            ? panel.parameters.assetIds.join(', ')
            : panel.parameters.scope.kind === 'asset'
              ? panel.parameters.scope.assetId
              : panel.parameters.scope.kind === 'area'
                ? panel.parameters.scope.area
                : 'Fleet'}
        </span>
        {panel.parameters.window && (
          <span>
            {panel.parameters.window.from} – {panel.parameters.window.through} (UTC)
          </span>
        )}
        <span>
          {panel.coverage.returnedRows} / {panel.coverage.totalRows} rows
          {panel.coverage.truncated ? ' · Truncated' : ''}
          {panel.coverage.assetsEvaluated !== undefined
            ? ` · ${panel.coverage.assetsEvaluated} assets evaluated`
            : ''}
        </span>
      </div>
      {[...new Set(panel.warnings)].map((warning) => (
        <p className="viz-data-notice" key={warning}>
          {warning}
        </p>
      ))}
      {panel.totals && (
        <dl className="application-totals">
          <div>
            <dt>Spill events</dt>
            <dd>{panel.totals.spillCount}</dd>
          </div>
          <div>
            <dt>Total volume</dt>
            <dd>{panel.totals.totalBbl} bbl</dd>
          </div>
          <div>
            <dt>Excluded false positives</dt>
            <dd>{panel.totals.excludedFalsePositives}</dd>
          </div>
          {panel.totals.unknownVolumeEvents !== undefined && (
            <div>
              <dt>Unknown volume events</dt>
              <dd>{panel.totals.unknownVolumeEvents}</dd>
            </div>
          )}
        </dl>
      )}
      {panel.state !== 'ready' ? (
        <p className="viz-chart-note" role="status">
          {panel.state === 'empty'
            ? 'No records were returned for this selection.'
            : panel.state === 'failed'
              ? 'This panel could not be produced.'
              : 'This panel is unavailable for this selection.'}
        </p>
      ) : panel.kind === 'geo' && panel.geo ? (
        <Suspense fallback={<p className="viz-map-loading">Loading map…</p>}>
          <GeoView {...props} />
        </Suspense>
      ) : panel.kind === 'bar' && panel.bar ? (
        <div role="img" aria-label="Repair delay reasons by area" className="operational-bars">
          {[...new Set(panel.rows.map((row) => String(row[panel.bar!.categoryField])))].map(
            (area) => (
              <div key={area} style={{ margin: '14px 0' }}>
                <strong>{area}</strong>
                <div
                  style={{
                    display: 'flex',
                    minHeight: 38,
                    borderRadius: 6,
                    overflow: 'hidden',
                    background: 'var(--surface-muted, #e7ece9)',
                  }}
                >
                  {panel.rows
                    .filter(
                      (row) =>
                        row[panel.bar!.categoryField] === area &&
                        row[panel.bar!.valueField] !== null,
                    )
                    .map((row, index) => {
                      const value = Number(row[panel.bar!.valueField]);
                      const reason = String(row[panel.bar!.seriesField]);
                      return (
                        <div
                          key={reason}
                          title={`${reason}: ${value}${panel.bar!.unit}; median extra days ${row.medianDays ?? 'unknown'}`}
                          style={{
                            width: `${Math.max(0, Math.min(100, value))}%`,
                            background: ['#356859', '#719c84', '#c0a66a', '#9a7965', '#8a94a8'][
                              index % 5
                            ],
                            color: '#fff',
                            fontSize: 11,
                            padding: value > 4 ? '8px 4px' : 0,
                            overflow: 'hidden',
                          }}
                        >
                          {value >= 12 ? `${reason} ${value}%` : ''}
                        </div>
                      );
                    })}
                </div>
              </div>
            ),
          )}
          <p className="subtle small">
            Share of measured extra-delay jobs. Hover a segment for its reason and median extra
            days; unknown coverage stays in the table.
          </p>
        </div>
      ) : panel.kind === 'status' ? (
        <Status {...props} />
      ) : panel.kind === 'ranking' ? (
        <Ranking {...props} />
      ) : panel.kind === 'series' ? (
        <Series {...props} />
      ) : panel.kind === 'matrix' ? (
        <Matrix {...props} />
      ) : (
        <DataTable {...props} />
      )}
      {!!panel.corrections?.length && (
        <details className="application-table-details">
          <summary>Correction audit ({panel.corrections.length})</summary>
          {panel.corrections.map((change) => (
            <div
              className="application-audit"
              key={`${change.assetId}:${change.inspectionId}:${change.action}`}
            >
              <strong>
                {change.assetId} · {change.inspectionId} · {change.action}
              </strong>
              <p>{change.reason}</p>
              <p>
                Original volume:{' '}
                {change.originalVolumeBbl === null ? 'Unknown' : `${change.originalVolumeBbl} bbl`}
              </p>
              <PanelEvidence
                ids={change.evidenceIds}
                result={props.result}
                onEvidence={props.onEvidence}
              />
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
