import { useState } from 'react';
import {
  Empty,
  Evidence,
  number,
  type OfKind,
  type OperationalArtifactProps,
  valueLabel,
} from './shared';

export function Matrix({
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
