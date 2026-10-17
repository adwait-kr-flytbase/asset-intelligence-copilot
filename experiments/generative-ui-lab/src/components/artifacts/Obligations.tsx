import { useState } from 'react';
import {
  Empty,
  Evidence,
  fullDate,
  type OfKind,
  type OperationalArtifactProps,
  statusLabels,
} from './shared';

export function Obligations({
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
