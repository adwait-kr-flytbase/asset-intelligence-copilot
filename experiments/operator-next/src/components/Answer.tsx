import { useState } from 'react';
export function Answer({ text, failed = false }: { text: string; failed?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 1400;
  return (
    <div>
      <p className={`answer ${failed ? 'error' : ''}`}>
        {long && !expanded ? `${text.slice(0, 1300).trimEnd()}…` : text}
      </p>
      {long && (
        <button
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
