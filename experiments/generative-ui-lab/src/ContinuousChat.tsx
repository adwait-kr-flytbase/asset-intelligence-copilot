import { useEffect, useRef, useState } from 'react';
import { ChatSidebar } from './components/chat/ChatSidebar';
import { ConversationWelcome } from './components/chat/ConversationWelcome';
import { InlineResult } from './components/chat/InlineResult';
import { operatorViews } from './components/chat/suggestions';
import type { ChatProps } from './components/chat/types';
import './ContinuousChat.css';

export default function ContinuousChat(props: ChatProps) {
  const {
    operator = false,
    savedViews = [],
    savedError,
    onOpenSaved,
    onSaveView,
    workspace,
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
  return (
    <div className="continuous-workspace">
      <ChatSidebar
        operator={operator}
        savedViews={savedViews}
        savedError={savedError}
        onOpenSaved={onOpenSaved}
        history={history}
        thread={thread}
        storageState={storageState}
        onThread={onThread}
      />
      {workspace || (
        <main className="continuous-main" aria-label="Continuous conversation">
          <header className="continuous-heading">
            <h1>{thread.title}</h1>
            <p>
              {mode === 'replay'
                ? operator
                  ? 'Demo pipeline · synthetic records'
                  : 'Scripted synthetic demo'
                : 'Live model · synthetic records'}{' '}
              · {storageState}
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
                <ConversationWelcome operator={operator} busy={busy} run={run} />
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
                        <small>
                          {operator
                            ? 'Fresh answer · records and rules checked'
                            : 'Snapshot explanation · no model call'}
                        </small>
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
                        operator={operator}
                        onSaveView={onSaveView}
                        snapshot={visual}
                        active={thread.activeResultId === visual.runId}
                        initialArea={
                          !operator &&
                          (thread.activeResultId === visual.runId || entry.status === 'pending')
                            ? thread.area
                            : 'All areas'
                        }
                        initialSelected={
                          visual.result.rows.some((w) => w.id === thread.selected)
                            ? thread.selected
                            : visual.result.rows[0]?.id || thread.selected
                        }
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
            {operator && thread.entries.length > 0 && (
              <label className="operator-view-picker">
                Explore another view
                <select
                  aria-label="Explore another view"
                  value=""
                  disabled={busy}
                  onChange={(event) => {
                    const view = operatorViews.find((item) => item.label === event.target.value);
                    if (view) void run(view.prompt, 'auto', view.query);
                  }}
                >
                  <option value="">Choose a view…</option>
                  {operatorViews.map((view) => (
                    <option key={view.label} value={view.label}>
                      {view.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {composer}
          </div>
        </main>
      )}
    </div>
  );
}
