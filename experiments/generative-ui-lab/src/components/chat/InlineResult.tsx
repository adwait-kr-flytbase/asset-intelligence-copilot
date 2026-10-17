import { useState } from 'react';
import type { Snapshot } from '../../protocol';
import { A2UIRenderer, DirectRenderer, RendererBoundary } from '../../renderers';
import { Investigation } from '../../widgets';
import { Icon } from '../ui/Icon';
import type { ChatProps as Props } from './types';

export function InlineResult({
  snapshot,
  active,
  initialArea,
  initialSelected,
  busy,
  renderer,
  onContext,
  onEvidence,
  onError,
  operator = false,
  onSaveView,
}: {
  operator?: boolean;
  onSaveView?: (snapshot: Snapshot) => void;
  snapshot: Snapshot;
  active: boolean;
  initialArea: string;
  initialSelected: string;
  busy: boolean;
  renderer: Props['renderer'];
  onContext: Props['onContext'];
  onEvidence: Props['onEvidence'];
  onError: Props['onError'];
}) {
  const [area, setArea] = useState(initialArea);
  const [selected, setSelected] = useState(initialSelected);
  const ready = snapshot.phase === 'ready';
  function focus(nextArea = area, nextSelected = selected) {
    if (busy || !ready) return;
    onContext(snapshot.runId, nextArea, nextSelected);
  }
  function selectWell(id: string) {
    if (busy || !snapshot.result.rows.some((w) => w.id === id)) return;
    setSelected(id);
    focus(area, id);
  }
  function selectArea(value: string) {
    const rows = snapshot.result.rows.filter((w) => value === 'All areas' || w.area === value);
    const next = rows.some((w) => w.id === selected) ? selected : rows[0]?.id || selected;
    setArea(value);
    setSelected(next);
    focus(value, next);
  }
  function action(name: string, data: Record<string, unknown>) {
    if (name === 'selectWell' && typeof data.wellId === 'string') selectWell(data.wellId);
    if (
      name === 'openEvidence' &&
      typeof data.sourceId === 'string' &&
      snapshot.result.sources.some((s) => s.id === data.sourceId)
    )
      onEvidence(snapshot.runId, data.sourceId);
  }
  return (
    <section
      className="inline-result"
      aria-label={`${snapshot.result.title} interactive result`}
      data-run-id={snapshot.runId}
    >
      <header className="inline-result-heading">
        <div>
          <h3>{snapshot.result.title}</h3>
          <p>Synthetic records · {snapshot.result.period}</p>
        </div>
        <span className="result-completion">
          {ready && <Icon name="check" width="14" height="14" />}
          {ready ? 'Complete' : 'Building views…'}
        </span>
      </header>
      <div className="inline-result-controls">
        {!operator && (
          <label>
            Area{' '}
            <select
              aria-label={`Area for ${snapshot.result.title}`}
              value={area}
              disabled={busy}
              onChange={(e) => selectArea(e.target.value)}
            >
              <option>All areas</option>
              <option>North ridge</option>
              <option>South basin</option>
            </select>
          </label>
        )}
        <span>Selected: {selected}</span>
        <button
          type="button"
          className="quiet-button"
          disabled={busy || !ready}
          onClick={() => focus()}
        >
          {active ? 'Using this result' : 'Ask about this result'}
        </button>
      </div>
      <p className="inline-scope">
        {operator
          ? [
              `Showing ${snapshot.execution?.parameters.wellId === 'all' ? `all ${snapshot.result.rows.length} wells` : snapshot.execution?.parameters.wellId || 'these records'}.`,
              snapshot.plan.views.includes('inspections')
                ? 'Inspection count applies to the inspection table.'
                : '',
              snapshot.plan.views.includes('line')
                ? 'Trend dates apply to the chart only.'
                : 'Each panel shows its source period.',
            ]
              .filter(Boolean)
              .join(' ')
          : 'Area filters these views; the answer covers all six wells. Select a well for its trend and follow-up questions.'}
      </p>
      <Investigation.Provider
        value={{
          result: snapshot.result,
          area,
          selected,
          onSelect: selectWell,
          onEvidence: (id) => onEvidence(snapshot.runId, id),
          onAction: action,
        }}
      >
        <RendererBoundary
          key={`${snapshot.runId}-${renderer}`}
          onError={() =>
            onError(
              'This inline view could not render. Its validated result remains saved; switch renderer in Lab settings.',
            )
          }
        >
          {renderer === 'a2ui' ? (
            <A2UIRenderer snapshot={snapshot} onAction={action} onError={onError} />
          ) : (
            <DirectRenderer snapshot={snapshot} />
          )}
        </RendererBoundary>
      </Investigation.Provider>
      {operator && ready && (
        <div className="answer-actions">
          {operator && snapshot.execution && (
            <span className="run-label">
              {snapshot.execution.kind === 'saved-view'
                ? `Saved view · ${snapshot.execution.savedView?.name}`
                : 'New investigation · not saved'}
            </span>
          )}
          <button type="button" className="secondary-button" onClick={() => onSaveView?.(snapshot)}>
            <Icon name="bookmark" width="15" height="15" />
            Save view
          </button>
        </div>
      )}
      {operator && snapshot.execution && (
        <details className="run-provenance">
          <summary>
            Reads, rules and sources · checked{' '}
            {new Date(snapshot.execution.evaluatedAt).toLocaleTimeString()}
          </summary>
          <ul>
            {snapshot.execution.activity.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
