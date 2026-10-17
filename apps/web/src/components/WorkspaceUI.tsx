import type { ApplicationPanel, ApplicationResult, ReadParameters } from '@repo/contracts';
import {
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useWorkspace } from '../workspace';
import { Icon } from './Icon';
import { ViewBoundary } from './ViewBoundary';
import './evidence-reader.css';
import './composed-view.css';

const ApplicationPanelView = lazy(() =>
  import('./ApplicationPanelView').then((m) => ({ default: m.ApplicationPanelView })),
);

export function Dialog({
  children,
  className = '',
  label,
  onClose,
}: {
  children: ReactNode;
  className?: string;
  label: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Native dialog supports Escape via onCancel.
    <dialog
      ref={ref}
      className={className}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-content">{children}</div>
    </dialog>
  );
}
const EvidenceReader = lazy(() =>
  import('./EvidenceReader').then((module) => ({ default: module.EvidenceReader })),
);

function Scope({ parameters }: { parameters: ReadParameters }) {
  const scope = parameters.scope;
  return (
    <span>
      {parameters.assetIds?.length
        ? parameters.assetIds.join(', ')
        : scope.kind === 'asset'
          ? scope.assetId
          : scope.kind === 'area'
            ? scope.area
            : 'All assets'}
      {parameters.window && (
        <>
          {' '}
          · {parameters.window.from} – {parameters.window.through}
        </>
      )}
    </span>
  );
}
function Panel({
  panel,
  result,
  mode,
}: {
  panel: ApplicationPanel;
  result: ApplicationResult;
  mode: 'inline' | 'focus';
}) {
  const w = useWorkspace();
  return (
    <ViewBoundary key={`${result.id}:${panel.id}`}>
      <Suspense fallback={<p className="visual-loading">Loading this view…</p>}>
        <ApplicationPanelView
          panel={panel}
          result={result}
          mode={mode}
          selected={w.selected[`${result.id}:${panel.id}`] || null}
          onSelect={(id) => w.choose(result, panel, id)}
          onEvidence={(id) => w.setSources({ result, selected: id })}
        />
      </Suspense>
    </ViewBoundary>
  );
}
export function ResultView({ result }: { result: ApplicationResult }) {
  const w = useWorkspace();
  const first = result.panels[0];
  if (!first) return null;
  const savable = result.panels.every((panel) => !!panel.recipe);
  return (
    <section className="composed-view" aria-label="Answer view">
      <header className="composed-view-head">
        <span className="eyebrow">
          View · {result.panels.length} {result.panels.length === 1 ? 'component' : 'components'}
        </span>
        <div className="result-actions">
          <button
            type="button"
            className="quiet small"
            onClick={() => w.setFocus({ result, panel: first, wholeView: true })}
          >
            <Icon name="expand" /> Expand view
          </button>
          {savable && (
            <button
              type="button"
              className="quiet small"
              onClick={() => w.setSave({ result, panel: first, wholeView: true })}
            >
              <Icon name="bookmark" /> Save {result.panels.length > 1 ? 'entire view' : 'view'}
            </button>
          )}
        </div>
      </header>
      {!savable && (
        <p className="subtle small">
          Save individual supported components below. The entire view can be saved when every
          component has a replayable recipe.
        </p>
      )}
      <div className="composed-view-components">
        {result.panels.map((panel) => (
          <ResultCard key={`${result.id}:${panel.id}`} panel={panel} result={result} />
        ))}
      </div>
    </section>
  );
}
export function ResultCard({
  panel,
  result,
}: {
  panel: ApplicationPanel;
  result: ApplicationResult;
}) {
  const w = useWorkspace();
  return (
    <section className="art-card" aria-label={panel.title}>
      <header className="art-card-head">
        <div>
          <h3>{panel.title}</h3>
          <div className="subtle small">
            <Scope parameters={panel.parameters} />
          </div>
        </div>
        <div className="result-actions">
          {w.latestViewId &&
            w.latestViewId !== result.id &&
            result.conversationId === w.activeId && (
              <button
                type="button"
                className="quiet small"
                disabled={w.composing || !!w.pending}
                onClick={() => void w.addToLatestView(result, panel)}
              >
                {w.composing ? 'Combining…' : 'Add to latest view'}
              </button>
            )}
          {panel.recipe && (
            <button
              type="button"
              className="icon-button"
              aria-label={`Save ${panel.title}`}
              title="Save view"
              onClick={() => w.setSave({ panel, result })}
            >
              <Icon name="bookmark" />
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            title="Expand result"
            aria-label={`Expand ${panel.title}`}
            onClick={() => {
              w.setFocus({ panel, result });
              w.setFreshReply(false);
            }}
          >
            <Icon name="expand" />
          </button>
        </div>
      </header>
      <Panel panel={panel} result={result} mode="inline" />
      <footer className="art-card-foot">
        <button
          type="button"
          className="quiet small"
          onClick={() => w.setSources({ result, ids: panel.evidenceIds })}
        >
          <Icon name="source" />
          {panel.evidenceIds.length} sources
        </button>
        <span className="subtle small">As of {result.asOf.slice(0, 10)}</span>
      </footer>
    </section>
  );
}
export function Composer({ inFocus = false }: { inFocus?: boolean }) {
  const w = useWorkspace();
  const [text, setText] = useState('');
  const submit = () => {
    if (text.trim() && !w.pending && w.persona) {
      w.send(text, inFocus);
      setText('');
    }
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: Clear unsent text when the private conversation or persona changes.
  useEffect(() => {
    setText('');
  }, [w.persona?.id, w.activeId]);
  return (
    <div className={`composer-wrap ${inFocus ? 'in-focus' : ''}`}>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {(w.context || inFocus) && (
          <div className="composer-context">
            <Icon name="assets" />
            <span>
              Asking about{' '}
              <strong>
                {w.context ||
                  (w.focus ? <Scope parameters={w.focus.panel.parameters} /> : 'this result')}
              </strong>
            </span>
            {w.context && (
              <button
                type="button"
                className="icon-button"
                aria-label="Clear asset context"
                onClick={() => w.setContext(null)}
              >
                <Icon name="close" />
              </button>
            )}
          </div>
        )}
        <div className="composer-input">
          <textarea
            aria-label={inFocus ? 'Ask about this result' : 'Message Fieldwork'}
            placeholder={inFocus ? 'Ask about this result…' : 'Ask about your assets…'}
            rows={1}
            value={text}
            disabled={!w.persona}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
          />
          {w.pending ? (
            <button
              type="button"
              className="send-button stop-button"
              aria-label="Stop investigation"
              onClick={w.stop}
            >
              <Icon name="stop" />
            </button>
          ) : (
            <button
              type="submit"
              className="send-button"
              aria-label="Send message"
              disabled={!text.trim() || !w.persona}
            >
              <Icon name="arrow" />
            </button>
          )}
        </div>
      </form>
      <p className="composer-note">Check the linked records before making operational decisions.</p>
    </div>
  );
}
function SaveDialog() {
  const w = useWorkspace();
  const [name, setName] = useState(
    w.save?.wholeView && w.save.result.panels.length > 1
      ? w.save.result.panels
          .map((panel) => panel.title)
          .join(' · ')
          .slice(0, 256)
      : w.save?.panel.title || '',
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Dialog className="save-dialog" label="Save view" onClose={() => w.setSave(null)}>
      <header className="modal-head">
        <h2>Save this view</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close save dialog"
          onClick={() => w.setSave(null)}
        >
          <Icon name="close" />
        </button>
      </header>
      <p className="subtle">
        Keep{' '}
        {w.save?.wholeView
          ? `all ${w.save.result.panels.length} components and their individual scopes`
          : 'this component’s recipe and data scope'}
        . Opening the saved view reads the records again.
        {w.save?.panel.kind === 'geo' && ' Map search and labels are temporary display settings.'}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError('');
          try {
            setError((await w.saveView(name)) || '');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to save view');
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="field-label" htmlFor="view-name">
          View name
        </label>
        <input
          id="view-name"
          autoFocus
          maxLength={256}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Save view'}
        </button>
      </form>
    </Dialog>
  );
}
function EvidenceDialog() {
  const w = useWorkspace();
  const sources = w.sources!;
  return (
    <Dialog className="evidence-dialog" label="Sources" onClose={() => w.setSources(null)}>
      <Suspense fallback={<p className="empty-state">Opening sources…</p>}>
        <EvidenceReader {...sources} onClose={() => w.setSources(null)} />
      </Suspense>
    </Dialog>
  );
}
function FocusDialog() {
  const w = useWorkspace();
  const f = w.focus!;
  const panels = f.wholeView ? f.result.panels : [f.panel];
  const composed = panels.length > 1;
  const initial = f.panel.parameters;
  const [scopeChanged, setScopeChanged] = useState(false);
  const [scopeKind, setScopeKind] = useState<ReadParameters['scope']['kind'] | 'selection'>(
    initial.scope.kind === 'fleet' && initial.assetIds?.length ? 'selection' : initial.scope.kind,
  );
  const [scopeValue, setScopeValue] = useState(
    initial.scope.kind === 'asset'
      ? initial.scope.assetId
      : initial.scope.kind === 'area'
        ? initial.scope.area
        : '',
  );
  const [from, setFrom] = useState(initial.window?.from || '');
  const [through, setThrough] = useState(initial.window?.through || '');
  const [limit, setLimit] = useState(initial.limit);
  const [equipmentKind, setEquipmentKind] = useState(initial.equipmentKind || '');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const windowed = !!initial.window;
  const refresh = async (parameters?: Partial<ReadParameters>) => {
    if (!f.definition) return;
    setError('');
    setRefreshing(true);
    try {
      await w.runView(f.definition, parameters, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to refresh view');
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <Dialog className="focus-dialog" label={f.panel.title} onClose={w.closeFocus}>
      <header className="focus-head">
        <button type="button" className="quiet" onClick={w.closeFocus}>
          <Icon name="back" />
          <span>Conversation</span>
        </button>
        <span className="tag">{f.definition ? 'Saved view' : 'Result'}</span>
        <div className="focus-actions">
          <button
            type="button"
            className="quiet"
            onClick={() =>
              w.setSources({ result: f.result, ids: panels.flatMap((panel) => panel.evidenceIds) })
            }
          >
            <Icon name="source" />
            Sources
          </button>
          {panels.every((panel) => !!panel.recipe) && (
            <button type="button" className="quiet" onClick={() => w.setSave(f)}>
              <Icon name="bookmark" />
              Save view
            </button>
          )}
        </div>
      </header>
      <div className="focus-scroll">
        <div className="focus-title">
          <p className="eyebrow">{f.definition?.name || 'Asset intelligence'}</p>
          <h1>{composed ? f.definition?.name || 'Combined view' : f.panel.title}</h1>
          <p className="subtle">
            {composed ? (
              `${panels.length} components · Individual scopes below`
            ) : (
              <Scope parameters={f.panel.parameters} />
            )}{' '}
            · As of {f.result.asOf.slice(0, 10)}
          </p>
        </div>
        {f.definition && !composed && (
          <form
            className="view-filters"
            onSubmit={(e) => {
              e.preventDefault();
              if (windowed && from > through) {
                setError('Start date must be before the end date.');
                return;
              }
              const scope: ReadParameters['scope'] =
                scopeKind === 'fleet' || scopeKind === 'selection'
                  ? { kind: 'fleet' }
                  : scopeKind === 'asset'
                    ? { kind: 'asset', assetId: scopeValue.trim() }
                    : { kind: 'area', area: scopeValue.trim() };
              void refresh({
                scope,
                ...(!scopeChanged && initial.assetIds ? { assetIds: initial.assetIds } : {}),
                limit,
                ...(equipmentKind ? { equipmentKind } : {}),
                ...(windowed ? { window: { from, through } } : {}),
              });
            }}
          >
            <label>
              Scope
              <select
                value={scopeKind}
                onChange={(e) => {
                  setScopeChanged(e.target.value !== 'selection');
                  setScopeKind(e.target.value as ReadParameters['scope']['kind'] | 'selection');
                  setScopeValue('');
                }}
              >
                {initial.assetIds?.length && (
                  <option value="selection" disabled={scopeChanged}>
                    Selected wells: {initial.assetIds.join(', ')}
                  </option>
                )}
                <option value="fleet">All assets</option>
                <option value="asset">Asset</option>
                <option value="area">Area</option>
              </select>
            </label>
            {scopeKind !== 'fleet' && scopeKind !== 'selection' && (
              <label>
                {scopeKind === 'asset' ? 'Asset ID' : 'Area name'}
                <input
                  required
                  value={scopeValue}
                  onChange={(e) => {
                    setScopeChanged(true);
                    setScopeValue(e.target.value);
                  }}
                />
              </label>
            )}
            {windowed && (
              <>
                <label>
                  From
                  <input
                    type="date"
                    value={from}
                    required
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label>
                  Through
                  <input
                    type="date"
                    value={through}
                    required
                    onChange={(e) => setThrough(e.target.value)}
                  />
                </label>
              </>
            )}
            <label>
              Row limit
              <input
                type="number"
                min={1}
                max={500}
                required
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            </label>
            {initial.equipmentKind !== undefined && (
              <label>
                Equipment kind
                <input
                  value={equipmentKind}
                  onChange={(e) => setEquipmentKind(e.target.value)}
                  required
                />
              </label>
            )}
            <button type="submit" className="secondary" disabled={refreshing || !!w.pending}>
              Apply & refresh
            </button>
            <button
              type="button"
              className="quiet"
              disabled={refreshing || !!w.pending}
              onClick={() => void refresh()}
            >
              Refresh current
            </button>
          </form>
        )}
        {f.definition && composed && (
          <div className="view-filters">
            <p className="subtle small">
              Each component retains its own wells, filters and date range.
            </p>
            <button
              type="button"
              className="secondary"
              disabled={refreshing || !!w.pending}
              onClick={() => void refresh()}
            >
              Refresh entire view
            </button>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {refreshing && (
          <p className="read-status" role="status">
            Reading fresh records. The result below retains its original scope until complete.
          </p>
        )}
        <div className="focus-artifact">
          {panels.map((panel) => (
            <section
              key={`${f.result.id}:${panel.id}`}
              className={composed ? 'focus-view-component' : undefined}
              aria-label={panel.title}
            >
              {composed && (
                <header>
                  <h2>{panel.title}</h2>
                  <p className="subtle small">
                    <Scope parameters={panel.parameters} />
                  </p>
                </header>
              )}
              <Panel panel={panel} result={f.result} mode="focus" />
            </section>
          ))}
        </div>
      </div>
      {w.freshReply && (
        <button
          type="button"
          className="new-reply"
          onClick={() => {
            w.closeFocus();
            w.setFreshReply(false);
          }}
        >
          New reply in conversation <Icon name="arrow" />
        </button>
      )}
      <Composer inFocus />
    </Dialog>
  );
}
export function Overlays() {
  const w = useWorkspace();
  return (
    <>
      {w.focus && (
        <FocusDialog
          key={`${w.focus.definition?.id || ''}:${w.focus.result.id}:${w.focus.panel.id}`}
        />
      )}
      {w.save && <SaveDialog key={`${w.save.result.id}:${w.save.panel.id}`} />}
      {w.sources && (
        <EvidenceDialog
          key={`${w.sources.result.id}:${w.sources.selected || ''}:${w.sources.ids?.join(',') || ''}`}
        />
      )}
    </>
  );
}
