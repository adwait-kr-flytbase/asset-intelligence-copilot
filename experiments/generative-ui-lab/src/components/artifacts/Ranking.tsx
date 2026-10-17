import { useState } from 'react';
import { Empty, Evidence, type OfKind, type OperationalArtifactProps, valueLabel } from './shared';

export function Ranking({
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
