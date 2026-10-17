import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import {
  buildWire,
  DEFAULT_OPERATOR_PARAMETERS,
  type OperatorParameters,
  type Snapshot,
  type ViewKind,
} from './protocol';
import { A2UIRenderer, DirectRenderer, RendererBoundary } from './renderers';
import type { SavedView } from './view-contract';
import { Investigation, viewTitles } from './widgets';
import './SavedViewUI.css';

const panelDescriptions: Record<ViewKind, string> = {
  status: 'Production status and records that need attention.',
  table: 'Well production status, downtime and source links.',
  inspections: 'Recent weekly inspection readings, rules and source links.',
  line: 'Temperature readings for a selected well and date range.',
  bar: 'Downtime calculated from weekly inspections.',
  map: 'Well locations with selectable evidence.',
  heatmap: 'Recorded spill events by area and month.',
  conflicts: 'Conflicting observations with their sources.',
  costs: 'Recorded repair costs with currency, period and evidence.',
  obligations: 'Compliance states, applicable rules and deadlines.',
  timeline: 'Dated observations, events and source records.',
  claims: 'Competing observations and attributed human reports.',
  correction: 'Original and proposed values with consequences; read-only review.',
};
const suggestedNames = {
  attention: 'Well inspection overview',
  downtime: 'Production downtime overview',
  spills: 'Spill and conflict overview',
};

