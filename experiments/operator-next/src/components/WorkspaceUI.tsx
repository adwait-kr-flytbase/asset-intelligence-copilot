import { ViewBoundary } from './ViewBoundary';
import { useQuery } from '@tanstack/react-query';
import { assetsSchema } from '../contracts';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AgentResponse, OperationalVisual } from '../contracts';
import { useWorkspace } from '../workspace';
const ArtifactView = lazy(() =>
  import('./ArtifactView').then((module) => ({ default: module.ArtifactView })),
);
import { Icon } from './Icon';
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
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
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
export function Scope({ visual }: { visual: OperationalVisual }) {
  const s = visual.artifact.scope;
  return (
    <span>
      {s.wellIds.length === 1 ? s.wellIds[0] : `${s.wellIds.length} wells`}
      <span className="meta-dot">·</span>
      {new Date(`${s.from}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })}{' '}
      –{' '}
      {new Date(`${s.to}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })}
    </span>
  );
}
export const titles = {
  geo: 'Field conditions',
  series: 'Temperature history',
  ranking: 'Asset comparison',
  matrix: 'Inspection comparison',
  obligations: 'Compliance review',
  timeline: 'Asset history',
  claims: 'Field observations',
  correction: 'Correction review',
};
export function ResultCard({
  visual,
  response,
}: {
  visual: OperationalVisual;
  response: AgentResponse;
}) {
  const w = useWorkspace();
  return (
    <section className="art-card" aria-label={titles[visual.artifact.kind]}>
      <header className="art-card-head">
        <div>
          <h3>
            {response.mode === 'sample' ? visual.artifact.title : titles[visual.artifact.kind]}
          </h3>
          <div className="subtle small">
            <Scope visual={visual} />
          </div>
        </div>
        <div className="result-actions">
          <button
            className="icon-button"
            title="Save view"
            aria-label={`Save ${titles[visual.artifact.kind]}`}
            onClick={() => w.setSave({ visual, response })}
          >
            <Icon name="bookmark" />
          </button>
          <button
            className="icon-button"
            title="Expand result"
            aria-label={`Expand ${titles[visual.artifact.kind]}`}
            onClick={() => {
              w.setFocus({ visual, response });
              w.setFreshReply(false);
            }}
          >
            <Icon name="expand" />
          </button>
        </div>
      </header>
      <ViewBoundary key={visual.resultId}>
        <Suspense fallback={<p className="visual-loading">Loading this view…</p>}>
          <ArtifactView
            key={visual.resultId}
            visual={visual}
            presentation={response.presentation}
            mode="inline"
            selected={w.selected[`${visual.runId}:${visual.artifact.id}`] || null}
            onSelect={(id) => w.choose(visual, id)}
            onEvidence={(id) => w.setSources({ evidence: visual.evidence, selected: id })}
          />
        </Suspense>
      </ViewBoundary>
      <footer className="art-card-foot">
        <button className="quiet small" onClick={() => w.setSources({ evidence: visual.evidence })}>
          <Icon name="source" />
          {visual.evidence.length} sources
        </button>
        <span className="subtle small">
          {visual.meta.completeness === 'partial'
            ? 'Partial records'
            : response.mode === 'sample'
              ? 'Sample records'
              : 'Synthetic records'}
          <span className="meta-dot">·</span>As of {visual.meta.asOf.slice(0, 10)}
        </span>
      </footer>
    </section>
  );
}
export function Composer({ inFocus = false }: { inFocus?: boolean }) {
  const w = useWorkspace();
  const [text, setText] = useState('');
  return (
    <div className={`composer-wrap ${inFocus ? 'in-focus' : ''}`}>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) {
            w.send(text, inFocus);
            setText('');
          }
        }}
      >
        {(w.context || inFocus) && (
          <div className="composer-context">
            <Icon name="assets" />
            <span>
              Asking about{' '}
              <strong>
                {inFocus && w.focus
                  ? w.context && w.focus.visual.artifact.scope.wellIds.includes(w.context)
                    ? w.context
                    : w.focus.visual.artifact.scope.wellIds.length === 1
                      ? w.focus.visual.artifact.scope.wellIds[0]
                      : `${w.focus.visual.artifact.scope.wellIds.length} wells in this result`
                  : w.context}
              </strong>
            </span>
            {w.context && (
              <button
                type="button"
                className="icon-button"
                aria-label="Clear asset context"
                onClick={() => {
                  w.setContext(null);
                }}
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
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (text.trim()) {
                  w.send(text, inFocus);
                  setText('');
                }
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
            <button className="send-button" aria-label="Send message" disabled={!text.trim()}>
              <Icon name="arrow" />
            </button>
          )}
        </div>
      </form>
      <p className="composer-note">
        {w.dataset === 'sample' ? 'Sample data' : 'Demo data'} · Check the linked records before
        making operational decisions.
      </p>
    </div>
  );
}
function SaveDialog() {
  const w = useWorkspace();
  const [name, setName] = useState(w.save ? titles[w.save.visual.artifact.kind] : '');
  const [error, setError] = useState('');
  return (
    <Dialog className="save-dialog" label="Save view" onClose={() => w.setSave(null)}>
      <header className="modal-head">
        <h2>Save this view</h2>
        <button
          className="icon-button"
          aria-label="Close save dialog"
          onClick={() => w.setSave(null)}
        >
          <Icon name="close" />
        </button>
      </header>
      <p className="subtle">
        Keep the view and its filters. Opening it reads the records again, so you get a fresh
        result.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(w.saveView(name) || '');
        }}
      >
        <label className="field-label" htmlFor="view-name">
          View name
        </label>
        <input
          id="view-name"
          autoFocus
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary">Save view</button>
      </form>
    </Dialog>
  );
}
function EvidenceDialog() {
  const w = useWorkspace();
  const sources = w.sources!;
  const [active, setActive] = useState(sources.selected || sources.evidence[0]?.id);
  const evidence = sources.evidence.find((e) => e.id === active);
  return (
    <Dialog className="evidence-dialog" label="Source records" onClose={() => w.setSources(null)}>
      <header className="modal-head">
        <div>
          <p className="eyebrow">Evidence</p>
          <h2>Source records</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close sources"
          onClick={() => w.setSources(null)}
        >
          <Icon name="close" />
        </button>
      </header>
      <p className="subtle">
        Records attached to this specific result. Review the record identity, original values and
        revision before relying on a result.
      </p>
      <label className="field-label" htmlFor="source-select">
        Record
      </label>
      <select id="source-select" value={active} onChange={(e) => setActive(e.target.value)}>
        {sources.evidence.map((e) => (
          <option key={e.id} value={e.id}>
            {e.label}
          </option>
        ))}
      </select>
      {evidence && (
        <article className="source-record">
          <span className="tag">
            {evidence.kind} · {evidence.visibility}
          </span>
          <h3>{evidence.label}</h3>
          <blockquote>{evidence.excerpt}</blockquote>
          <dl>
            <dt>Record</dt>
            <dd>{evidence.recordId}</dd>
            <dt>Revision</dt>
            <dd>{evidence.revision}</dd>
            {evidence.observedAt && (
              <>
                <dt>Observed</dt>
                <dd>{evidence.observedAt}</dd>
              </>
            )}
            <dt>Location</dt>
            <dd>{evidence.path}</dd>
            {evidence.locator && (
              <>
                <dt>Locator</dt>
                <dd>{JSON.stringify(evidence.locator)}</dd>
              </>
            )}
          </dl>
          {evidence.inputSourceIds?.length && (
            <div>
              <h4>Calculation inputs</h4>
              {evidence.inputSourceIds.map((id) => (
                <button className="source-link" key={id} onClick={() => setActive(id)}>
                  {sources.evidence.find((s) => s.id === id)?.label || id}
                </button>
              ))}
            </div>
          )}
        </article>
      )}
    </Dialog>
  );
}
function FocusDialog() {
  const w = useWorkspace();
  const f = w.focus!;
  const visual = f.visual;
  const assetQuery = useQuery({
    queryKey: ['assets', f.response.mode],
    queryFn: async () => {
      const r = await fetch(`/api/assets?dataset=${f.response.mode}`);
      if (!r.ok) throw Error('Asset read failed');
      return assetsSchema.parse(await r.json());
    },
  });
  const [well, setWell] = useState(
    f.response.parameters.wellIds && f.response.parameters.wellIds.length > 1
      ? 'subset'
      : f.response.parameters.wellId,
  );
  const [from, setFrom] = useState(f.response.parameters.from || visual.artifact.scope.from);
  const [to, setTo] = useState(f.response.parameters.to || visual.artifact.scope.to);
  const [error, setError] = useState('');
  return (
    <Dialog className="focus-dialog" label={titles[visual.artifact.kind]} onClose={w.closeFocus}>
      <header className="focus-head">
        <button className="quiet" onClick={w.closeFocus}>
          <Icon name="back" />
          <span>Conversation</span>
        </button>
        <span className="tag">{f.definition ? 'Saved view' : 'Result'}</span>
        <div className="focus-actions">
          <button className="quiet" onClick={() => w.setSources({ evidence: visual.evidence })}>
            <Icon name="source" />
            Sources
          </button>
          <button className="quiet" onClick={() => w.setSave(f)}>
            <Icon name="bookmark" />
            Save view
          </button>
        </div>
      </header>
      <div className="focus-scroll">
        <div className="focus-title">
          <p className="eyebrow">{f.definition?.name || 'Asset intelligence'}</p>
          <h1>
            {f.response.mode === 'sample' ? visual.artifact.title : titles[visual.artifact.kind]}
          </h1>
          <p className="subtle">
            <Scope visual={visual} /> ·{' '}
            {f.response.mode === 'sample' ? 'Sample data' : 'Synthetic data'} · As of{' '}
            {visual.meta.asOf.slice(0, 10)}
          </p>
        </div>
        {f.definition && (
          <form
            className="view-filters"
            onSubmit={(e) => {
              e.preventDefault();
              if (from > to) {
                setError('Start date must be before end date.');
                return;
              }
              setError('');
              void w.runView(f.definition!, {
                ...f.definition!.parameters,
                wellIds: well === 'subset' ? f.response.parameters.wellIds : undefined,
                wellId: well === 'subset' ? 'all' : well,
                area:
                  well === 'all' || well === 'subset' ? f.definition!.parameters.area : undefined,
                ...(visual.artifact.kind === 'series' ? { from, to } : {}),
              });
            }}
          >
            <label>
              Asset
              <select value={well} onChange={(e) => setWell(e.target.value)}>
                <option value="all">
                  All wells
                  {f.definition.parameters.area ? ` in ${f.definition.parameters.area}` : ''}
                </option>
                {f.response.parameters.wellIds && (
                  <option value="subset">
                    Saved selection ({f.response.parameters.wellIds.length} wells)
                  </option>
                )}
                {assetQuery.data?.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.id}
                  </option>
                ))}
              </select>
            </label>
            {visual.artifact.kind === 'series' && (
              <>
                <label>
                  From
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    required
                  />
                </label>
                <label>
                  To
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
                </label>
              </>
            )}
            <button className="secondary" disabled={!!w.pending}>
              Apply & refresh
            </button>
            <button
              type="button"
              className="quiet"
              disabled={!!w.pending}
              onClick={() => void w.runView(f.definition!, f.response.parameters)}
            >
              Refresh current
            </button>
            {error && (
              <span className="error" role="alert">
                {error}
              </span>
            )}
          </form>
        )}
        {w.pending?.kind === 'saved' && (
          <p className="read-status" role="status">
            Reading fresh records. The result below retains its original scope until complete.
          </p>
        )}
        <div className="focus-artifact">
          <ViewBoundary key={visual.resultId}>
            <Suspense fallback={<p className="visual-loading">Loading this view…</p>}>
              <ArtifactView
                key={visual.resultId}
                visual={visual}
                presentation={f.response.presentation}
                mode="focus"
                selected={w.selected[`${visual.runId}:${visual.artifact.id}`] || null}
                onSelect={(id) => w.choose(visual, id)}
                onEvidence={(id) => w.setSources({ evidence: visual.evidence, selected: id })}
              />
            </Suspense>
          </ViewBoundary>
        </div>
        {w.freshReply &&
          w.store.threads.find((t) => t.id === w.store.activeId)?.entries.at(-1)?.status ===
            'failed' && (
            <p className="error" role="alert">
              The read could not finish. This result retains its original scope and date. See the
              conversation for details.
            </p>
          )}
      </div>
      {w.freshReply && (
        <button
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
      {w.focus && <FocusDialog key={w.focus.definition?.id || w.focus.visual.resultId} />}
      {w.save && <SaveDialog key={w.save.visual.resultId} />}
      {w.sources && <EvidenceDialog key={w.sources.selected || w.sources.evidence[0]?.id} />}
    </>
  );
}
