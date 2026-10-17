import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { Artifact, Evidence, OperationalVisual } from '../contracts';
const GeoView = lazy(() => import('./GeoView').then((module) => ({ default: module.GeoView })));
import './artifact-view.css';

type Presentation = 'auto' | 'table' | 'card';
type Props = {
  presentation?: Presentation;
  visual: OperationalVisual;
  mode: 'inline' | 'focus';
  selected: string | null;
  onSelect: (wellId: string) => void;
  onEvidence: (sourceId: string) => void;
};
type Shared = {
  presentation?: Presentation;
  evidence: Evidence[];
  onEvidence: Props['onEvidence'];
  mode: Props['mode'];
  selected: Props['selected'];
  onSelect: Props['onSelect'];
};
type Kind<K extends Artifact['kind']> = Extract<Artifact, { kind: K }>;
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const traceColors = ['#4059D9', '#8492BA', '#597B9A', '#67519C', '#4D8392'];
function dateLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
function fullDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
function valueLabel(value: number | null, unit: string) {
  if (value === null) return 'Unavailable';
  if (/^(usd|\$)$/i.test(unit))
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  return `${number.format(value)}${unit === '%' ? '' : ' '}${unit}`;
}
function Sources({
  ids,
  evidence,
  onEvidence,
}: {
  ids: string[];
  evidence: Evidence[];
  onEvidence: Props['onEvidence'];
}) {
  const records = ids
    .map((id) => evidence.find((source) => source.id === id))
    .filter((source): source is Evidence => !!source);
  return (
    <span className="viz-sources">
      {records.map((source, index) => (
        <button
          type="button"
          className="viz-source"
          key={source.id}
          onClick={() => onEvidence(source.id)}
          title={source.label}
        >
          {records.length > 1
            ? `Source ${index + 1}`
            : source.kind === 'calculation'
              ? 'Calculation'
              : 'Source'}{' '}
          <span aria-hidden="true">↗</span>
          <span className="viz-sr-only">: {source.label}</span>
        </button>
      ))}
    </span>
  );
}
function Empty({
  children = 'No records are available for this result.',
}: {
  children?: React.ReactNode;
}) {
  return <p className="viz-empty">{children}</p>;
}
function Status({ value }: { value: string }) {
  return (
    <span
      className={`viz-status ${['breach', 'pending', 'disputed', 'below-threshold'].includes(value) ? 'viz-warning' : ['compliant', 'producing', 'accepted'].includes(value) ? 'viz-good' : ''}`}
    >
      <i />
      {value.replaceAll('-', ' ')}
    </span>
  );
}
function Well({
  id,
  artifact,
  shared,
  label,
}: {
  id: string;
  artifact: Artifact;
  shared: Shared;
  label?: string;
}) {
  return artifact.scope.wellIds.includes(id) ? (
    <button
      type="button"
      className="viz-text-button"
      aria-pressed={shared.selected === id}
      onClick={() => shared.onSelect(id)}
    >
      {label ?? id}
    </button>
  ) : (
    <span>{label ?? id}</span>
  );
}

