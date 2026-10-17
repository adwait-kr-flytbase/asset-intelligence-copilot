import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import type { History, Thread } from './history';
import type { Query, Snapshot } from './protocol';
import { A2UIRenderer, DirectRenderer, RendererBoundary } from './renderers';
import { Investigation } from './widgets';
import './ContinuousChat.css';

type Run = (text: string, representation?: 'auto' | 'table', query?: Query) => Promise<void>;
interface Props {
  history: History;
  thread: Thread;
  preview: Snapshot | null;
  busy: boolean;
  progress: string;
  storageState: string;
  mode: 'replay' | 'live';
  renderer: 'a2ui' | 'direct';
  composer: ReactNode;
  logRef: RefObject<HTMLDivElement | null>;
  atBottom: RefObject<boolean>;
  run: Run;
  onThread: (id?: string) => void;
  onContext: (runId: string, area: string, selected: string) => void;
  onEvidence: (runId: string, sourceId: string) => void;
  onError: (message: string) => void;
}
const starters: { query: Query; text: string }[] = [
  { query: 'attention', text: 'Which wells need attention?' },
  { query: 'downtime', text: 'Where are we losing production time?' },
  { query: 'spills', text: 'Show spills and conflicting records' },
];

function InlineResult({
  snapshot,
  active,
  initialArea,
  initialSelected,
  busy,
  renderer,
  onContext,
  onEvidence,
  onError,
}: {
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
        <span>{ready ? 'Complete' : 'Building views…'}</span>
      </header>
      <div className="inline-result-controls">
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
        Area filters these views; the answer covers all six wells. Select a well for its trend and
        follow-up questions.
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
    </section>
  );
}

