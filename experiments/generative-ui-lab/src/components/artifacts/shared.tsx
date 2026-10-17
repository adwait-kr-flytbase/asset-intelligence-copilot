import type { Artifact } from '../../artifact-contract';

export interface OperationalArtifactProps {
  artifact: Artifact;
  onEvidence: (id: string) => void;
  onSelect: (id: string) => void;
  selected: string;
}
export type OfKind<K extends Artifact['kind']> = Extract<Artifact, { kind: K }>;
export const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export const shortDate = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
export const fullDate = (date: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
export function valueLabel(value: number | null, unit: string) {
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
export function Evidence({ ids, onEvidence }: { ids: string[]; onEvidence: (id: string) => void }) {
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
export function Empty({ children }: { children: string }) {
  return <p className="artifact-empty">{children}</p>;
}
export function Scope({ artifact }: { artifact: Artifact }) {
  return (
    <p className="artifact-scope">
      <span>{artifact.scope.label}</span>
      <span>
        {fullDate(artifact.scope.from)} – {fullDate(artifact.scope.to)}
      </span>
    </p>
  );
}
export const palette = ['#147d78', '#b36b22', '#526bb1', '#8d557a', '#43748b', '#738433'];
export const statusLabels = {
  breach: 'Breach',
  pending: 'Pending',
  compliant: 'Compliant',
  unknown: 'Unknown',
  observed: 'Observed',
  reported: 'Reported',
  disputed: 'Disputed',
  corrected: 'Corrected',
};
export const categories = ['inspection', 'repair', 'spill', 'note', 'correction'] as const;
