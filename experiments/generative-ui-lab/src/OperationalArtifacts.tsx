import { type ReactNode, useId, useState } from 'react';
import type { Artifact } from './artifact-contract';
import './OperationalArtifacts.css';

export interface OperationalArtifactProps {
  artifact: Artifact;
  onEvidence: (id: string) => void;
  onSelect: (id: string) => void;
  selected: string;
}
type OfKind<K extends Artifact['kind']> = Extract<Artifact, { kind: K }>;
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const shortDate = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
const fullDate = (date: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
function valueLabel(value: number | null, unit: string) {
  if (value === null) return 'Not observed';
  if (['USD', 'GBP', 'EUR'].includes(unit)) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: unit,
      maximumFractionDigits: 2,
    }).format(value);
  }
  return unit === '$'
    ? `$${number.format(value)}`
    : `${number.format(value)}${unit === '%' ? '' : ' '}${unit}`.trim();
}
function Evidence({ ids, onEvidence }: { ids: string[]; onEvidence: (id: string) => void }) {
  return ids.length ? (
    <fieldset className="artifact-evidence" aria-label="Supporting sources">
      {ids.map((id, index) => (
        <button key={id} type="button" title={id} onClick={() => onEvidence(id)}>
          Source {index + 1}
          <span className="artifact-sr">: {id}</span>
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
            <path d="M5 3h8v8M13 3l-9 9" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      ))}
    </fieldset>
  ) : (
    <p className="artifact-note">No linked source in this snapshot.</p>
  );
}
function Empty({ children }: { children: string }) {
  return <p className="artifact-empty">{children}</p>;
}
function Scope({ artifact }: { artifact: Artifact }) {
  return (
    <p className="artifact-scope">
      <span>{artifact.scope.label}</span>
      <span>
        {fullDate(artifact.scope.from)} – {fullDate(artifact.scope.to)}
      </span>
    </p>
  );
}
const palette = ['#147d78', '#b36b22', '#526bb1', '#8d557a', '#43748b', '#738433'];
function Series({
  artifact,
  onEvidence,
}: Omit<OperationalArtifactProps, 'artifact'> & { artifact: OfKind<'series'> }) {
  const chartId = useId();
  const [hidden, setHidden] = useState<string[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);
  const visible = artifact.series.filter((series) => !hidden.includes(series.id));
  const dates = [
    ...new Set([
      ...artifact.series.flatMap((series) => series.points.map((point) => point.date)),
      ...artifact.events.map((event) => event.date),
    ]),
  ].sort();
  const values = visible.flatMap((series) =>
    series.points.flatMap((point) => (point.value === null ? [] : [point.value])),
  );
  const first = Date.parse(dates[0] ?? artifact.scope.from);
  const last = Date.parse(dates.at(-1) ?? artifact.scope.to);
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 1;
  const margin = high === low ? Math.max(Math.abs(high) * 0.1, 1) : (high - low) * 0.15;
  const min = low - margin,
    max = high + margin;
  const x = (date: string) =>
    last === first ? 346 : 58 + ((Date.parse(date) - first) / (last - first)) * 576;
  const y = (value: number) => 210 - ((value - min) / (max - min)) * 176;
  const ticks = dates.filter(
    (_, index) =>
      index === 0 ||
      index === dates.length - 1 ||
      index % Math.max(1, Math.ceil(dates.length / 4)) === 0,
  );
  const activeEvent = artifact.events.find((event) => event.id === eventId);
  if (!artifact.series.length) return <Empty>No series were returned for this scope.</Empty>;
  return (
    <>
      <fieldset className="artifact-legend" aria-label="Visible chart series">
        {artifact.series.map((series, index) => (
          <button
            key={series.id}
            type="button"
            aria-pressed={!hidden.includes(series.id)}
            onClick={() =>
              setHidden((current) =>
                current.includes(series.id)
                  ? current.filter((id) => id !== series.id)
                  : [...current, series.id],
              )
            }
          >
            <span
              className="artifact-line-key"
              style={{ background: palette[index % palette.length] }}
            />
            {series.label}
          </button>
        ))}
        <span className="artifact-unit">{artifact.unit}</span>
      </fieldset>
      {values.length ? (
        <svg
          className="artifact-series-chart"
          viewBox="0 0 664 250"
          role="img"
          aria-labelledby={chartId}
        >
          <title id={chartId}>
            {artifact.title}. {visible.length} visible series. Gaps represent missing observations.
            Chart values are available below.
          </title>
          {[0, 1, 2, 3, 4].map((tick) => {
            const value = min + ((max - min) * tick) / 4;
            return (
              <g key={tick}>
                <line x1="58" x2="634" y1={y(value)} y2={y(value)} className="artifact-gridline" />
                <text x="48" y={y(value) + 4} textAnchor="end">
                  {number.format(value)}
                </text>
              </g>
            );
          })}
          {artifact.events.map((event) => (
            <line
              key={event.id}
              x1={x(event.date)}
              x2={x(event.date)}
              y1="25"
              y2="212"
              className={
                eventId === event.id ? 'artifact-event-line active' : 'artifact-event-line'
              }
            />
          ))}
          {artifact.series.map((series, index) => {
            if (hidden.includes(series.id)) return null;
            const paths: string[] = [];
            let segment = '';
            for (const point of series.points) {
              if (point.value === null) {
                if (segment) paths.push(segment);
                segment = '';
              } else segment += `${segment ? ' L' : 'M'}${x(point.date)},${y(point.value)}`;
            }
            if (segment) paths.push(segment);
            const color = palette[index % palette.length];
            return (
              <g key={series.id}>
                {paths.map((path) => (
                  <path
                    key={path}
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {series.points.map((point) =>
                  point.value === null ? null : (
                    <circle
                      key={point.date}
                      cx={x(point.date)}
                      cy={y(point.value)}
                      r="3.5"
                      fill={color}
                      stroke="#fff"
                      strokeWidth="1.5"
                    >
                      <title>
                        {series.label}, {fullDate(point.date)}:{' '}
                        {valueLabel(point.value, artifact.unit)}
                      </title>
                    </circle>
                  ),
                )}
              </g>
            );
          })}
          {ticks.map((date) => (
            <text key={date} x={x(date)} y="238" textAnchor="middle">
              {shortDate(date)}
            </text>
          ))}
        </svg>
      ) : (
        <Empty>
          {!artifact.series.some((series) => series.points.length > 0)
            ? 'No temperature observations in the selected trend window.'
            : visible.length
              ? 'No observed values in the visible series. Missing values remain in the data table.'
              : 'All series are hidden. Select a legend label to show a series.'}
        </Empty>
      )}
      <p className="artifact-note">
        Missing observations appear as gaps. Event markers refer to the records below.
      </p>
      {artifact.events.length > 0 && (
        <fieldset className="artifact-events" aria-label="Events on this chart">
          {artifact.events.map((event) => (
            <button
              type="button"
              key={event.id}
              aria-pressed={eventId === event.id}
              onClick={() => setEventId(event.id)}
            >
              <time dateTime={event.date}>{shortDate(event.date)}</time>
              {event.label}
            </button>
          ))}
        </fieldset>
      )}
      {activeEvent && (
        <div className="artifact-detail" aria-live="polite">
          <strong>{activeEvent.label}</strong>
          <p>{fullDate(activeEvent.date)}</p>
          <Evidence ids={activeEvent.sourceIds} onEvidence={onEvidence} />
        </div>
      )}
      <details className="artifact-data">
        <summary>Read chart values & sources</summary>
        <div className="artifact-table-scroll">
          <table>
            <caption className="artifact-sr">
              All series including hidden lines and missing observations
            </caption>
            <thead>
              <tr>
                <th scope="col">Series</th>
                <th scope="col">Observed</th>
                <th scope="col">Value ({artifact.unit})</th>
              </tr>
            </thead>
            <tbody>
              {artifact.series.flatMap((series) =>
                series.points.map((point) => (
                  <tr key={`${series.id}-${point.date}`}>
                    <th scope="row">{series.label}</th>
                    <td>{fullDate(point.date)}</td>
                    <td>{valueLabel(point.value, artifact.unit)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        <Evidence ids={artifact.sourceIds} onEvidence={onEvidence} />
      </details>
    </>
  );
}
function Ranking({
  artifact,
  onEvidence,
  onSelect,
  selected,
}: Omit<OperationalArtifactProps, 'artifact'> & { artifact: OfKind<'ranking'> }) {
  const [order, setOrder] = useState('descending');
  const [localItemId, setLocalItemId] = useState<string | null>(null);
  const activeId = localItemId ?? (artifact.scope.wellIds.includes(selected) ? selected : null);
  const items = [...artifact.items].sort((a, b) =>
    order === 'descending' ? b.value - a.value : a.value - b.value,
  );
  const min = Math.min(0, ...items.map((item) => item.value));
  const max = Math.max(0, ...items.map((item) => item.value));
  const span = max - min || 1;
  const zero = (-min / span) * 100;
  const active = artifact.items.find((item) => item.id === activeId);
  if (!items.length) return <Empty>No comparisons were returned for this scope.</Empty>;
  return (
    <>
      <div className="artifact-toolbar">
        <span>
          {artifact.metricLabel} · {artifact.unit}
        </span>
        <label>
          Order{' '}
          <select value={order} onChange={(event) => setOrder(event.target.value)}>
            <option value="descending">Highest first</option>
            <option value="ascending">Lowest first</option>
          </select>
        </label>
      </div>
      <ol className="artifact-rank-list">
        {items.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              className="artifact-rank-row"
              aria-pressed={activeId === item.id}
              onClick={() => {
                if (artifact.scope.wellIds.includes(item.id)) {
                  setLocalItemId(null);
                  onSelect(item.id);
                } else {
                  setLocalItemId(item.id);
                }
              }}
            >
              <span className="artifact-rank-position">{index + 1}</span>
              <span className="artifact-rank-label">{item.label}</span>
              <span className="artifact-rank-value">{valueLabel(item.value, artifact.unit)}</span>
              <span className="artifact-rank-track" aria-hidden="true">
                <span className="artifact-zero" style={{ left: `${zero}%` }} />
                <span
                  className={item.value < 0 ? 'artifact-rank-fill negative' : 'artifact-rank-fill'}
                  style={{
                    left: `${Math.min(zero, ((item.value - min) / span) * 100)}%`,
                    width: `${(Math.abs(item.value) / span) * 100}%`,
                  }}
                />
              </span>
            </button>
          </li>
        ))}
      </ol>
      {active ? (
        <div className="artifact-detail" aria-live="polite">
          <strong>{active.label}</strong>
          <p>
            {artifact.metricLabel}: {valueLabel(active.value, artifact.unit)}
          </p>
          <Evidence ids={active.sourceIds} onEvidence={onEvidence} />
        </div>
      ) : (
        <p className="artifact-note">Select a comparison to inspect its supporting records.</p>
      )}
    </>
  );
}
function Matrix({
  artifact,
  onEvidence,
  onSelect,
}: Omit<OperationalArtifactProps, 'artifact'> & { artifact: OfKind<'matrix'> }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const keyOf = (row: string, column: string) => JSON.stringify([row, column]);
  const active = artifact.cells.find((cell) => keyOf(cell.rowId, cell.columnId) === activeKey);
  const max = Math.max(1, ...artifact.cells.map((cell) => Math.abs(cell.value ?? 0)));
  if (!artifact.rows.length || !artifact.columns.length)
    return <Empty>No matrix axes were returned for this scope.</Empty>;
  return (
    <>
      <p className="artifact-note">
        {artifact.unit} · Select a cell to inspect that row and period. An em dash means not
        observed.
      </p>
      <div className="artifact-table-scroll">
        <table className="artifact-matrix">
          <caption className="artifact-sr">
            {artifact.title}, in {artifact.unit}
          </caption>
          <thead>
            <tr>
              <th scope="col">Scope</th>
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
                <th scope="row">{row.label}</th>
                {artifact.columns.map((column) => {
                  const cell = artifact.cells.find(
                    (candidate) => candidate.rowId === row.id && candidate.columnId === column.id,
                  );
                  const value = cell?.value ?? null;
                  return (
                    <td key={column.id}>
                      <button
                        type="button"
                        disabled={!cell}
                        aria-pressed={keyOf(row.id, column.id) === activeKey}
                        aria-label={`${row.label}, ${column.label}: ${valueLabel(value, artifact.unit)}`}
                        style={{
                          backgroundColor:
                            value === null
                              ? '#f3f6f6'
                              : `rgba(20, 125, 120, ${0.06 + (Math.abs(value) / max) * 0.24})`,
                        }}
                        onClick={() => {
                          setActiveKey(cell ? keyOf(row.id, column.id) : null);
                          if (artifact.scope.wellIds.includes(row.id)) onSelect(row.id);
                        }}
                      >
                        {value === null ? '—' : number.format(value)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {active ? (
        <div className="artifact-detail" aria-live="polite">
          <strong>
            {artifact.rows.find((row) => row.id === active.rowId)?.label} /{' '}
            {artifact.columns.find((column) => column.id === active.columnId)?.label}
          </strong>
          <p>{valueLabel(active.value, artifact.unit)} in this cell.</p>
          <Evidence ids={active.sourceIds} onEvidence={onEvidence} />
        </div>
      ) : (
        <p className="artifact-note" aria-live="polite">
          Select a returned cell to see its scoped evidence.
        </p>
      )}
    </>
  );
}
const statusLabels = {
  breach: 'Breach',
  pending: 'Pending',
  compliant: 'Compliant',
  unknown: 'Unknown',
  observed: 'Observed',
  reported: 'Reported',
  disputed: 'Disputed',
  corrected: 'Corrected',
};
function Obligations({
  artifact,
  onEvidence,
  onSelect,
  selected,
}: Omit<OperationalArtifactProps, 'artifact'> & { artifact: OfKind<'obligations'> }) {
  const [filter, setFilter] = useState('all');
  const statuses = ['breach', 'pending', 'unknown', 'compliant'] as const;
  if (!artifact.items.length) return <Empty>No obligations were returned for this scope.</Empty>;
  return (
    <>
      <fieldset className="artifact-filter" aria-label="Filter obligation status">
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          All {artifact.items.length}
        </button>
        {statuses.map((status) => (
          <button
            type="button"
            key={status}
            aria-pressed={filter === status}
            onClick={() => setFilter(status)}
          >
            {statusLabels[status]} {artifact.items.filter((item) => item.status === status).length}
          </button>
        ))}
      </fieldset>
      {statuses
        .filter((status) => filter === 'all' || filter === status)
        .map((status) => {
          const items = artifact.items.filter((item) => item.status === status);
          return items.length ? (
            <section className="artifact-obligation-group" key={status}>
              <h4>
                <span className={`artifact-status artifact-status-${status}`}>
                  {statusLabels[status]}
                </span>
                <span>
                  {items.length} {items.length === 1 ? 'obligation' : 'obligations'}
                </span>
              </h4>
              <div className="artifact-record-list">
                {items.map((item) => (
                  <article key={item.id} className="artifact-obligation">
                    <div className="artifact-record-heading">
                      <strong>{item.title}</strong>
                      <span className="artifact-due">
                        {item.dueAt ? (
                          <>
                            Due <time dateTime={item.dueAt}>{fullDate(item.dueAt)}</time>
                          </>
                        ) : (
                          'Deadline unavailable'
                        )}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="artifact-well"
                      aria-pressed={selected === item.wellId}
                      onClick={() => onSelect(item.wellId)}
                    >
                      {item.wellId}
                    </button>
                    <dl className="artifact-rule">
                      <div>
                        <dt>Rule</dt>
                        <dd>{item.rule}</dd>
                      </div>
                      <div>
                        <dt>Observed</dt>
                        <dd>{item.observed}</dd>
                      </div>
                    </dl>
                    <Evidence ids={item.sourceIds} onEvidence={onEvidence} />
                  </article>
                ))}
              </div>
            </section>
          ) : null;
        })}
      {filter !== 'all' && !artifact.items.some((item) => item.status === filter) && (
        <Empty>No obligations have this status in the returned scope.</Empty>
      )}
    </>
  );
}
const categories = ['inspection', 'repair', 'spill', 'note', 'correction'] as const;
function Timeline({
  artifact,
  onEvidence,
}: Omit<OperationalArtifactProps, 'artifact'> & { artifact: OfKind<'timeline'> }) {
  const [category, setCategory] = useState('all');
  const items = [...artifact.items]
    .filter((item) => category === 'all' || item.category === category)
    .sort((a, b) => a.at.localeCompare(b.at));
  if (!artifact.items.length) return <Empty>No events were returned for this scope.</Empty>;
  return (
    <>
      <div className="artifact-toolbar">
        <span>Earliest to latest · {items.length} records</span>
        <label>
          Show{' '}
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All event types</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {value[0].toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {items.length ? (
        <ol className="artifact-timeline">
          {items.map((item) => (
            <li key={item.id}>
              <div className="artifact-timeline-date">
                <time dateTime={item.at}>{fullDate(item.at)}</time>
                <span className={`artifact-category artifact-category-${item.category}`}>
                  {item.category}
                </span>
              </div>
              <div className="artifact-timeline-body">
                <h4>{item.title}</h4>
                <p>{item.description}</p>
                <Evidence ids={item.sourceIds} onEvidence={onEvidence} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <Empty>No events of this type were returned.</Empty>
      )}
    </>
  );
}
function Claims({
  artifact,
  onEvidence,
  onSelect,
  selected,
}: Omit<OperationalArtifactProps, 'artifact'> & { artifact: OfKind<'claims'> }) {
  const [filter, setFilter] = useState('all');
  const wellIds = [...new Set(artifact.items.map((item) => item.wellId))];
  if (!artifact.items.length) return <Empty>No human claims were returned for this scope.</Empty>;
  return (
    <>
      <p className="artifact-note">
        Statements retain their authors, dates and recorded status. Competing claims are shown
        together.
      </p>
      <fieldset className="artifact-filter" aria-label="Filter claim status">
        {(['all', 'observed', 'reported', 'disputed', 'corrected'] as const).map((status) => (
          <button
            type="button"
            key={status}
            aria-pressed={filter === status}
            onClick={() => setFilter(status)}
          >
            {status === 'all' ? 'All claims' : statusLabels[status]}
          </button>
        ))}
      </fieldset>
      {wellIds.map((wellId) => {
        const items = artifact.items
          .filter((item) => item.wellId === wellId && (filter === 'all' || item.status === filter))
          .sort((a, b) => a.at.localeCompare(b.at));
        if (!items.length) return null;
        return (
          <section key={wellId} className="artifact-claims-group">
            <div className="artifact-record-heading">
              <button
                type="button"
                className="artifact-well"
                aria-pressed={selected === wellId}
                onClick={() => onSelect(wellId)}
              >
                {wellId}
              </button>
              <span className="artifact-note">
                {items.length} {items.length === 1 ? 'statement' : 'statements'}
              </span>
            </div>
            {items.map((item) => (
              <article key={item.id} className="artifact-claim">
                <div className="artifact-claim-meta">
                  <strong>{item.author}</strong>
                  <time dateTime={item.at}>{fullDate(item.at)}</time>
                  <span className={`artifact-status artifact-status-${item.status}`}>
                    {statusLabels[item.status]}
                  </span>
                </div>
                <blockquote>{item.text}</blockquote>
                <Evidence ids={item.sourceIds} onEvidence={onEvidence} />
              </article>
            ))}
          </section>
        );
      })}
      {!artifact.items.some((item) => filter === 'all' || item.status === filter) && (
        <Empty>No claims have this recorded status.</Empty>
      )}
    </>
  );
}
function Correction({
  artifact,
  onEvidence,
}: Omit<OperationalArtifactProps, 'artifact'> & { artifact: OfKind<'correction'> }) {
  return (
    <>
      <div className="artifact-toolbar">
        <span>Record {artifact.recordId}</span>
        <span
          className={`artifact-status artifact-status-${artifact.state === 'proposed' ? 'pending' : 'corrected'}`}
        >
          {artifact.state === 'proposed' ? 'Proposed · read only' : 'Accepted in source record'}
        </span>
      </div>
      <p className="artifact-correction-field">
        {artifact.field}
        {artifact.unit && <span> · {artifact.unit}</span>}
      </p>
      <div className="artifact-correction-values">
        <div>
          <span>Original record</span>
          <strong>{artifact.original}</strong>
        </div>
        <div>
          <span>{artifact.state === 'proposed' ? 'Proposed value' : 'Recorded correction'}</span>
          <strong>{artifact.proposed}</strong>
        </div>
      </div>
      <div className="artifact-correction-reason">
        <h4>Reason for review</h4>
        <p>{artifact.reason}</p>
      </div>
      <div className="artifact-correction-impact">
        <h4>Potential downstream impact</h4>
        {artifact.impacts.length ? (
          <ul>
            {artifact.impacts.map((impact) => (
              <li key={impact}>{impact}</li>
            ))}
          </ul>
        ) : (
          <p>No downstream impacts were supplied.</p>
        )}
      </div>
      <p className="artifact-note">
        {artifact.state === 'proposed'
          ? 'This proposal has not changed the original record. Review and approval happen in the source workflow.'
          : 'Status is supplied by the source snapshot. This panel does not modify records.'}
      </p>
      <Evidence ids={artifact.sourceIds} onEvidence={onEvidence} />
    </>
  );
}
export function OperationalArtifact(props: OperationalArtifactProps) {
  const { artifact } = props;
  let content: ReactNode;
  switch (artifact.kind) {
    case 'series':
      content = <Series {...props} artifact={artifact} />;
      break;
    case 'ranking':
      content = <Ranking {...props} artifact={artifact} />;
      break;
    case 'matrix':
      content = <Matrix {...props} artifact={artifact} />;
      break;
    case 'obligations':
      content = <Obligations {...props} artifact={artifact} />;
      break;
    case 'timeline':
      content = <Timeline {...props} artifact={artifact} />;
      break;
    case 'claims':
      content = <Claims {...props} artifact={artifact} />;
      break;
    case 'correction':
      content = <Correction {...props} artifact={artifact} />;
      break;
    case 'geo':
      return null;
  }
  return (
    <div className={`artifact-content artifact-${artifact.kind}`}>
      <Scope artifact={artifact} />
      {content}
    </div>
  );
}