export default function ContinuousChat(props: Props) {
  const {
    history,
    thread,
    preview,
    busy,
    progress,
    storageState,
    mode,
    renderer,
    composer,
    logRef,
    atBottom,
    run,
    onThread,
    onContext,
    onEvidence,
    onError,
  } = props;
  const [search, setSearch] = useState('');
  const [newReply, setNewReply] = useState(false);
  const lastTurn = useRef('');
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const last = thread.entries.at(-1);
    if (!last) {
      lastTurn.current = '';
      setNewReply(false);
      return;
    }
    if (atBottom.current) {
      const reply = log.querySelector<HTMLElement>('.continuous-message:last-child');
      if (reply)
        log.scrollTop += reply.getBoundingClientRect().top - log.getBoundingClientRect().top - 24;
      setNewReply(false);
    } else if (last.id !== lastTurn.current || last.status === 'complete') setNewReply(true);
    lastTurn.current = last.id;
  }, [thread.entries, logRef, atBottom]);
  function jumpToReply() {
    const log = logRef.current,
      reply = log?.querySelector<HTMLElement>('.continuous-message:last-child');
    if (log && reply)
      log.scrollTop += reply.getBoundingClientRect().top - log.getBoundingClientRect().top - 24;
    setNewReply(false);
  }
  const threads = [...history.threads]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter((t) =>
      (t.title + ' ' + t.entries.map((e) => e.text).join(' '))
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  return (
    <div className="continuous-workspace">
      <aside className="past-chats" aria-label="Past chats">
        <button className="primary-button" type="button" onClick={() => onThread()}>
          New chat
        </button>
        <label htmlFor="past-chat-search">Past chats</label>
        <input
          id="past-chat-search"
          placeholder="Search chats"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <nav aria-label="Saved conversations">
          {threads.map((t) => (
            <button
              type="button"
              key={t.id}
              aria-current={thread.id === t.id ? 'page' : undefined}
              onClick={() => onThread(t.id)}
            >
              <strong>{t.title}</strong>
              <small>
                {new Date(t.updatedAt).toLocaleDateString()} · {t.entries.length} messages
              </small>
            </button>
          ))}
          {!threads.length && <p>No chats match that search.</p>}
        </nav>
        <p className="past-chats-storage">{storageState}. Same chats in both comparison pages.</p>
      </aside>
      <main className="continuous-main" aria-label="Continuous conversation">
        <header className="continuous-heading">
          <h1>{thread.title}</h1>
          <p>
            {mode === 'replay' ? 'Scripted synthetic demo' : 'Live model · synthetic records'} ·{' '}
            {storageState}
          </p>
        </header>
        <div
          className="continuous-transcript"
          role="log"
          aria-label="Messages"
          aria-live="polite"
          ref={logRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
            if (atBottom.current) setNewReply(false);
          }}
        >
          <div className="continuous-thread">
            {!thread.entries.length && (
              <div className="continuous-welcome">
                <span>FIELDWORK ASSISTANT</span>
                <h2>What do you need to know?</h2>
                <p>
                  Ask a question. Explore the answer and its data right here in the conversation.
                </p>
                <div className="continuous-starters">
                  {starters.map((s) => (
                    <button
                      type="button"
                      key={s.query}
                      disabled={busy}
                      onClick={() => void run(s.text, 'auto', s.query)}
                    >
                      {s.text}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {thread.entries.map((entry) => {
              const visual = entry.resultId
                ? thread.results[entry.resultId]
                : entry.status === 'pending' && preview?.runId === entry.runId
                  ? preview
                  : null;
              return (
                <article
                  key={entry.id}
                  className={`continuous-message ${entry.role}`}
                  data-entry-id={entry.id}
                  data-status={entry.status}
                >
                  <strong className="message-author">
                    {entry.role === 'user' ? 'You' : 'Fieldwork'}
                  </strong>
                  <p className="message-body">
                    {entry.status === 'pending' ? progress : entry.text}
                  </p>
                  {entry.contextResultId && (
                    <div className="inline-evidence">
                      <small>Snapshot explanation · no model call</small>
                      {entry.sourceIds?.map((id) => (
                        <button
                          type="button"
                          className="text-button"
                          key={id}
                          onClick={() => onEvidence(entry.contextResultId!, id)}
                        >
                          Source:{' '}
                          {
                            thread.results[entry.contextResultId!].result.sources.find(
                              (s) => s.id === id,
                            )?.label
                          }
                        </button>
                      ))}
                    </div>
                  )}
                  {visual && (
                    <InlineResult
                      key={visual.runId}
                      snapshot={visual}
                      active={thread.activeResultId === visual.runId}
                      initialArea={
                        thread.activeResultId === visual.runId || entry.status === 'pending'
                          ? thread.area
                          : 'All areas'
                      }
                      initialSelected={thread.selected}
                      busy={busy}
                      renderer={renderer}
                      onContext={onContext}
                      onEvidence={onEvidence}
                      onError={onError}
                    />
                  )}
                  {(entry.status === 'failed' || entry.status === 'cancelled') && (
                    <small className="attempt-status">
                      {entry.status === 'failed' ? 'Update failed' : 'Update stopped'} · Earlier
                      answers are still above.
                    </small>
                  )}
                  {entry.role === 'assistant' &&
                    entry.status === 'complete' &&
                    entry.id === thread.entries.at(-1)?.id &&
                    thread.activeResultId && (
                      <div className="continuous-followups">
                        <span>Continue with {thread.selected}</span>
                        <div>
                          {[
                            'Why this status?',
                            'How is downtime calculated?',
                            'Any conflicting records?',
                          ].map((text) => (
                            <button
                              type="button"
                              key={text}
                              disabled={busy}
                              onClick={() => void run(text)}
                            >
                              {text}
                            </button>
                          ))}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run('Show the same investigation as a table.', 'table')
                            }
                          >
                            Show as table
                          </button>
                        </div>
                      </div>
                    )}
                </article>
              );
            })}
          </div>
        </div>
        {newReply && (
          <button type="button" className="continuous-jump" onClick={jumpToReply}>
            Go to latest reply ↓
          </button>
        )}
        <div className="continuous-composer">
          <p className="continuous-context">
            {thread.activeResultId
              ? `Asking about: ${thread.results[thread.activeResultId].result.title} · ${thread.area} · ${thread.selected}`
              : 'Synthetic records only · No live sensor connection'}
          </p>
          {composer}
        </div>
      </main>
    </div>
  );
}
