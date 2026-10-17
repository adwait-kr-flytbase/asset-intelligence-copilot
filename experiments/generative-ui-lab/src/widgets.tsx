import { createContext, type ReactNode, useContext } from 'react';
import type { Result, ViewKind, Well } from './protocol';

export interface InvestigationContext {
  result: Result;
  area: string;
  selected: string;
  onSelect: (id: string) => void;
  onEvidence: (id: string) => void;
  onAction: (name: string, context: Record<string, unknown>) => void;
}
export const Investigation = createContext<InvestigationContext | null>(null);
function useInvestigation() {
  const value = useContext(Investigation);
  if (!value) throw Error('Investigation context is missing');
  return value;
}
export const viewTitles: Record<ViewKind, string> = {
  status: 'At a glance',
  table: 'Inspection evidence',
  line: 'Temperature above ambient',
  bar: 'Inspection-derived downtime',
  map: 'Well locations',
  heatmap: 'Spill distribution',
  conflicts: 'Conflicting observations',
};
function SourceButton({ row }: { row: Well }) {
  const c = useInvestigation();
  return (
    <button type="button" className="text-button" onClick={() => c.onEvidence(row.sourceIds[0])}>
      Evidence
    </button>
  );
}
function Status({ rows }: { rows: Well[] }) {
  const { result } = useInvestigation();
  const count = rows.filter((w) => !w.producing).length;
  const metric =
    result.query === 'downtime'
      ? {
          value: rows.reduce((s, w) => s + w.downtimeDays, 0),
          unit: 'days',
          label: 'Inspection-derived downtime',
        }
      : result.query === 'spills'
        ? {
            value: Number(rows.reduce((s, w) => s + w.spillBbl, 0).toFixed(1)),
            unit: 'bbl',
            label: 'Recorded spill volume',
          }
        : {
            value: count,
            unit: `of ${rows.length} wells`,
            label: 'Below the production threshold',
          };
  return (
    <div className="status-content">
      <div>
        <p className="metric-label">{metric.label}</p>
        <p className="metric-value">
          {metric.value}
          <span>{metric.unit}</span>
        </p>
      </div>
      <div className="status-notes">
        <p>
          <span className="dot teal" />
          {rows.filter((w) => w.producing).length} producing at latest inspection
        </p>
        <p>
          <span className="dot amber" />
          {rows.filter((w) => w.conflicts.length).length} wells with conflicting records
        </p>
        <p className="muted">Snapshot: 15 Oct 2026 · {rows.length} synthetic wells</p>
      </div>
    </div>
  );
}
function Table({ rows }: { rows: Well[] }) {
  const c = useInvestigation();
  return (
    <div className="table-scroll">
      <table>
        <caption className="sr-only">
          Synthetic weekly inspection results, {c.result.period}
        </caption>
        <thead>
          <tr>
            <th scope="col">Well / area</th>
            <th scope="col">Latest production</th>
            <th scope="col">Δ temperature</th>
            <th scope="col">Downtime</th>
            <th scope="col">Spill</th>
            <th scope="col">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.id} className={c.selected === w.id ? 'selected-row' : ''}>
              <th scope="row">
                <button
                  type="button"
                  className="well-link"
                  aria-pressed={c.selected === w.id}
                  onClick={() => c.onSelect(w.id)}
                >
                  {w.id}
                </button>
                <small>{w.area}</small>
              </th>
              <td>
                <span className={`state ${w.producing ? 'running' : 'stopped'}`}>
                  {w.producing ? 'Producing' : 'Below threshold'}
                </span>
              </td>
              <td>
                {w.deltaC.toFixed(1)} °C<small>Rule ≥ {w.thresholdC} °C</small>
              </td>
              <td>{w.downtimeDays} days</td>
              <td>{w.spillBbl.toFixed(1)} bbl</td>
              <td>
                <SourceButton row={w} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Line({ rows }: { rows: Well[] }) {
  const c = useInvestigation(),
    well = rows.find((w) => w.id === c.selected) || rows[0];
  if (!well) return <p>No wells in this selection.</p>;
  const x = (i: number) => 55 + i * 135,
    y = (v: number) => 170 - v * 4.4;
  const segments: string[] = [];
  let current: string[] = [];
  well.trend.forEach((p, i) => {
    if (p.deltaC === null) {
      if (current.length) segments.push(current.join(' '));
      current = [];
    } else current.push(`${x(i)},${y(p.deltaC)}`);
  });
  if (current.length) segments.push(current.join(' '));
  return (
    <>
      <div className="widget-subtitle">
        {well.id} · {well.type} · select a well in the table or map
      </div>
      <svg
        className="plot"
        viewBox="0 0 510 210"
        role="img"
        aria-label={`Temperature difference for ${well.id}; production threshold ${well.thresholdC} °C. Missing inspections are gaps.`}
      >
        {[0, 10, 20, 30].map((v) => (
          <g key={v}>
            <line x1="45" x2="480" y1={y(v)} y2={y(v)} stroke="#e6edf0" />
            <text x="10" y={y(v) + 4}>
              {v}°
            </text>
          </g>
        ))}
        <line
          x1="45"
          x2="480"
          y1={y(well.thresholdC)}
          y2={y(well.thresholdC)}
          stroke="#b26a16"
          strokeDasharray="6 5"
        />
        {segments.map((s) => (
          <polyline key={s} points={s} fill="none" stroke="#147d78" strokeWidth="3" />
        ))}
        {well.trend.map((p, i) => (
          <g key={p.date}>
            {p.deltaC !== null && (
              <circle
                cx={x(i)}
                cy={y(p.deltaC)}
                r="5"
                fill={p.deltaC < well.thresholdC ? '#b26a16' : '#147d78'}
              />
            )}
            <text x={x(i)} y="197" textAnchor="middle">
              {p.date.slice(5)}
            </text>
          </g>
        ))}
      </svg>
      <details>
        <summary>Read chart values and rule</summary>
        <p>
          Dashed line: producing at ≥ {well.thresholdC} °C above ambient. Gaps indicate missing
          observations.
        </p>
        <ul>
          {well.trend.map((p) => (
            <li key={p.date}>
              {p.date}: {p.deltaC === null ? 'Not observed' : `${p.deltaC} °C`}
            </li>
          ))}
        </ul>
        <SourceButton row={well} />
      </details>
    </>
  );
}
function Bar({ rows }: { rows: Well[] }) {
  const c = useInvestigation();
  return (
    <>
      <p className="widget-subtitle">
        7 days per non-producing inspection; missing observations add zero.
      </p>
      <div className="bars">
        {[...rows]
          .sort((a, b) => b.downtimeDays - a.downtimeDays)
          .map((w) => (
            <div className="bar-row" key={w.id}>
              <button type="button" className="well-link" onClick={() => c.onSelect(w.id)}>
                {w.id}
              </button>
              <div className="bar-track">
                <div style={{ width: `${(w.downtimeDays / 28) * 100}%` }} />
              </div>
              <span>{w.downtimeDays} d</span>
              <SourceButton row={w} />
            </div>
          ))}
      </div>
    </>
  );
}
function CoordinateMap({ rows }: { rows: Well[] }) {
  const c = useInvestigation(),
    located = rows.filter((w) => w.lat !== null && w.lon !== null),
    missing = rows.length - located.length;
  return (
    <>
      <p className="widget-subtitle">Coordinate map · synthetic positions · no basemap</p>
      {/* biome-ignore lint/a11y/useSemanticElements: Interactive SVG groups require SVG semantics. */}
      <svg
        className="map-plot"
        viewBox="0 0 510 250"
        role="group"
        aria-label="Synthetic well locations. Use Tab and Enter to select a well."
      >
        <rect width="510" height="250" fill="#edf5f6" rx="8" />
        {[80, 160, 240, 320, 400, 480].map((x) => (
          <line key={x} x1={x} x2={x} y1="15" y2="230" stroke="#d5e4e7" />
        ))}
        {[45, 90, 135, 180, 225].map((y) => (
          <line key={y} x1="25" x2="490" y1={y} y2={y} stroke="#d5e4e7" />
        ))}
        <text x="32" y="30" className="map-label">
          North ridge
        </text>
        <text x="32" y="222" className="map-label">
          South basin
        </text>
        {located.map((w) => {
          const x = 55 + ((w.lon! + 102.3) / 0.09) * 390,
            y = 215 - ((w.lat! - 31.88) / 0.09) * 175;
          return (
            // biome-ignore lint/a11y/useSemanticElements: An SVG marker cannot be replaced with an HTML button; it has keyboard support.
            <g
              key={w.id}
              tabIndex={0}
              role="button"
              aria-label={`Select ${w.id}, ${w.producing ? 'producing' : 'below threshold'}, ${w.spillBbl} bbl spills`}
              aria-pressed={c.selected === w.id}
              onClick={() => c.onSelect(w.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  c.onSelect(w.id);
                }
              }}
            >
              <circle
                cx={x}
                cy={y}
                r={c.selected === w.id ? 13 : 9}
                fill={w.producing ? '#147d78' : '#b26a16'}
                stroke="white"
                strokeWidth="3"
              />
              <text x={x + 15} y={y + 4}>
                {w.id}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="widget-footnote">
        Teal: producing. Amber: below threshold.{' '}
        {missing
          ? `${missing} well omitted: coordinates missing.`
          : 'All selected wells have coordinates.'}
      </p>
      <details>
        <summary>Read locations as a list</summary>
        <ul>
          {rows.map((w) => (
            <li key={w.id}>
              {w.id}:{' '}
              {w.lat === null
                ? 'Coordinates unavailable'
                : `${w.lat.toFixed(2)}°, ${w.lon!.toFixed(2)}°`}
              , {w.spillBbl} bbl · <SourceButton row={w} />
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
function Heatmap({ rows }: { rows: Well[] }) {
  const c = useInvestigation();
  const months = ['Sep 2026', 'Oct 2026'];
  // Count recorded event dates; no well-specific rules live in the renderer.
  return (
    <>
      <p className="widget-subtitle">
        Count of synthetic spill events · one event per spill-positive well
      </p>
      <div className="table-scroll">
        <table className="heatmap">
          <caption className="sr-only">Spill-event counts by area and month</caption>
          <thead>
            <tr>
              <th>Area</th>
              {months.map((m) => (
                <th key={m}>{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {['North ridge', 'South basin'].map((area) => (
              <tr key={area}>
                <th scope="row">{area}</th>
                {months.map((m, i) => {
                  const matches = rows.filter(
                    (w) =>
                      w.area === area &&
                      w.spillBbl > 0 &&
                      w.spillDate?.startsWith(i === 0 ? '2026-09' : '2026-10'),
                  );
                  return (
                    <td key={m}>
                      <button
                        type="button"
                        className={`heat-cell level-${matches.length}`}
                        aria-label={`${area}, ${m}: ${matches.length} spill events`}
                        onClick={() => {
                          c.onAction('inspectHeatmap', { area, month: m, count: matches.length });
                          if (matches[0]) c.onEvidence(matches[0].sourceIds[0]);
                        }}
                      >
                        {matches.length}
                        <small>events</small>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="widget-footnote">
        Zero means no recorded event in this complete synthetic window. Select a nonzero cell for
        supporting evidence.
      </p>
    </>
  );
}
function Conflicts({ rows }: { rows: Well[] }) {
  const matches = rows.filter((w) => w.conflicts.length);
  return matches.length ? (
    <div className="conflicts">
      {matches.map((w) => (
        <div className="conflict" key={w.id}>
          <span className="conflict-icon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>{w.id}</strong>
            {w.conflicts.map((text) => (
              <p key={text}>{text}</p>
            ))}
            <SourceButton row={w} />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p>No conflicting observations in this selection.</p>
  );
}
export function OperationalView({
  kind,
  resultId,
  dispatch,
}: {
  kind: ViewKind;
  resultId: string;
  dispatch?: (name: string, context: Record<string, unknown>) => void;
}) {
  const c = useInvestigation();
  if (resultId !== c.result.id) throw Error('Unknown result reference');
  const rows = c.result.rows.filter((w) => c.area === 'All areas' || w.area === c.area);
  const inner: Record<ViewKind, ReactNode> = {
    status: <Status rows={rows} />,
    table: <Table rows={rows} />,
    line: <Line rows={rows} />,
    bar: <Bar rows={rows} />,
    map: <CoordinateMap rows={rows} />,
    heatmap: <Heatmap rows={rows} />,
    conflicts: <Conflicts rows={rows} />,
  };
  const childContext = dispatch
    ? {
        ...c,
        onSelect: (id: string) => dispatch('selectWell', { wellId: id }),
        onEvidence: (id: string) => dispatch('openEvidence', { sourceId: id }),
        onAction: dispatch,
      }
    : c;
  return (
    <Investigation.Provider value={childContext}>
      <section className={`widget widget-${kind}`} data-widget={kind}>
        <header className="widget-heading">
          <h3>{viewTitles[kind]}</h3>
          <span>
            {kind === 'conflicts'
              ? 'Review'
              : kind === 'status'
                ? 'Latest observation'
                : c.result.period}
          </span>
        </header>
        {rows.length ? (
          inner[kind]
        ) : (
          <p className="empty-inline">No records match this selection.</p>
        )}
      </section>
    </Investigation.Provider>
  );
}
