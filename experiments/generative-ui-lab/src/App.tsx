import { useChat } from '@ai-sdk/react';
import { useQuery } from '@tanstack/react-query';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  completeAnswer,
  emptyHistory,
  HISTORY_KEY,
  type History,
  LEGACY_KEY,
  latestResult,
  migrateLegacy,
  newThread,
  readHistory,
  type Thread,
} from './history';
import { type LabMessage, type Query, RunGate, type Snapshot, validateSnapshot } from './protocol';
import { A2UIRenderer, DirectRenderer, RendererBoundary } from './renderers';
import { Investigation } from './widgets';
import './App.css';

const transport = new DefaultChatTransport<LabMessage>({
  api: '/api/chat',
  prepareSendMessagesRequest: ({ messages, body }) => {
    const latest = [...messages].reverse().find((m) => m.role === 'user');
    return {
      body: {
        ...body,
        messages: latest
          ? [{ ...latest, parts: latest.parts.filter((p) => p.type === 'text') }]
          : [],
      },
    };
  },
});
const scenarios: { id: Query; title: string; prompt: string }[] = [
  {
    id: 'attention',
    title: 'Which wells need attention?',
    prompt: 'Which wells need attention today? Show the evidence and where they are.',
  },
  {
    id: 'downtime',
    title: 'Where are we losing production time?',
    prompt: 'Where are we losing production time? Compare wells and show their temperature trends.',
  },
  {
    id: 'spills',
    title: 'Show spills and conflicting records',
    prompt: 'Show the spill locations and distribution, with conflicting records.',
  },
];
function loadInitial() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY),
      legacy = localStorage.getItem(LEGACY_KEY);
    return {
      history: raw ? readHistory(raw) : legacy ? migrateLegacy(legacy) : emptyHistory(),
      error: '',
    };
  } catch {
    return {
      history: emptyHistory(),
      error:
        'Saved history could not be opened. It has been kept in browser storage; new work is temporary until you choose Save new history in Lab settings.',
    };
  }
}
function answerSummary(s: Snapshot) {
  const r = s.result;
  if (r.query === 'downtime')
    return `${r.rows.reduce((sum, w) => sum + w.downtimeDays, 0)} days of downtime across ${r.rows.length} wells in the synthetic inspection period. Open the result to compare wells and check temperature trends.`;
  if (r.query === 'spills')
    return `${r.rows.reduce((sum, w) => sum + w.spillBbl, 0).toFixed(1)} bbl recorded across the synthetic wells. The result includes locations and conflicting records; missing coordinates are flagged.`;
  return `${r.rows.filter((w) => !w.producing).length} wells are below their production threshold. Inspect the locations, missing observations and conflicting records before drawing a conclusion.`;
}
export default function App() {
  const [initial] = useState(loadInitial);
  const [history, setHistory] = useState<History>(initial.history);
  const historyRef = useRef(history);
  const updateHistory = useCallback((fn: (h: History) => History) => {
    const next = fn(historyRef.current);
    historyRef.current = next;
    setHistory(next);
  }, []);
  const updateThread = useCallback(
    (id: string, fn: (t: Thread) => Thread) =>
      updateHistory((h) => ({ ...h, threads: h.threads.map((t) => (t.id === id ? fn(t) : t)) })),
    [updateHistory],
  );
  const thread = history.threads.find((t) => t.id === history.activeId)!;
  const [preview, setPreview] = useState<Snapshot | null>(null);
  const snapshot =
    preview || (thread.activeResultId ? thread.results[thread.activeResultId] : null);
  const latest = latestResult(thread);
  const historical = !!snapshot && !!latest && snapshot.runId !== latest.runId && !preview;
  const [notice, setNotice] = useState(initial.error);
  const [saveAllowed, setSaveAllowed] = useState(!initial.error);
  const [storageState, setStorageState] = useState(
    initial.error ? 'Temporary · not saved' : 'Saved on this device',
  );
  const [mode, setMode] = useState<'replay' | 'live'>('replay');
  const [renderer, setRenderer] = useState<'a2ui' | 'direct'>('a2ui');
  const [fault, setFault] = useState('none');
  const [input, setInput] = useState('');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [events, setEvents] = useState<{ at: string; type: string; detail: unknown }[]>([]);
  const [inspect, setInspect] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [search, setSearch] = useState('');
  const [mobileView, setMobileView] = useState<'chat' | 'data'>('chat');
  const [progress, setProgress] = useState('');
  const [newBelow, setNewBelow] = useState(false);
  const [timings, setTimings] = useState<{ first?: number; complete?: number }>({});
  const started = useRef(0),
    first = useRef<number | undefined>(undefined);
  const gate = useRef(new RunGate());
  const pending = useRef<{ threadId: string; runId: string } | null>(null);
  const current = useRef(snapshot);
  current.current = snapshot;
  const evidenceRef = useRef<HTMLDivElement>(null),
    dialogRef = useRef<HTMLDivElement>(null),
    logRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const area = thread.area,
    selected = thread.selected;
  const setArea = (value: string) => updateThread(thread.id, (t) => ({ ...t, area: value }));
  const setSelected = useCallback(
    (value: string) =>
      updateThread(historyRef.current.activeId, (t) => ({ ...t, selected: value })),
    [updateThread],
  );
  const record = useCallback(
    (type: string, detail: unknown) =>
      setEvents((old) => [...old.slice(-79), { at: new Date().toISOString(), type, detail }]),
    [],
  );
  const health = useQuery({
    queryKey: ['lab-health'],
    queryFn: async () => {
      const response = await fetch('/api/health');
      if (!response.ok) throw Error('Backend unavailable');
      return response.json() as Promise<{ liveConfigured: boolean }>;
    },
    retry: false,
  });
  const handleFailure = useCallback(
    (message: string, status: 'failed' | 'cancelled' = 'failed') => {
      const run = pending.current;
      if (!run) return;
      pending.current = null;
      gate.current.cancel();
      setPreview(null);
      setNotice(message);
      setProgress(message);
      updateThread(run.threadId, (t) => ({
        ...t,
        entries: t.entries.map((e) =>
          e.runId === run.runId && e.role === 'assistant' && e.status === 'pending'
            ? { ...e, status, text: message }
            : e,
        ),
      }));
      record(status, { runId: run.runId });
    },
    [updateThread, record],
  );
  const { sendMessage, status, stop, clearError, setMessages } = useChat<LabMessage>({
    transport,
    onData: (part) => {
      if (part.type === 'data-progress') {
        if (gate.current.accepts(part.data.runId)) setProgress(part.data.label);
        return;
      }
      if (part.type !== 'data-surface') return;
      const raw = part.data;
      const id = raw && typeof raw === 'object' && 'runId' in raw ? raw.runId : undefined;
      if (typeof id !== 'string' || !gate.current.accepts(id) || !pending.current) {
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
        record('validated surface', {
          phase: accepted.phase,
          resultId: accepted.result.id,
          wire: accepted.wire,
        });
        if (accepted.phase === 'ready') {
          const run = pending.current;
          pending.current = null;
          gate.current.cancel();
          updateThread(run.threadId, (t) => completeAnswer(t, accepted, answerSummary(accepted)));
          setPreview(null);
          setProgress('Result ready');
        } else setPreview(accepted);
      } catch {
        handleFailure(
          'This update could not be verified. Your previous result and history are intact.',
        );
      }
    },
    onError: () =>
      handleFailure(
        'The update could not finish. Your previous result is intact. Check the demo connection or try a starter question.',
      ),
    onFinish: () => {
      if (pending.current)
        handleFailure(
          'The update ended before a complete result arrived. Your previous result is intact.',
        );
    },
  });
  const busy = status === 'submitted' || status === 'streaming';
  useEffect(() => {
    if (!saveAllowed) return;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      setStorageState('Saved on this device');
    } catch {
      setStorageState('Temporary · not saved');
      setNotice(
        'History could not be saved on this device. Current work remains available until you close or reload this page.',
      );
    }
  }, [history, saveAllowed]);
  useEffect(() => {
    const log = logRef.current;
    if (!log || !thread.entries.length) return;
    if (atBottom.current) {
      log.scrollTop = log.scrollHeight;
      setNewBelow(false);
    } else setNewBelow(true);
  }, [thread.entries]);
  useEffect(() => {
    if (!sourceId && !inspect && !showHistory) return;
    const trigger = document.activeElement as HTMLElement | null;
    (sourceId ? evidenceRef.current : dialogRef.current)?.focus();
    return () => trigger?.focus();
  }, [sourceId, inspect, showHistory]);
  const action = useCallback(
    (name: string, data: Record<string, unknown>) => {
      const r = current.current?.result;
      if (!r) return;
      if (
        name === 'selectWell' &&
        typeof data.wellId === 'string' &&
        r.rows.some((w) => w.id === data.wellId)
      )
        setSelected(data.wellId);
      if (
        name === 'openEvidence' &&
        typeof data.sourceId === 'string' &&
        r.sources.some((s) => s.id === data.sourceId)
      )
        setSourceId(data.sourceId);
      record('action', { name, ...data });
    },
    [record, setSelected],
  );
  async function run(
    text = input,
    representation: 'auto' | 'table' = 'auto',
    explicitQuery?: Query,
  ) {
    if (busy || health.isError || health.isPending || !text.trim()) return;
    const active = historyRef.current.threads.find((t) => t.id === historyRef.current.activeId)!;
    const existing = active.activeResultId ? active.results[active.activeResultId] : null;
    let query: Query = explicitQuery || existing?.result.query || 'attention';
    if (mode === 'replay' && representation === 'auto' && !explicitQuery) {
      if (/spill/i.test(text)) query = 'spills';
      else if (/downtime|losing production|lost production|temperature trend/i.test(text))
        query = 'downtime';
      else if (/attention|production status|which wells|well status/i.test(text))
        query = 'attention';
      else {
        setNotice(
          'This demo has scripted answers for well attention, downtime and spills. Choose a starter below, or enable a configured live model in Lab settings.',
        );
        return;
      }
    }
    if (mode === 'live' && representation === 'auto' && !health.data?.liveConfigured) {
      setNotice(
        'Live model is not configured. Use a starter in scripted mode, or configure the demo backend.',
      );
      return;
    }
    const runId = crypto.randomUUID(),
      now = new Date().toISOString();
    gate.current.start(runId);
    pending.current = { threadId: active.id, runId };
    started.current = performance.now();
    first.current = undefined;
    setTimings({});
    setPreview(null);
    setNotice('');
    setProgress('Checking the records…');
    clearError();
    updateThread(active.id, (t) => ({
      ...t,
      title: t.entries.length ? t.title : scenarios.find((s) => s.id === query)!.title,
      updatedAt: now,
      entries: [
        ...t.entries,
        { id: crypto.randomUUID(), role: 'user', text, status: 'complete', runId, createdAt: now },
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: 'Checking the records…',
          status: 'pending',
          runId,
          createdAt: now,
        },
      ],
    }));
    setInput('');
    setMessages([]);
    record('run', { runId, mode, query, renderer, fault, representation });
    await sendMessage(
      { text },
      {
        body: {
          runId,
          mode,
          query,
          fault,
          representation,
          appContext: {
            area: active.area,
            selectedWellIds: [active.selected],
            resultId: existing?.result.id || null,
          },
        },
      },
    );
  }
  function cancel() {
    handleFailure('Update stopped. Your previous result is still available.', 'cancelled');
    void stop();
  }
  function switchThread(id?: string) {
    if (pending.current) cancel();
    else {
      gate.current.cancel();
      void stop();
    }
    clearError();
    setMessages([]);
    setPreview(null);
    setSourceId(null);
    setInput('');
    setNotice('');
    setProgress('');
    atBottom.current = true;
    updateHistory((h) => {
      if (id) return { ...h, activeId: id };
      const t = newThread();
      return { ...h, activeId: t.id, threads: [t, ...h.threads] };
    });
    setShowHistory(false);
    setMobileView('chat');
  }
  function openResult(runId: string) {
    if (busy) return;
    setPreview(null);
    setSourceId(null);
    updateThread(thread.id, (t) => ({ ...t, activeResultId: runId }));
    setMobileView('data');
  }
  function exportRun() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              schemaVersion: 1,
              snapshot,
              timings,
              events,
              limitations: [
                'Synthetic data only',
                'Scripted replay is not model reasoning',
                'Prompts and notes excluded',
              ],
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'generative-ui-experiment.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function trapDialog(e: React.KeyboardEvent<HTMLDivElement>, close: () => void) {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const nodes = Array.from(
        e.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,textarea,select,a[href]',
        ),
      );
      const firstNode = nodes[0],
        lastNode = nodes[nodes.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === firstNode || document.activeElement === e.currentTarget)
      ) {
        e.preventDefault();
        lastNode?.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === lastNode || document.activeElement === e.currentTarget)
      ) {
        e.preventDefault();
        firstNode?.focus();
      }
    }
  }
  const source = snapshot?.result.sources.find((s) => s.id === sourceId);
  const modalOpen = !!source || inspect || showHistory;
  return (
    <div className="lab-shell operator-shell">
      <div className="operator-app" inert={modalOpen}>
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              ⌁
            </span>
            <span>Fieldwork</span>
          </div>
          <span className="sandbox-badge">Synthetic demo</span>
          <div className="topbar-actions">
            <button className="secondary-button" type="button" onClick={() => setShowHistory(true)}>
              History
            </button>
            <button className="quiet-button" type="button" onClick={() => switchThread()}>
              New investigation
            </button>
            <button
              className="quiet-button settings-trigger"
              type="button"
              onClick={() => setInspect(true)}
            >
              Lab settings
            </button>
          </div>
        </header>
        {notice && (
          <div className="notice" role="alert">
            {notice}
            <button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}>
              ×
            </button>
          </div>
        )}
        <nav className="mobile-destinations" aria-label="Investigation view">
          <button
            type="button"
            aria-pressed={mobileView === 'chat'}
            onClick={() => setMobileView('chat')}
          >
            Conversation
          </button>
          <button
            type="button"
            aria-pressed={mobileView === 'data'}
            onClick={() => setMobileView('data')}
          >
            Data {snapshot ? '· Ready' : ''}
          </button>
        </nav>
        <div className={`workspace view-${mobileView}`}>
          <aside className="conversation-pane" aria-label="Investigation conversation">
            <div className="conversation-heading">
              <h1>{thread.title}</h1>
              <p>
                {mode === 'replay'
                  ? 'Scripted answers · no model call'
                  : 'Live model · synthetic records'}{' '}
                · {storageState}
              </p>
            </div>
            <div
              role="log"
              className="conversation-log"
              aria-label="Messages"
              aria-live="polite"
              ref={logRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
                if (atBottom.current) setNewBelow(false);
              }}
            >
              {!thread.entries.length && (
                <div className="conversation-welcome">
                  <h2>What do you need to check?</h2>
                  <p>Ask about the wells, then explore the evidence alongside your answer.</p>
                  <div className="operator-starters">
                    {scenarios.map((s) => (
                      <button
                        type="button"
                        className="starter"
                        key={s.id}
                        disabled={busy || health.isPending || health.isError}
                        onClick={() => void run(s.prompt, 'auto', s.id)}
                      >
                        {s.title}
                        <span aria-hidden="true">↗</span>
                      </button>
                    ))}
                  </div>
                  <p className="muted">
                    These examples use synthetic records. They are for evaluating the experience.
                  </p>
                </div>
              )}
              {thread.entries.map((entry) => (
                <article
                  className={`chat-message ${entry.role}`}
                  key={entry.id}
                  data-status={entry.status}
                >
                  <strong>{entry.role === 'user' ? 'You' : 'Fieldwork'}</strong>
                  <p>{entry.status === 'pending' ? progress : entry.text}</p>
                  {entry.resultId && (
                    <button
                      className={`answer-result ${snapshot?.runId === entry.resultId ? 'active' : ''}`}
                      type="button"
                      disabled={busy}
                      onClick={() => openResult(entry.resultId!)}
                    >
                      <span>
                        <strong>{thread.results[entry.resultId].result.title}</strong>
                        <small>
                          {thread.results[entry.resultId].plan.views.length} linked views ·
                          synthetic records
                        </small>
                      </span>
                      <span>Open result →</span>
                    </button>
                  )}
                  {(entry.status === 'failed' || entry.status === 'cancelled') && (
                    <small className="attempt-status">
                      {entry.status === 'failed' ? 'Update failed' : 'Update stopped'}
                    </small>
                  )}
                </article>
              ))}
            </div>
            {newBelow && (
              <button
                className="jump-latest"
                type="button"
                onClick={() => {
                  atBottom.current = true;
                  const log = logRef.current;
                  if (log) log.scrollTop = log.scrollHeight;
                  setNewBelow(false);
                }}
              >
                Jump to latest message ↓
              </button>
            )}
            {!!thread.entries.length && (
              <details className="more-questions">
                <summary>Try another question</summary>
                <div className="operator-starters">
                  {scenarios.map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      disabled={busy}
                      onClick={() => void run(s.prompt, 'auto', s.id)}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              </details>
            )}
          </aside>
          <main className="investigation-pane" aria-label="Investigation data">
            {snapshot ? (
              <>
                {historical && (
                  <div className="earlier-answer">
                    Viewing an earlier answer{' '}
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => openResult(latest!.runId)}
                    >
                      Back to latest result
                    </button>
                  </div>
                )}
                <header className="investigation-heading">
                  <div>
                    <p className="result-meta">
                      Synthetic records ·{' '}
                      {snapshot.generation === 'replay'
                        ? 'Scripted replay'
                        : snapshot.generation === 'live'
                          ? 'Model-composed'
                          : 'Representation change'}
                    </p>
                    <h2>{snapshot.result.title}</h2>
                    <p>
                      {snapshot.result.period} · Records prepared{' '}
                      {new Date(snapshot.result.asOf).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <div className="result-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          scenarios.find((s) => s.id === snapshot.result.query)!.prompt,
                          'auto',
                          snapshot.result.query,
                        )
                      }
                    >
                      Refresh answer
                    </button>
                    <button
                      type="button"
                      className="quiet-button"
                      disabled={busy}
                      onClick={() => void run('Show the same investigation as a table.', 'table')}
                    >
                      Show as table
                    </button>
                  </div>
                </header>
                <div className="result-filters">
                  <label>
                    Area{' '}
                    <select
                      aria-label="Filter area"
                      value={area}
                      onChange={(e) => setArea(e.target.value)}
                    >
                      <option>All areas</option>
                      <option>North ridge</option>
                      <option>South basin</option>
                    </select>
                  </label>
                  <span>Selected: {selected}</span>
                  <span className="phase-badge">
                    {snapshot.phase === 'ready' ? 'Ready' : 'Building view…'}
                  </span>
                </div>
                <p className="scope-note">
                  Area filters the views. Well selection focuses the temperature trend. Answers
                  summarize all six synthetic wells; no live sensor connection.
                </p>
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
              </>
            ) : (
              <div className="canvas-empty">
                <div className="empty-symbol" aria-hidden="true">
                  ⌁
                </div>
                <h2>Your answer, with the data to explore.</h2>
                <p>
                  Choose a question in the conversation. Related views and their sources will appear
                  here.
                </p>
              </div>
            )}
          </main>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <label className="sr-only" htmlFor="question">
              Ask Fieldwork
            </label>
            <textarea
              id="question"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about well attention, downtime or spills…"
              rows={2}
              maxLength={5000}
            />
            <div className="composer-footer">
              <span>
                {health.isError
                  ? 'Demo backend unavailable'
                  : health.isPending
                    ? 'Connecting…'
                    : mode === 'replay'
                      ? 'Scripted demo · 3 investigations'
                      : 'Live model · synthetic data'}
              </span>
              {busy ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={(e) => {
                    e.preventDefault();
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
                  Send <span aria-hidden="true">↑</span>
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
      {(showHistory || inspect) && (
        <div className="evidence-backdrop">
          <div
            className="operator-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="operator-dialog-title"
            tabIndex={-1}
            ref={dialogRef}
            onKeyDown={(e) =>
              trapDialog(e, () => {
                setShowHistory(false);
                setInspect(false);
              })
            }
          >
            <div className="evidence-heading">
              <h2 id="operator-dialog-title">{showHistory ? 'Investigations' : 'Lab settings'}</h2>
              <button
                type="button"
                className="quiet-button"
                onClick={() => {
                  setShowHistory(false);
                  setInspect(false);
                }}
              >
                Close
              </button>
            </div>
            {showHistory ? (
              <>
                <p>{storageState}. This demo has no account or cross-device history.</p>
                <label htmlFor="history-search">Find an investigation</label>
                <input
                  id="history-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search titles and messages"
                />
                <div className="history-list">
                  {history.threads
                    .filter((t) =>
                      (t.title + ' ' + t.entries.map((e) => e.text).join(' '))
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((t) => (
                      <div className="history-item" key={t.id}>
                        <button
                          type="button"
                          aria-current={t.id === thread.id ? 'true' : undefined}
                          onClick={() => switchThread(t.id)}
                        >
                          <strong>{t.title}</strong>
                          <small>
                            {t.entries.length} messages · {new Date(t.updatedAt).toLocaleString()}
                          </small>
                        </button>
                        <label className="sr-only" htmlFor={`name-${t.id}`}>
                          Rename {t.title}
                        </label>
                        <input
                          id={`name-${t.id}`}
                          aria-label={`Rename ${t.title}`}
                          value={t.title}
                          maxLength={120}
                          onChange={(e) =>
                            updateThread(t.id, (t) => ({ ...t, title: e.target.value }))
                          }
                        />
                      </div>
                    ))}
                </div>
                <button type="button" className="secondary-button" onClick={() => switchThread()}>
                  New investigation
                </button>
              </>
            ) : (
              <div className="diagnostics">
                <p>
                  Experiment controls stay here so the main workspace can be evaluated as an
                  operator experience.
                </p>
                <label>
                  Generation
                  <select
                    id="generation-mode"
                    value={mode}
                    disabled={busy}
                    onChange={(e) => setMode(e.target.value as typeof mode)}
                  >
                    <option value="replay">Offline scripted replay</option>
                    <option value="live">Live model generation</option>
                  </select>
                </label>
                <p className="muted">
                  {health.data?.liveConfigured
                    ? 'A provider is configured.'
                    : 'No live provider configured. Scripted examples are available.'}
                </p>
                <label>
                  Renderer
                  <select
                    aria-label="Renderer"
                    value={renderer}
                    onChange={(e) => setRenderer(e.target.value as typeof renderer)}
                  >
                    <option value="a2ui">A2UI 0.9.1</option>
                    <option value="direct">Direct typed baseline</option>
                  </select>
                </label>
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
                <label htmlFor="draft">Local observation draft</label>
                <textarea
                  id="draft"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                />
                <button type="button" className="secondary-button" onClick={exportRun}>
                  Export experiment
                </button>
                {!saveAllowed && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      try {
                        const raw = localStorage.getItem(HISTORY_KEY);
                        if (raw) localStorage.setItem(`${HISTORY_KEY}-recovery-${Date.now()}`, raw);
                        setSaveAllowed(true);
                        setNotice(
                          'New history will be saved. The previous stored value was retained in a recovery key.',
                        );
                      } catch {
                        setNotice('Storage is unavailable. New work remains temporary.');
                      }
                    }}
                  >
                    Save new history
                  </button>
                )}
                <p className="muted">
                  First view: {timings.first ?? '—'} ms · Complete: {timings.complete ?? '—'} ms.
                  Observations, not framework benchmarks.
                </p>
                <details>
                  <summary>Received messages and actions ({events.length})</summary>
                  <pre data-testid="event-log">{JSON.stringify(events, null, 2)}</pre>
                </details>
              </div>
            )}
          </div>
        </div>
      )}
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