function GeoRecords({ artifact, ...shared }: Shared & { artifact: Kind<'geo'> }) {
  if (!artifact.points.length) return <Empty>No location records are available.</Empty>;
  const hasTemperature = artifact.points.some((point) => point.temperatureDeltaC != null);
  const hasThreshold = artifact.points.some((point) => point.temperatureThresholdC != null);
  const hasRecordedStatus = artifact.points.some((point) => point.recordedStatus);
  const hasReason = artifact.points.some((point) => point.reason);
  const hasInspection = artifact.points.some((point) => point.inspectedAt || point.inspector);
  if (shared.presentation === 'card')
    return (
      <div className="viz-asset-records">
        {artifact.points.map((point) => (
          <article className="viz-asset-record" key={point.id}>
            <div className="viz-asset-record-heading">
              <div>
                <Well id={point.wellId} label={point.label} artifact={artifact} shared={shared} />
                {point.wellType && <span>{point.wellType}</span>}
              </div>
              <Status value={point.status} />
            </div>
            <dl className="viz-asset-facts">
              {point.temperatureDeltaC != null && (
                <div>
                  <dt>Temperature difference</dt>
                  <dd>{valueLabel(point.temperatureDeltaC, '°C')}</dd>
                </div>
              )}
              {point.temperatureThresholdC != null && (
                <div>
                  <dt>Supplied threshold</dt>
                  <dd>{valueLabel(point.temperatureThresholdC, '°C')}</dd>
                </div>
              )}
              <div>
                <dt>Recorded spill</dt>
                <dd>{valueLabel(point.volumeBbl, 'bbl')}</dd>
              </div>
              {point.recordedStatus && (
                <div>
                  <dt>Recorded status</dt>
                  <dd>{point.recordedStatus}</dd>
                </div>
              )}
              <div>
                <dt>Coordinates</dt>
                <dd>
                  {point.lat === null || point.lon === null
                    ? 'Unavailable'
                    : `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`}
                </dd>
              </div>
              {point.inspectedAt && (
                <div>
                  <dt>Inspected (UTC)</dt>
                  <dd>
                    {new Date(point.inspectedAt).toLocaleString('en-US', {
                      timeZone: 'UTC',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </dd>
                </div>
              )}
              {point.inspector && (
                <div>
                  <dt>Inspector</dt>
                  <dd>{point.inspector}</dd>
                </div>
              )}
            </dl>
            {point.reason && (
              <div className="viz-asset-reason">
                <strong>Recorded reason</strong>
                <p>{point.reason}</p>
              </div>
            )}
            <Sources ids={point.sourceIds} {...shared} />
          </article>
        ))}
      </div>
    );
  return (
    <>
      <div className="viz-toolbar">
        <span className="viz-toolbar-note">{artifact.points.length} location records</span>
      </div>
      <div className="viz-table-scroll">
        <table className="viz-table viz-location-table">
          <caption className="viz-sr-only">Location records and source evidence</caption>
          <thead>
            <tr>
              <th scope="col">Asset</th>
              <th scope="col">Evaluated status</th>
              {hasRecordedStatus && <th scope="col">Recorded status</th>}
              {hasTemperature && <th scope="col">Temperature Δ</th>}
              {hasThreshold && <th scope="col">Threshold</th>}
              {hasReason && <th scope="col">Recorded reason</th>}
              <th scope="col">Spill volume</th>
              <th scope="col">Coordinates</th>
              {hasInspection && <th scope="col">Inspection</th>}
              <th scope="col">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {artifact.points.map((point) => (
              <tr
                key={point.id}
                className={shared.selected === point.wellId ? 'viz-selected-row' : ''}
              >
                <th scope="row">
                  <Well id={point.wellId} label={point.label} artifact={artifact} shared={shared} />
                  {point.wellType && (
                    <small className="viz-record-subtitle">{point.wellType}</small>
                  )}
                </th>
                <td>
                  <Status value={point.status} />
                </td>
                {hasRecordedStatus && <td>{point.recordedStatus ?? 'Unavailable'}</td>}
                {hasTemperature && (
                  <td className="viz-nowrap">
                    {valueLabel(point.temperatureDeltaC ?? null, '°C')}
                  </td>
                )}
                {hasThreshold && (
                  <td className="viz-nowrap">
                    {valueLabel(point.temperatureThresholdC ?? null, '°C')}
                  </td>
                )}
                {hasReason && (
                  <td className="viz-location-reason">{point.reason ?? 'Unavailable'}</td>
                )}
                <td className="viz-nowrap">{valueLabel(point.volumeBbl, 'bbl')}</td>
                <td className="viz-nowrap">
                  {point.lat === null || point.lon === null
                    ? 'Unavailable'
                    : `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`}
                </td>
                {hasInspection && (
                  <td className="viz-nowrap">
                    {point.inspectedAt ? (
                      <time dateTime={point.inspectedAt}>
                        {new Date(point.inspectedAt).toLocaleString('en-US', {
                          timeZone: 'UTC',
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}{' '}
                        UTC
                      </time>
                    ) : (
                      'Date unavailable'
                    )}
                    {point.inspector && (
                      <small className="viz-record-subtitle">{point.inspector}</small>
                    )}
                  </td>
                )}
                <td>
                  <Sources ids={point.sourceIds} {...shared} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SeriesView({ artifact, ...shared }: Shared & { artifact: Kind<'series'> }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [table, setTable] = useState(shared.presentation === 'table');
  const [difference, setDifference] = useState(false);
  const [tooltip, setTooltip] = useState(false);
  const titleId = useId();
  const chartRef = useRef<SVGSVGElement>(null);
  const [chartWidth, setChartWidth] = useState(640);
  useEffect(() => {
    if (table || !chartRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setChartWidth(Math.max(280, Math.round(width)));
    });
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [table, artifact.id]);
  const dates = useMemo(
    () =>
      [
        ...new Set(artifact.series.flatMap((series) => series.points.map((point) => point.date))),
      ].sort(),
    [artifact],
  );
  const wellhead = artifact.series.filter((series) => /\bwellhead\b/i.test(series.label));
  const ambient = artifact.series.filter((series) => /\b(?:ambient|air)\b/i.test(series.label));
  const canDifference =
    /^°?C$/i.test(artifact.unit) && wellhead.length === 1 && ambient.length === 1;
  const isDifference = canDifference && difference;
  const traces = isDifference
    ? [
        {
          id: 'display-temperature-difference',
          label: 'Wellhead − ambient',
          points: dates.map((date) => {
            const first = wellhead[0].points.find((point) => point.date === date)?.value;
            const second = ambient[0].points.find((point) => point.date === date)?.value;
            return { date, value: first == null || second == null ? null : first - second };
          }),
        },
      ]
    : artifact.series;
  const shown = traces.filter((series) => !hidden.includes(series.id));
  const color = (series: Kind<'series'>['series'][number]) =>
    traceColors[traces.indexOf(series) % traceColors.length];
  const values = shown.flatMap((series) =>
    series.points.flatMap((point) => (point.value === null ? [] : [point.value])),
  );
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values),
    span = max - min;
  const width = chartWidth,
    height = shared.mode === 'focus' ? 350 : 245,
    left = 53,
    right = width - 22,
    top = 24,
    bottom = height - 34;
  const first = Date.parse(artifact.scope.from),
    last = Date.parse(artifact.scope.to);
  const x = (date: string) =>
    first === last
      ? (left + right) / 2
      : left + ((Date.parse(date) - first) / (last - first)) * (right - left);
  const y = (value: number) => bottom - ((value - min) / span) * (bottom - top);
  const activeDate = hoverDate && dates.includes(hoverDate) ? hoverDate : dates.at(-1);
  if (!dates.length || !artifact.series.length)
    return <Empty>No time-series observations are available.</Empty>;
  function pointAtPointer(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * width;
    setHoverDate(
      dates.reduce(
        (nearest, date) =>
          Math.abs(x(date) - pointerX) < Math.abs(x(nearest) - pointerX) ? date : nearest,
        dates[0],
      ),
    );
    setTooltip(true);
  }
  function path(points: Kind<'series'>['series'][number]['points']) {
    let gap = true;
    return points
      .map((point) => {
        if (point.value === null) {
          gap = true;
          return '';
        }
        const command = `${gap ? 'M' : 'L'}${x(point.date)},${y(point.value)}`;
        gap = false;
        return command;
      })
      .join(' ');
  }
  return (
    <div className="viz-series">
      <div className="viz-toolbar">
        {canDifference && (
          <label className="viz-control">
            View{' '}
            <select
              value={isDifference ? 'difference' : 'raw'}
              onChange={(event) => {
                setDifference(event.target.value === 'difference');
                setHidden([]);
              }}
            >
              <option value="raw">Temperatures</option>
              <option value="difference">Wellhead − ambient</option>
            </select>
          </label>
        )}
        <div className="viz-legend">
          {traces.map((series, index) => (
            <button
              type="button"
              key={series.id}
              aria-pressed={!hidden.includes(series.id)}
              onClick={() =>
                setHidden((current) =>
                  current.includes(series.id)
                    ? current.filter((id) => id !== series.id)
                    : [...current, series.id],
                )
              }
            >
              <i style={{ background: traceColors[index % traceColors.length] }} />
              {series.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="viz-toggle"
          aria-pressed={table}
          onClick={() => setTable(!table)}
        >
          {table ? 'Show chart' : 'Read table'}
        </button>
      </div>
      {!table ? (
        <>
          <div className="viz-chart-readout" aria-live="polite">
            <span>{activeDate ? dateLabel(activeDate) : 'Select a date'}</span>
            {shown.map((series) => (
              <strong key={series.id}>
                <i style={{ background: color(series) }} />
                <span className="viz-sr-only">{series.label}: </span>
                {valueLabel(
                  series.points.find((point) => point.date === activeDate)?.value ?? null,
                  artifact.unit,
                )}
              </strong>
            ))}
          </div>
          <div className="viz-chart-plot">
            <svg
              ref={chartRef}
              className="viz-line-chart"
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-labelledby={titleId}
              onPointerMove={pointAtPointer}
              onPointerDown={pointAtPointer}
              onPointerLeave={() => setTooltip(false)}
            >
              <title id={titleId}>
                {traces.map((series) => series.label).join(' and ')} in {artifact.unit}. Missing
                observations appear as gaps. Use the date control or read table for values.
              </title>
              {[0, 1, 2, 3, 4].map((tick) => {
                const value = min + (span * tick) / 4;
                return (
                  <g key={tick}>
                    <line
                      x1={left}
                      x2={right}
                      y1={y(value)}
                      y2={y(value)}
                      className="viz-grid-line"
                    />
                    <text x={left - 12} y={y(value) + 4} textAnchor="end">
                      {compact.format(value)}
                    </text>
                  </g>
                );
              })}
              {dates
                .filter(
                  (_, index) =>
                    index === 0 ||
                    index === dates.length - 1 ||
                    (dates.length > 4 && index === Math.floor(dates.length / 2)),
                )
                .map((date) => (
                  <text key={date} x={x(date)} y={height - 8} textAnchor="middle">
                    {dateLabel(date)}
                  </text>
                ))}
              {artifact.events.map((event) => (
                <line
                  key={event.id}
                  x1={x(event.date)}
                  x2={x(event.date)}
                  y1={top}
                  y2={bottom}
                  className="viz-event-line"
                />
              ))}
              {shown.map((series) => (
                <g key={series.id}>
                  <path
                    d={path(series.points)}
                    fill="none"
                    stroke={color(series)}
                    strokeWidth="2.7"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {series.points
                    .filter((point) => point.value !== null)
                    .map((point) => (
                      <circle
                        key={point.date}
                        cx={x(point.date)}
                        cy={y(point.value!)}
                        r={point.date === activeDate ? 4.5 : series.points.length < 15 ? 2.5 : 0}
                        fill={color(series)}
                        stroke="white"
                        strokeWidth="1.5"
                      />
                    ))}
                </g>
              ))}
              {activeDate && (
                <line
                  x1={x(activeDate)}
                  x2={x(activeDate)}
                  y1={top}
                  y2={bottom}
                  className="viz-crosshair"
                />
              )}
            </svg>
            {tooltip && activeDate && shown.length > 0 && (
              <div
                className="viz-chart-tooltip"
                style={{
                  left: `${(Math.min(width - 172, Math.max(8, x(activeDate) - 82)) / width) * 100}%`,
                }}
              >
                <strong>{fullDate(activeDate)}</strong>
                {shown.slice(0, 5).map((series) => (
                  <div key={series.id}>
                    <span>
                      <i style={{ background: color(series) }} />
                      {series.label}
                    </span>
                    <b>
                      {valueLabel(
                        series.points.find((point) => point.date === activeDate)?.value ?? null,
                        artifact.unit,
                      )}
                    </b>
                  </div>
                ))}
              </div>
            )}
          </div>
          <label className="viz-date-control">
            Observation{' '}
            <select value={activeDate ?? ''} onChange={(event) => setHoverDate(event.target.value)}>
              {dates.map((date) => (
                <option key={date} value={date}>
                  {dateLabel(date)}
                </option>
              ))}
            </select>
            <span>{artifact.unit} · gaps indicate unavailable values</span>
          </label>
        </>
      ) : (
        <div className="viz-table-scroll">
          <table className="viz-table">
            <caption className="viz-sr-only">Time-series observations in {artifact.unit}</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                {shown.map((series) => (
                  <th scope="col" key={series.id}>
                    {series.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => (
                <tr key={date}>
                  <th scope="row">{dateLabel(date)}</th>
                  {shown.map((series) => (
                    <td key={series.id}>
                      {valueLabel(
                        series.points.find((point) => point.date === date)?.value ?? null,
                        artifact.unit,
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {isDifference && (
        <p className="viz-transform-note">
          Displayed difference = wellhead − ambient (°C). Missing inputs remain unavailable. Source
          observations are unchanged.
        </p>
      )}
      {!shown.length && (
        <p className="viz-chart-note" role="status">
          All series are hidden. Select a legend label to show its observations.
        </p>
      )}
      {shown.length > 0 && !values.length && (
        <p className="viz-chart-note" role="status">
          Values are unavailable for the selected series.
        </p>
      )}
      {artifact.events.length > 0 && (
        <div className="viz-events">
          {artifact.events.map((event) => (
            <div key={event.id}>
              <span className="viz-event-date">{dateLabel(event.date)}</span>
              <span>{event.label}</span>
              <Sources ids={event.sourceIds} {...shared} />
            </div>
          ))}
        </div>
      )}
      <div className="viz-source-footer">
        <span>Series evidence</span>
        <Sources ids={artifact.sourceIds} {...shared} />
      </div>
    </div>
  );
}

function RankingView({ artifact, ...shared }: Shared & { artifact: Kind<'ranking'> }) {
  const [table, setTable] = useState(shared.presentation === 'table');
  const [descending, setDescending] = useState(true);
  const items = [...artifact.items].sort((a, b) =>
    descending ? b.value - a.value : a.value - b.value,
  );
  const min = Math.min(0, ...items.map((item) => item.value)),
    max = Math.max(0, ...items.map((item) => item.value));
  const range = max - min || 1,
    zero = (-min / range) * 100;
  if (!items.length) return <Empty />;
  return (
    <div className="viz-ranking">
      <div className="viz-toolbar">
        <span className="viz-metric-label">
          {artifact.metricLabel} <span>({artifact.unit})</span>
        </span>
        <div className="viz-toolbar-actions">
          <button type="button" className="viz-toggle" onClick={() => setDescending(!descending)}>
            {descending ? 'Highest first' : 'Lowest first'} <span aria-hidden="true">↓</span>
          </button>
          <button
            type="button"
            className="viz-toggle"
            aria-pressed={table}
            onClick={() => setTable(!table)}
          >
            {table ? 'Show bars' : 'Read table'}
          </button>
        </div>
      </div>
      {table ? (
        <div className="viz-table-scroll">
          <table className="viz-table">
            <thead>
              <tr>
                <th scope="col">Location</th>
                <th scope="col">{artifact.metricLabel}</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={shared.selected === item.id ? 'viz-selected-row' : ''}>
                  <th scope="row">
                    <Well id={item.id} label={item.label} artifact={artifact} shared={shared} />
                  </th>
                  <td>{valueLabel(item.value, artifact.unit)}</td>
                  <td>
                    <Sources ids={item.sourceIds} {...shared} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="viz-bars">
            {items.map((item) => (
              <div
                className={`viz-bar-row ${shared.selected === item.id ? 'viz-selected-row' : ''}`}
                key={item.id}
              >
                <div className="viz-bar-label">
                  <Well id={item.id} label={item.label} artifact={artifact} shared={shared} />
                  <strong>{valueLabel(item.value, artifact.unit)}</strong>
                </div>
                <div className="viz-bar-track" aria-hidden="true">
                  <i className="viz-bar-zero" style={{ left: `${zero}%` }} />
                  <span
                    style={{
                      left: `${item.value < 0 ? ((item.value - min) / range) * 100 : zero}%`,
                      width: `${(Math.abs(item.value) / range) * 100}%`,
                    }}
                  />
                </div>
                <Sources ids={item.sourceIds} {...shared} />
              </div>
            ))}
          </div>
          <div className="viz-bar-axis" aria-label="Shared bar scale">
            <span>{valueLabel(min, artifact.unit)}</span>
            <span>{valueLabel(max, artifact.unit)}</span>
          </div>
        </>
      )}
    </div>
  );
}

function MatrixView({ artifact, ...shared }: Shared & { artifact: Kind<'matrix'> }) {
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const max = Math.max(
    1,
    ...artifact.cells.flatMap((cell) => (cell.value === null ? [] : [Math.abs(cell.value)])),
  );
  const active = artifact.cells.find(
    (cell) => JSON.stringify([cell.rowId, cell.columnId]) === selectedCell,
  );
  if (!artifact.rows.length || !artifact.columns.length)
    return <Empty>No matrix observations are available.</Empty>;
  return (
    <div className="viz-matrix">
      <div className="viz-toolbar">
        <span className="viz-metric-label">{artifact.unit}</span>
        <span className="viz-toolbar-note">Select a cell for its exact evidence</span>
      </div>
      <div className="viz-table-scroll">
        <table className="viz-matrix-table">
          <caption className="viz-sr-only">Matrix values in {artifact.unit}</caption>
          <thead>
            <tr>
              <th scope="col">Row / column</th>
              {artifact.columns.map((column) => (
                <th scope="col" key={column.id}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {artifact.rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <Well id={row.id} label={row.label} artifact={artifact} shared={shared} />
                </th>
                {artifact.columns.map((column) => {
                  const cell = artifact.cells.find(
                    (item) => item.rowId === row.id && item.columnId === column.id,
                  );
                  const key = JSON.stringify([row.id, column.id]);
                  return (
                    <td key={column.id}>
                      <button
                        type="button"
                        className={`viz-matrix-cell ${cell?.value == null ? 'viz-matrix-missing' : ''}`}
                        aria-pressed={selectedCell === key}
                        aria-label={`${row.label}, ${column.label}: ${valueLabel(cell?.value ?? null, artifact.unit)}`}
                        style={
                          cell?.value != null
                            ? {
                                background: `rgba(64,89,217,${0.04 + (Math.abs(cell.value) / max) * 0.2})`,
                              }
                            : {}
                        }
                        onClick={() => {
                          setSelectedCell(key);
                          if (artifact.scope.wellIds.includes(row.id)) shared.onSelect(row.id);
                        }}
                      >
                        {cell?.value == null ? '—' : number.format(cell.value)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="viz-cell-detail" aria-live="polite">
        {active ? (
          <>
            <div>
              <strong>{artifact.rows.find((row) => row.id === active.rowId)?.label}</strong>
              <span>
                {artifact.columns.find((column) => column.id === active.columnId)?.label} ·{' '}
                {valueLabel(active.value, artifact.unit)}
              </span>
            </div>
            <Sources ids={active.sourceIds} {...shared} />
          </>
        ) : (
          <p>
            Each cell preserves its recorded value. A dash means unavailable; zero is shown as 0.
          </p>
        )}
      </div>
    </div>
  );
}

function ObligationsView({ artifact, ...shared }: Shared & { artifact: Kind<'obligations'> }) {
  const [filter, setFilter] = useState('all');
  const items = artifact.items.filter((item) => filter === 'all' || item.status === filter);
  return (
    <div className="viz-obligations">
      <div className="viz-toolbar">
        <label className="viz-control">
          Show{' '}
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All obligations</option>
            <option value="breach">Breach</option>
            <option value="pending">Pending</option>
            <option value="compliant">Compliant</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <span className="viz-toolbar-note">
          {items.length} record{items.length === 1 ? '' : 's'}
        </span>
      </div>
      {!items.length ? (
        <Empty>No obligations match this status.</Empty>
      ) : (
        <div className="viz-table-scroll">
          <table className="viz-table viz-obligation-table">
            <thead>
              <tr>
                <th scope="col">Obligation / location</th>
                <th scope="col">Status</th>
                <th scope="col">Deadline</th>
                <th scope="col">Rule & evidence</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    <strong className="viz-record-title">{item.title}</strong>
                    <Well id={item.wellId} artifact={artifact} shared={shared} />
                  </th>
                  <td>
                    <Status value={item.status} />
                  </td>
                  <td className="viz-nowrap">
                    {item.dueAt ? fullDate(item.dueAt) : 'Unavailable'}
                  </td>
                  <td>
                    <details className="viz-details" open={shared.mode === 'focus' || undefined}>
                      <summary>View record</summary>
                      <div>
                        <p>
                          <strong>Rule</strong>
                          {item.rule}
                        </p>
                        <p>
                          <strong>Observed</strong>
                          {item.observed}
                        </p>
                        <Sources ids={item.sourceIds} {...shared} />
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TimelineView({ artifact, ...shared }: Shared & { artifact: Kind<'timeline'> }) {
  const [table, setTable] = useState(shared.presentation === 'table');
  const [category, setCategory] = useState('all');
  const categories = [...new Set(artifact.items.map((item) => item.category))];
  const items = [...artifact.items]
    .filter((item) => category === 'all' || item.category === category)
    .sort((a, b) => a.at.localeCompare(b.at));
  return (
    <div className="viz-timeline">
      <div className="viz-toolbar">
        <label className="viz-control">
          Events{' '}
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All event types</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {value[0].toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <span className="viz-toolbar-note">Oldest to newest</span>
        <button
          type="button"
          className="viz-toggle"
          aria-pressed={table}
          onClick={() => setTable(!table)}
        >
          {table ? 'Show timeline' : 'Read table'}
        </button>
      </div>
      {!items.length ? (
        <Empty>No events match this selection.</Empty>
      ) : table ? (
        <div className="viz-table-scroll">
          <table className="viz-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Event</th>
                <th scope="col">Details</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <th scope="row" className="viz-nowrap">
                    {fullDate(item.at)}
                  </th>
                  <td>
                    <span className="viz-category">{item.category}</span>
                    <strong className="viz-record-title">{item.title}</strong>
                  </td>
                  <td>{item.description}</td>
                  <td>
                    <Sources ids={item.sourceIds} {...shared} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ol className="viz-event-list">
          {items.map((item) => (
            <li key={item.id}>
              <time dateTime={item.at}>
                {dateLabel(item.at)}
                <small>{item.at.slice(0, 4)}</small>
              </time>
              <div className="viz-timeline-record">
                <span className="viz-category">{item.category}</span>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <Sources ids={item.sourceIds} {...shared} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ClaimsView({ artifact, ...shared }: Shared & { artifact: Kind<'claims'> }) {
  const [filter, setFilter] = useState('all');
  const items = artifact.items.filter((item) => filter === 'all' || item.status === filter);
  return (
    <div className="viz-claims">
      <div className="viz-toolbar">
        <label className="viz-control">
          Claims{' '}
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All statements</option>
            {['observed', 'reported', 'disputed', 'corrected'].map((status) => (
              <option key={status} value={status}>
                {status[0].toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <span className="viz-toolbar-note">Statements retain their authors and sources</span>
      </div>
      {!items.length ? (
        <Empty>No statements match this selection.</Empty>
      ) : (
        <div className="viz-claim-list">
          {items.map((item) => (
            <article key={item.id} className="viz-claim">
              <div className="viz-claim-meta">
                <span className="viz-author-avatar" aria-hidden="true">
                  {item.author.slice(0, 1)}
                </span>
                <strong>{item.author}</strong>
                <time dateTime={item.at}>{fullDate(item.at)}</time>
                <Status value={item.status} />
              </div>
              <p>{item.text}</p>
              <div className="viz-claim-footer">
                <Well id={item.wellId} artifact={artifact} shared={shared} />
                <Sources ids={item.sourceIds} {...shared} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function CorrectionView({ artifact, ...shared }: Shared & { artifact: Kind<'correction'> }) {
  return (
    <div className="viz-correction">
      <div className="viz-correction-meta">
        <span>
          Record <strong>{artifact.recordId}</strong>
        </span>
        <Status value={artifact.state} />
        <span className="viz-readonly">Read only</span>
      </div>
      <div className="viz-correction-comparison">
        <div>
          <span>Original · {artifact.field}</span>
          <strong>
            {artifact.original === '' ? '(empty)' : artifact.original}
            <small>{artifact.unit}</small>
          </strong>
        </div>
        <span className="viz-correction-arrow" aria-hidden="true">
          →
        </span>
        <div>
          <span>Proposed · {artifact.field}</span>
          <strong>
            {artifact.proposed === '' ? '(empty)' : artifact.proposed}
            <small>{artifact.unit}</small>
          </strong>
        </div>
      </div>
      <div className="viz-correction-reason">
        <strong>Reason for correction</strong>
        <p>{artifact.reason}</p>
      </div>
      <div className="viz-impact">
        <strong>Reported downstream impact</strong>
        {artifact.impacts.length ? (
          <ul>
            {artifact.impacts.map((impact, index) => (
              <li key={index}>{impact}</li>
            ))}
          </ul>
        ) : (
          <p>No downstream impacts supplied.</p>
        )}
      </div>
      <div className="viz-source-footer">
        <span>Correction evidence</span>
        <Sources ids={artifact.sourceIds} {...shared} />
      </div>
    </div>
  );
}

export function ArtifactView({
  visual,
  mode,
  selected,
  onSelect,
  onEvidence,
  presentation = 'auto',
}: Props) {
  const artifact = visual.artifact;
  const shared: Shared = {
    evidence: visual.evidence,
    mode,
    selected,
    onSelect,
    onEvidence,
    presentation,
  };
  return (
    <div className={`artifact-view viz-${mode}`}>
      {artifact.kind === 'geo' ? (
        presentation !== 'auto' ? (
          <GeoRecords artifact={artifact} {...shared} />
        ) : (
          <Suspense
            fallback={
              <p className="viz-map-loading" role="status">
                Loading location map…
              </p>
            }
          >
            <GeoView artifact={artifact} {...shared} />
          </Suspense>
        )
      ) : artifact.kind === 'series' ? (
        <SeriesView artifact={artifact} {...shared} />
      ) : artifact.kind === 'ranking' ? (
        <RankingView artifact={artifact} {...shared} />
      ) : artifact.kind === 'matrix' ? (
        <MatrixView artifact={artifact} {...shared} />
      ) : artifact.kind === 'obligations' ? (
        <ObligationsView artifact={artifact} {...shared} />
      ) : artifact.kind === 'timeline' ? (
        <TimelineView artifact={artifact} {...shared} />
      ) : artifact.kind === 'claims' ? (
        <ClaimsView artifact={artifact} {...shared} />
      ) : (
        <CorrectionView artifact={artifact} {...shared} />
      )}
      {(visual.meta.completeness !== 'complete' || visual.meta.warnings.length > 0) && (
        <div className="viz-data-notice" role="note">
          {visual.meta.completeness !== 'complete' && (
            <span>Data completeness: {visual.meta.completeness}.</span>
          )}
          {visual.meta.warnings.map((warning, index) => (
            <p key={index}>{warning}</p>
          ))}
        </div>
      )}
    </div>
  );
}
