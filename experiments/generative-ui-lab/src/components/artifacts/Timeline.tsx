import { useState } from 'react';
import {
  categories,
  Empty,
  Evidence,
  fullDate,
  type OfKind,
  type OperationalArtifactProps,
} from './shared';

export function Timeline({
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
