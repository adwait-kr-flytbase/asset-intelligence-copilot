import { useState } from 'react';
import {
  Empty,
  Evidence,
  fullDate,
  type OfKind,
  type OperationalArtifactProps,
  statusLabels,
} from './shared';

export function Claims({
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