export function SaveViewDialog({
  snapshot,
  error,
  onSave,
  onClose,
}: {
  snapshot: Snapshot;
  error?: string;
  onSave: (name: string, views: ViewKind[]) => void;
  onClose: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(
    snapshot.result.artifacts?.length
      ? snapshot.result.title.slice(0, 80)
      : suggestedNames[snapshot.plan.query],
  );
  const [panels, setPanels] = useState<ViewKind[]>([...snapshot.plan.views]);
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    nameInput.current?.focus();
    nameInput.current?.select();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  function save(event: FormEvent) {
    event.preventDefault();
    if (name.trim() && panels.length)
      onSave(
        name.trim(),
        snapshot.plan.views.filter((view) => panels.includes(view)),
      );
  }
  return (
    <dialog
      ref={dialog}
      className="save-view-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form onSubmit={save}>
        <header className="save-view-heading">
          <div>
            <h2 id={`${id}-title`}>Save a reusable view</h2>
            <p id={`${id}-description`}>
              Keep the panels you need and run them again with fresh synthetic records.
            </p>
          </div>
          <button
            type="button"
            className="saved-icon-button"
            aria-label="Close save view"
            onClick={onClose}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        </header>
        <div className="save-view-body">
          <label className="saved-field" htmlFor={`${id}-name`}>
            View name
            <input
              ref={nameInput}
              id={`${id}-name`}
              value={name}
              maxLength={80}
              required
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <fieldset className="save-view-panels">
            <legend>Panels to keep</legend>
            {snapshot.plan.views.map((kind) => (
              <label className="save-view-panel" key={kind}>
                <input
                  type="checkbox"
                  checked={panels.includes(kind)}
                  onChange={(event) =>
                    setPanels((current) =>
                      event.target.checked
                        ? [...current, kind]
                        : current.filter((view) => view !== kind),
                    )
                  }
                />
                <span>
                  <strong>{viewTitles[kind]}</strong>
                  <small>{panelDescriptions[kind]}</small>
                </span>
              </label>
            ))}
            {!panels.length && <p className="saved-field-error">Choose at least one panel.</p>}
          </fieldset>
          <p className="save-view-note">
            Saves the layout, read recipe and default inputs on this device. The AI answer and its
            current results are not saved as part of the view.
          </p>
        </div>
        {error && (
          <p className="save-view-save-error" role="alert">
            {error}
          </p>
        )}
        <footer className="save-view-footer">
          <span>On this device</span>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={!name.trim() || !panels.length}
          >
            Save view
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function sameParameters(a: OperatorParameters, b: OperatorParameters) {
  return (
    a.wellId === b.wellId &&
    a.inspectionCount === b.inspectionCount &&
    a.trendStart === b.trendStart &&
    a.trendEnd === b.trendEnd
  );
}
function wellLabel(id: OperatorParameters['wellId']) {
  return id === 'all' ? 'All six wells' : id;
}
function evaluatedLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
}

export function SavedViewWorkspace({
  definition,
  lastResult,
  busy,
  error,
  onRun,
  onAsk,
  onClose,
  onEvidence,
  renderer,
}: {
  definition: SavedView;
  lastResult: Snapshot | null;
  busy: boolean;
  error: string;
  onRun: (parameters: OperatorParameters) => Promise<void>;
  onAsk: (wellId: string) => void;
  onClose: () => void;
  onEvidence: (snapshot: Snapshot, id: string) => void;
  renderer: 'a2ui' | 'direct';
}) {
  const id = useId();
  const [draft, setDraft] = useState<OperatorParameters>(() => ({
    ...DEFAULT_OPERATOR_PARAMETERS,
    ...definition.defaults,
  }));
  const [selected, setSelected] = useState('');
  const [runError, setRunError] = useState('');
  const [renderError, setRenderError] = useState('');
  const [submitting, setSubmitting] = useState<OperatorParameters | null>(null);
  const definitionId = useRef(definition.id);
  useEffect(() => {
    if (definitionId.current === definition.id) return;
    definitionId.current = definition.id;
    setDraft({ ...DEFAULT_OPERATOR_PARAMETERS, ...definition.defaults });
    setSelected('');
    setRunError('');
    setRenderError('');
    setSubmitting(null);
  }, [definition]);
  const hasInspections = definition.plan.views.includes('inspections');
  const hasTrend = definition.plan.views.includes('line');
  function parametersForPanels(parameters: OperatorParameters): OperatorParameters {
    return {
      ...parameters,
      inspectionCount: hasInspections
        ? parameters.inspectionCount
        : definition.defaults.inspectionCount,
      trendStart: hasTrend ? parameters.trendStart : definition.defaults.trendStart,
      trendEnd: hasTrend ? parameters.trendEnd : definition.defaults.trendEnd,
    };
  }
  const running = busy || submitting !== null;
  const runningParameters = submitting || definition.defaults;
  const completedParameters = lastResult?.execution?.parameters;
  const changed = !sameParameters(
    parametersForPanels(draft),
    parametersForPanels(completedParameters || definition.defaults),
  );
  const invalidDates = hasTrend && draft.trendStart > draft.trendEnd;
  const missingDates = hasTrend && (!draft.trendStart || !draft.trendEnd);
  const rows = lastResult?.result.rows || [];
  const validSelected = rows.some((row) => row.id === selected) ? selected : rows[0]?.id || '';
  const visibleError = error || runError;
  // Preserve the approved composition even when the last result came from a chat answer.
  const surface = lastResult
    ? {
        ...lastResult,
        plan: definition.plan,
        wire: buildWire(lastResult.runId, definition.plan, lastResult.result.id, lastResult.phase),
      }
    : null;
  function selectWell(wellId: string) {
    if (rows.some((row) => row.id === wellId)) setSelected(wellId);
  }
  function evidence(sourceId: string) {
    if (lastResult?.result.sources.some((source) => source.id === sourceId))
      onEvidence(lastResult, sourceId);
  }
  function action(name: string, context: Record<string, unknown>) {
    if (name === 'selectWell' && typeof context.wellId === 'string') selectWell(context.wellId);
    if (name === 'openEvidence' && typeof context.sourceId === 'string') evidence(context.sourceId);
  }
  async function run(parameters: OperatorParameters, event?: FormEvent) {
    event?.preventDefault();
    const submitted = parametersForPanels(parameters);
    if (
      running ||
      (hasTrend &&
        (submitted.trendStart > submitted.trendEnd || !submitted.trendStart || !submitted.trendEnd))
    )
      return;
    setSubmitting(submitted);
    setRunError('');
    setRenderError('');
    try {
      await onRun(submitted);
    } catch (failure) {
      setRunError(
        failure instanceof Error ? failure.message : 'The view could not update. Try again.',
      );
    } finally {
      setSubmitting(null);
    }
  }
  return (
    <main className="saved-view-workspace" aria-label={`Saved view: ${definition.name}`}>
      <header className="saved-workspace-heading">
        <button type="button" className="saved-back-button" onClick={onClose}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m11 4-6 6 6 6M5 10h11" />
          </svg>
          Back to conversation
        </button>
        <div className="saved-workspace-title">
          <div>
            <h1>{definition.name}</h1>
            <p>Saved view · On this device · Synthetic records</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            disabled={running || !lastResult}
            onClick={() => onAsk(validSelected)}
          >
            Explain results
          </button>
        </div>
      </header>
      <div className="saved-workspace-scroll">
        <div className="saved-workspace-content">
          <form className="saved-parameters" onSubmit={(event) => void run(draft, event)}>
            <div className="saved-parameters-heading">
              <h2>Run this view</h2>
              <span>{definition.plan.views.length} saved panels</span>
            </div>
            <div
              className="saved-parameter-fields"
              data-field-count={1 + (hasInspections ? 1 : 0) + (hasTrend ? 2 : 0)}
            >
              <label className="saved-field" htmlFor={`${id}-well`}>
                Well
                <select
                  id={`${id}-well`}
                  aria-label="Well"
                  disabled={running}
                  value={draft.wellId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      wellId: event.target.value as OperatorParameters['wellId'],
                    }))
                  }
                >
                  <option value="all">All six wells</option>
                  {['LAB-W01', 'LAB-W02', 'LAB-W03', 'LAB-W04', 'LAB-W05', 'LAB-W06'].map(
                    (well) => (
                      <option key={well}>{well}</option>
                    ),
                  )}
                </select>
              </label>
              {hasInspections && (
                <label className="saved-field" htmlFor={`${id}-count`}>
                  Recent inspections
                  <select
                    id={`${id}-count`}
                    aria-label="Recent inspections"
                    disabled={running}
                    value={draft.inspectionCount}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        inspectionCount: Number(
                          event.target.value,
                        ) as OperatorParameters['inspectionCount'],
                      }))
                    }
                  >
                    {[1, 2, 3, 4].map((count) => (
                      <option key={count} value={count}>
                        {count} {count === 1 ? 'inspection' : 'inspections'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {hasTrend && (
                <>
                  <label className="saved-field" htmlFor={`${id}-start`}>
                    Trend from
                    <input
                      id={`${id}-start`}
                      disabled={running}
                      type="date"
                      required
                      value={draft.trendStart}
                      aria-invalid={invalidDates || undefined}
                      aria-describedby={invalidDates ? `${id}-dates-error` : undefined}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, trendStart: event.target.value }))
                      }
                    />
                  </label>
                  <label className="saved-field" htmlFor={`${id}-end`}>
                    Trend to
                    <input
                      id={`${id}-end`}
                      disabled={running}
                      type="date"
                      required
                      value={draft.trendEnd}
                      aria-invalid={invalidDates || undefined}
                      aria-describedby={invalidDates ? `${id}-dates-error` : undefined}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, trendEnd: event.target.value }))
                      }
                    />
                  </label>
                </>
              )}
            </div>
            {invalidDates && (
              <p id={`${id}-dates-error`} className="saved-field-error">
                Choose an end date on or after the start date.
              </p>
            )}
            <div className="saved-parameter-footer">
              <p>
                {hasInspections && 'Inspection count changes recent inspection rows. '}
                {hasTrend && 'Dates change the temperature trend only. '}
                {!hasInspections && !hasTrend && 'Well selection applies to all saved panels. '}
                Apply uses these inputs. Refresh reruns the last completed inputs.
              </p>
              <div className="saved-run-buttons">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={running}
                  onClick={() => void run(completedParameters || definition.defaults)}
                >
                  Refresh
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={running || invalidDates || missingDates}
                >
                  {running ? 'Running…' : 'Apply'}
                </button>
              </div>
            </div>
          </form>
          <div
            className={`saved-run-status${visibleError ? ' has-error' : ''}`}
            role={visibleError ? 'alert' : 'status'}
            aria-live="polite"
          >
            {visibleError ? (
              <>
                <strong>View could not update</strong>
                <p>
                  {visibleError}{' '}
                  {lastResult
                    ? 'The last completed result remains below with its original inputs.'
                    : 'Use Apply to try again.'}
                </p>
              </>
            ) : running ? (
              <>
                <strong>
                  Reading synthetic records for {wellLabel(runningParameters.wellId)}…
                </strong>
                <p>
                  {lastResult
                    ? 'The last completed result stays visible until this run finishes.'
                    : 'Preparing your saved panels with fresh fixture reads.'}
                </p>
              </>
            ) : changed ? (
              <>
                <strong>Inputs changed</strong>
                <p>Apply to update the results. Your saved defaults stay the same.</p>
              </>
            ) : (
              <p>Each run reads the synthetic dataset again using this saved view’s read recipe.</p>
            )}
          </div>
          {lastResult && surface ? (
            <section
              className="saved-completed-result"
              aria-labelledby={`${id}-result-title`}
              aria-busy={running}
              data-run-id={lastResult.runId}
            >
              <header className="saved-result-heading">
                <div>
                  <h2 id={`${id}-result-title`}>Last completed result</h2>
                  <p>
                    {completedParameters
                      ? wellLabel(completedParameters.wellId)
                      : rows.length === 1
                        ? rows[0].id
                        : `${rows.length} wells`}{' '}
                    · {lastResult.result.period}
                  </p>
                </div>
                <span className="saved-result-state">
                  {running || changed || visibleError ? 'Previous result' : 'Ready'}
                </span>
              </header>
              <dl className="saved-result-metadata">
                <div>
                  <dt>Evaluated</dt>
                  <dd>
                    {lastResult.execution
                      ? evaluatedLabel(lastResult.execution.evaluatedAt)
                      : lastResult.result.asOf}
                  </dd>
                </div>
                {completedParameters && (
                  <>
                    {hasInspections && (
                      <div>
                        <dt>Inspection rows</dt>
                        <dd>Latest {completedParameters.inspectionCount} per well</dd>
                      </div>
                    )}
                    {hasTrend && (
                      <div>
                        <dt>Trend dates</dt>
                        <dd>
                          {completedParameters.trendStart} to {completedParameters.trendEnd}
                        </dd>
                      </div>
                    )}
                  </>
                )}
              </dl>
              {renderError && (
                <p className="saved-render-error" role="alert">
                  {renderError}
                </p>
              )}
              <Investigation.Provider
                value={{
                  result: lastResult.result,
                  area: 'All areas',
                  selected: validSelected,
                  onSelect: selectWell,
                  onEvidence: evidence,
                  onAction: action,
                }}
              >
                <RendererBoundary
                  key={`${definition.id}-${lastResult.runId}-${renderer}`}
                  onError={() =>
                    setRenderError(
                      'These panels could not render. Refresh the view or switch renderer in Lab settings.',
                    )
                  }
                >
                  {renderer === 'a2ui' ? (
                    <A2UIRenderer snapshot={surface} onAction={action} onError={setRenderError} />
                  ) : (
                    <DirectRenderer snapshot={surface} />
                  )}
                </RendererBoundary>
              </Investigation.Provider>
              <details className="saved-result-sources">
                <summary>Sources for this result ({lastResult.result.sources.length})</summary>
                <ul>
                  {lastResult.result.sources.map((source) => (
                    <li key={source.id}>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => evidence(source.id)}
                      >
                        {source.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          ) : (
            !running && (
              <div className="saved-no-result">
                <h2>Your panels are ready to run</h2>
                <p>
                  Choose a well and inspection window, then Apply to read the synthetic records.
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </main>
  );
}
