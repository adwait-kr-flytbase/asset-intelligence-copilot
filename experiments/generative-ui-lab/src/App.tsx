import { useChat } from '@ai-sdk/react';
import { useQuery } from '@tanstack/react-query';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type LabMessage,
  type Query,
  RunGate,
  restoreSnapshot,
  type Snapshot,
  validateSnapshot,
} from './protocol';
import { A2UIRenderer, DirectRenderer, RendererBoundary } from './renderers';
import { Investigation } from './widgets';
import './App.css';

const transport = new DefaultChatTransport<LabMessage>({
  api: '/api/chat',
  // Results belong to the canvas. Do not resend growing visual artifacts to the model/API.
  prepareSendMessagesRequest: ({ messages, body }) => {
    const latest = [...messages].reverse().find((message) => message.role === 'user');
    return {
      body: {
        ...body,
        messages: latest
          ? [{ ...latest, parts: latest.parts.filter((part) => part.type === 'text') }]
          : [],
      },
    };
  },
});
const storageKey = 'genui-lab-investigation-v1';
const scenarios: { id: Query; title: string; description: string; prompt: string }[] = [
  {
    id: 'attention',
    title: 'Wells needing attention',
    description: 'Production, location and conflicting observations',
    prompt: 'Which wells need attention today? Show the evidence and where they are.',
  },
  {
    id: 'downtime',
    title: 'Lost production time',
    description: 'Rank downtime and inspect temperature trends',
    prompt: 'Where are we losing production time? Compare wells and show their temperature trends.',
  },
  {
    id: 'spills',
    title: 'Spill investigation',
    description: 'Explore locations, distribution and corrected records',
    prompt: 'Show the spill locations and distribution, with conflicting records.',
  },
];
type EventRecord = { at: string; type: string; detail: unknown };
function loadInitial() {
  try {
    const raw = localStorage.getItem(storageKey);
    return { snapshot: raw ? restoreSnapshot(raw) : null, error: '' };
  } catch {
    return {
      snapshot: null,
      error:
        'The saved investigation was invalid or used an unsupported schema. Select a replay to start again.',
    };
  }
}
export default function App() {
  const [initial] = useState(loadInitial);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(initial.snapshot);
  const [notice, setNotice] = useState(initial.error);
  const [query, setQuery] = useState<Query>('attention');
  const [mode, setMode] = useState<'replay' | 'live'>('replay');
  const [renderer, setRenderer] = useState<'a2ui' | 'direct'>('a2ui');
  const [fault, setFault] = useState('none');
  const [input, setInput] = useState(scenarios[0].prompt);
  const [area, setArea] = useState('All areas');
  const [selected, setSelected] = useState('LAB-W01');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [progress, setProgress] = useState('Choose an investigation to begin');
  const [timings, setTimings] = useState<{ first?: number; complete?: number }>({});
  const [inspect, setInspect] = useState(false);
  const gate = useRef(new RunGate());
  const previous = useRef<Snapshot | null>(snapshot);
  const current = useRef<Snapshot | null>(snapshot);
  current.current = snapshot;
  const started = useRef(0),
    first = useRef<number | undefined>(undefined);
  const evidenceRef = useRef<HTMLDivElement>(null);
  const record = useCallback(
    (type: string, detail: unknown) =>
      setEvents((old) => [...old.slice(-79), { at: new Date().toISOString(), type, detail }]),
    [],
  );
  const health = useQuery({
    queryKey: ['lab-health'],
    queryFn: async () => {
      const response = await fetch('/api/health');
      if (!response.ok) throw Error('Demo backend unavailable');
      return response.json() as Promise<{ liveConfigured: boolean; status: string }>;
    },
    retry: false,
  });
  const handleFailure = useCallback(
    (message: string) => {
      gate.current.cancel();
      setSnapshot(previous.current);
      setNotice(message);
      setProgress('Update failed; previous investigation retained');
      record('error', { message });
    },
    [record],
  );
  const { messages, sendMessage, status, stop, clearError, setMessages } = useChat<LabMessage>({
    transport,
    onData: (part) => {
      if (part.type === 'data-progress') {
        if (gate.current.accepts(part.data.runId)) {
          setProgress(part.data.label);
          record('progress', part.data);
        }
        return;
      }
      if (part.type !== 'data-surface') return;
      const raw = part.data;
      const id = raw && typeof raw === 'object' && 'runId' in raw ? raw.runId : undefined;
      if (typeof id !== 'string' || !gate.current.accepts(id)) {
        record('ignored', { reason: 'Late or cancelled surface' });
        return;
      }
      try {
        const accepted = validateSnapshot(raw);
        first.current ??= Math.round(performance.now() - started.current);
        setTimings({
          first: first.current,
          ...(accepted.phase === 'ready'
            ? { complete: Math.round(performance.now() - started.current) }
            : {}),
        });
        setSnapshot(accepted);
        record('validated surface', {
          phase: accepted.phase,
          resultId: accepted.result.id,
          wire: accepted.wire,
        });
        if (accepted.phase === 'ready') {
          previous.current = accepted;
          setProgress('Investigation ready');
          record('complete', { resultId: accepted.result.id });
        }
      } catch {
        handleFailure(
          'Rejected an invalid presentation or evidence reference. Your previous investigation is intact.',
        );
      }
    },
    onError: () =>
      handleFailure(
        'The update could not finish. Check demo-backend/provider configuration or use an offline replay.',
      ),
  });
  const busy = status === 'submitted' || status === 'streaming';
  useEffect(() => {
    if (snapshot?.phase === 'ready') {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ schemaVersion: 1, snapshot }));
      } catch {
        setNotice('Browser storage is unavailable; this investigation will not survive reload.');
      }
    }
  }, [snapshot]);
  useEffect(() => {
    if (!sourceId) return;
    const trigger = document.activeElement as HTMLElement | null;
    evidenceRef.current?.focus();
    return () => trigger?.focus();
  }, [sourceId]);
  const action = useCallback(
    (name: string, data: Record<string, unknown>) => {
      const r = current.current?.result;
      if (!r) return;
      if (
        name === 'selectWell' &&
        typeof data.wellId === 'string' &&
        r.rows.some((w) => w.id === data.wellId)
      ) {
        setSelected(data.wellId);
      }
      if (
        name === 'openEvidence' &&
        typeof data.sourceId === 'string' &&
        r.sources.some((s) => s.id === data.sourceId)
      ) {
        setSourceId(data.sourceId);
      }
      record('action', { name, ...data });
    },
    [record],
  );
  function choose(id: Query) {
    setQuery(id);
    setInput(scenarios.find((s) => s.id === id)!.prompt);
  }
  async function run(representation: 'auto' | 'table' = 'auto') {
    if (busy || health.isError || !input.trim()) return;
    if (mode === 'live' && representation === 'auto' && !health.data?.liveConfigured) {
      setNotice(
        'Live generation is not configured. Add the lab model settings to .env and restart the demo backend.',
      );
      record('unavailable', { mode: 'live' });
      return;
    }
    const runId = crypto.randomUUID();
    gate.current.start(runId);
    previous.current = current.current?.phase === 'ready' ? current.current : previous.current;
    started.current = performance.now();
    first.current = undefined;
    setTimings({});
    setNotice('');
    setProgress('Starting investigation…');
    clearError();
    record('run', { runId, mode, query, renderer, fault, representation });
    if (messages.length > 20) setMessages(messages.slice(-10));
    await sendMessage(
      {
        text:
          representation === 'table' ? `${input}\nShow the same investigation as a table.` : input,
      },
      {
        body: {
          runId,
          mode,
          query:
            (representation === 'table' || mode === 'live') && snapshot
              ? snapshot.result.query
              : query,
          fault,
          representation,
        },
      },
    );
  }
  function cancel() {
    gate.current.cancel();
    void stop();
    setSnapshot(previous.current);
    setProgress('Cancelled; previous investigation retained');
    record('cancel', { lateResultsIgnored: true });
  }
  function reset() {
    gate.current.cancel();
    void stop();
    clearError();
    setSnapshot(null);
    previous.current = null;
    setSourceId(null);
    setMessages([]);
    setDraft('');
    setEvents([]);
    setTimings({});
    setNotice('');
    setProgress('Choose an investigation to begin');
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* UI still resets when storage is denied. */
    }
  }
  function exportRun() {
    const artifact = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      mode: snapshot?.generation || mode,
      renderer,
      protocol: 'v0.9.1',
      a2uiPackage: '0.14.0',
      timings,
      snapshot,
      events,
      limitations: [
        'Synthetic data only',
        'Offline replays are scripted',
        'Timing is an observation, not a framework benchmark',
        'Prompts, credentials and local draft notes are excluded',
      ],
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'generative-ui-experiment.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    record('export', { schemaVersion: 1 });
  }
  const source = snapshot?.result.sources.find((s) => s.id === sourceId);
  const activeScenario = scenarios.find((s) => s.id === (snapshot?.result.query || query))!;
  return (
    <div className="lab-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Fieldwork lab home">
          <span className="brand-mark" aria-hidden="true">
            ⌁
          </span>
          <span>
            Fieldwork<span className="brand-suffix"> / Generative UI lab</span>
          </span>
        </a>
        <div className="topbar-actions">
          <span className="sandbox-badge">Synthetic sandbox</span>
          <button type="button" className="quiet-button" onClick={reset}>
            Reset lab
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="conversation-pane" aria-label="Investigation conversation">
          <div className="pane-intro">
            <span className="connection">
              <span className={`dot ${health.isError ? 'amber' : 'teal'}`} />
              {health.isPending
                ? 'Connecting to demo backend'
                : health.isError
                  ? 'Demo backend unavailable'
                  : 'Demo backend connected'}
            </span>
            <h1>
              Ask a question.
              <br /> Work with the answer.
            </h1>
            <p>Explore how an agent can turn operational records into a useful investigation.</p>
          </div>
          <div className="mode-control">
            <label htmlFor="generation-mode">Generation</label>
            <select
              id="generation-mode"
              value={mode}
              disabled={busy}
              onChange={(e) => {
                setMode(e.target.value as typeof mode);
                if (e.target.value === 'replay')
                  setInput(scenarios.find((s) => s.id === query)!.prompt);
                setNotice('');
              }}
            >
              <option value="replay">Offline scripted replay</option>
              <option value="live">Live model generation</option>
            </select>
            <p>
              {mode === 'replay'
                ? 'Choose a scenario below. Replay uses predefined compositions; it does not interpret free text.'
                : health.data?.liveConfigured
                  ? 'Ask freely within the three supported investigations. A model selects the query and views.'
                  : 'Configure a provider on the demo backend to generate views from your own question.'}
            </p>
          </div>
          <fieldset className="scenario-list" aria-label="Replay investigations">
            {scenarios.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`scenario ${query === s.id ? 'active' : ''}`}
                disabled={busy}
                onClick={() => choose(s.id)}
                aria-pressed={query === s.id}
              >
                <span className="scenario-icon" aria-hidden="true">
                  {s.id === 'attention' ? '◎' : s.id === 'downtime' ? '▥' : '◇'}
                </span>
                <span>
                  <strong>{s.title}</strong>
                  <small>{s.description}</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </fieldset>
          <div role="log" className="conversation-log" aria-label="Messages" aria-live="polite">
            {messages.slice(-6).map((m) => (
              <div className={`chat-message ${m.role}`} key={m.id}>
                <strong>{m.role === 'user' ? 'You' : 'Lab assistant'}</strong>
                <p>
                  {m.parts
                    .filter((p) => p.type === 'text')
                    .map((p) => (p.type === 'text' ? p.text : ''))
                    .join('\n')}
                </p>
              </div>
            ))}
          </div>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <label htmlFor="question">
              {mode === 'replay' ? 'Scripted question' : 'Your question'}
            </label>
            <textarea
              id="question"
              value={input}
              readOnly={mode === 'replay'}
              onChange={(e) => setInput(e.target.value)}
              rows={3}
              maxLength={5000}
            />
            <div className="composer-footer">
              <span>
                {mode === 'replay' ? 'Replay · no model call' : 'Live · synthetic data only'}
              </span>
              {busy ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={(event) => {
                    event.preventDefault();
                    cancel();
                  }}
                >
                  Stop update
                </button>
              ) : (
                <button
                  type="submit"
                  className="primary-button"
                  disabled={health.isPending || health.isError || !input.trim()}
                >
                  {mode === 'replay' ? 'Replay investigation' : 'Generate investigation'}
                  <span aria-hidden="true">↗</span>
                </button>
              )}
            </div>
          </form>
          <p className="isolation-note">
            Separate demo app and Hono backend.
            <br />
            No production data or operational writes.
          </p>
        </aside>
        <main className="investigation-pane">
          <div className="canvas-toolbar">
            <div className="canvas-label">
              <span className="dot teal" />
              Investigation canvas
            </div>
            <label className="renderer-select">
              Renderer
              <select
                aria-label="Renderer"
                value={renderer}
                onChange={(e) => {
                  setRenderer(e.target.value as typeof renderer);
                  record('renderer', { value: e.target.value });
                }}
              >
                <option value="a2ui">A2UI 0.9.1</option>
                <option value="direct">Direct typed baseline</option>
              </select>
            </label>
          </div>
          {notice && (
            <div className="notice" role="alert">
              {notice}
              <button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}>
                ×
              </button>
            </div>
          )}
          {snapshot ? (
            <>
              <header className="investigation-heading">
                <div>
                  <p className="result-meta">
                    Synthetic records ·{' '}
                    {snapshot.generation === 'replay'
                      ? 'Scripted replay'
                      : snapshot.generation === 'live'
                        ? 'Model-composed'
                        : 'Representation change'}{' '}
                    · revision {snapshot.result.revision}
                  </p>
                  <h2>{snapshot.result.title}</h2>
                  <p>
                    {activeScenario.description}. {snapshot.result.period}.
                  </p>
                </div>
                <div className="result-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void run('table')}
                    disabled={busy}
                  >
                    Show as table
                  </button>
                  <button type="button" className="quiet-button" onClick={exportRun}>
                    Export experiment
                  </button>
                </div>
              </header>
              <div className="result-filters">
                <label>
                  Area
                  <select
                    aria-label="Filter area"
                    value={area}
                    onChange={(e) => {
                      setArea(e.target.value);
                      record('filter', { area: e.target.value });
                    }}
                  >
                    <option>All areas</option>
                    <option>North ridge</option>
                    <option>South basin</option>
                  </select>
                </label>
                <span className="result-id" data-testid="result-id">
                  {snapshot.result.id}
                </span>
                <span className="phase-badge">
                  {snapshot.phase === 'ready' ? 'Validated' : 'Building view'}
                </span>
              </div>
              <Investigation.Provider
                value={{
                  result: snapshot.result,
                  area,
                  selected,
                  onSelect: (id) => action('selectWell', { wellId: id }),
                  onEvidence: (id) => action('openEvidence', { sourceId: id }),
                  onAction: action,
                }}
              >
                <RendererBoundary
                  key={`${snapshot.runId}-${renderer}`}
                  onError={() => {
                    setNotice(
                      'Renderer failed safely. Switch renderer to inspect the validated result.',
                    );
                    record('renderer error', {});
                  }}
                >
                  {renderer === 'a2ui' ? (
                    <A2UIRenderer snapshot={snapshot} onAction={action} onError={setNotice} />
                  ) : (
                    <DirectRenderer snapshot={snapshot} />
                  )}
                </RendererBoundary>
              </Investigation.Provider>
              <div className="investigation-footer">
                <span>
                  {snapshot.result.rows.length} synthetic wells · citations stay attached to the
                  result
                </span>
                <span>No live sensor connection</span>
              </div>
            </>
          ) : (
            <div className="canvas-empty">
              <div className="empty-symbol" aria-hidden="true">
                ⌁
              </div>
              <h2>
                The answer becomes
                <br />
                your workspace.
              </h2>
              <p>
                Start an investigation to assemble related views, inspect their evidence and refine
                the result without navigating a dashboard.
              </p>
              <button
                type="button"
                className="secondary-button"
                disabled={busy || health.isError || health.isPending}
                onClick={() => void run()}
              >
                Try the selected investigation
              </button>
              <div className="empty-capabilities">
                <span>Evidence-linked views</span>
                <span>Coordinated interactions</span>
                <span>Validated updates</span>
              </div>
            </div>
          )}
          <section className="lab-tools" aria-label="Experiment controls">
            <div className="tools-heading">
              <div>
                <h3>Experiment bench</h3>
                <p>Inspect the stream, test failure behavior and record what you learn.</p>
              </div>
              <button
                type="button"
                className="quiet-button"
                aria-expanded={inspect}
                onClick={() => setInspect(!inspect)}
              >
                {inspect ? 'Hide diagnostics' : 'Inspect experiment'}
              </button>
            </div>
            <div className="run-status" role="status">
              <span className={`dot ${busy ? 'amber' : 'teal'}`} />
              {progress}
              {timings.first !== undefined && (
                <span>
                  First view {timings.first} ms
                  {timings.complete !== undefined ? ` · Complete ${timings.complete} ms` : ''}
                </span>
              )}
            </div>
            {inspect && (
              <div className="diagnostics">
                <div className="diagnostic-controls">
                  <label>
                    Next update
                    <select
                      aria-label="Failure injection"
                      value={fault}
                      disabled={busy}
                      onChange={(e) => setFault(e.target.value)}
                    >
                      <option value="none">Normal stream</option>
                      <option value="unsupported">Unsupported component</option>
                      <option value="bad-result">Unknown result reference</option>
                      <option value="bad-source">Unknown source reference</option>
                      <option value="truncated">Interrupted / malformed update</option>
                      <option value="slow">Slow update (test Stop)</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void run()}
                    disabled={busy || health.isError || health.isPending}
                  >
                    Run experiment
                  </button>
                </div>
                <label htmlFor="draft">Local observation draft</label>
                <textarea
                  id="draft"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="What did you notice? This draft survives view updates, stays local, and is excluded from exports."
                  rows={3}
                />
                <p className="muted">
                  Browser timings include replay delays and rendering. They are not a framework
                  benchmark.
                </p>
                <details>
                  <summary>Received messages and actions ({events.length})</summary>
                  <pre data-testid="event-log">{JSON.stringify(events, null, 2)}</pre>
                </details>
              </div>
            )}
          </section>
        </main>
      </div>
      {source && (
        <div className="evidence-backdrop">
          <div
            className="evidence-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="evidence-title"
            tabIndex={-1}
            ref={evidenceRef}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSourceId(null);
              if (e.key === 'Tab') {
                e.preventDefault();
                evidenceRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
              }
            }}
          >
            <div className="evidence-heading">
              <span className="sandbox-badge">Synthetic evidence</span>
              <button
                type="button"
                className="quiet-button"
                onClick={() => {
                  setSourceId(null);
                }}
              >
                Close evidence
              </button>
            </div>
            <h2 id="evidence-title">{source.label}</h2>
            <code>{source.id}</code>
            <p>{source.body}</p>
            <div className="evidence-rule">
              <h3>What this proves</h3>
              <p>
                The displayed metric is traceable to this demo record. The source is a synthetic
                fixture, not a file from the enterprise dataset.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
