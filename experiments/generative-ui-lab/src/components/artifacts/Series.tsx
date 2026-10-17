import { useId, useState } from 'react';
import {
  Empty,
  Evidence,
  fullDate,
  number,
  type OfKind,
  type OperationalArtifactProps,
  palette,
  shortDate,
  valueLabel,
} from './shared';

export function Series({
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
