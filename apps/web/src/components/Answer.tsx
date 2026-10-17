import { lazy, Suspense, useState } from 'react';

const Markdown = lazy(() => import('./Markdown'));
export function Answer({ text, failed = false }: { text: string; failed?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 1400;
  return (
    <div>
      <div className={`answer ${failed ? 'error' : ''}`}>
        <Suspense
          fallback={<p>{long && !expanded ? `${text.slice(0, 1300).trimEnd()}…` : text}</p>}
        >
          <Markdown text={long && !expanded ? `${text.slice(0, 1300).trimEnd()}…` : text} />
        </Suspense>
      </div>
      {long && (
        <button
          type="button"
          className="quiet answer-expand"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Read full response'}
        </button>
      )}
    </div>
  );
}
