import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Answer } from '../components/Answer';
import { Icon } from '../components/Icon';
import { Composer, ResultView } from '../components/WorkspaceUI';
import type { Entry } from '../types';
import { useWorkspace } from '../workspace';

function AssistantEntry({ entry }: { entry: Entry }) {
  const w = useWorkspace();
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([target]) => {
        if (target?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '250px' },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const resultQuery = useQuery({
    queryKey: ['result', w.namespace, w.persona?.id, entry.resultId],
    queryFn: ({ signal }) => api.getResult(entry.resultId || '', signal),
    enabled: visible && !!entry.resultId && !entry.result && !!w.persona,
  });
  const result = entry.result || resultQuery.data;
  return (
    <article className="assistant-message" ref={ref}>
      <div className="assistant-identity">
        <Icon name="brand" />
        <span>Fieldwork</span>
        {entry.status === 'pending' && <span className="thinking">Investigating</span>}
      </div>
      {entry.status === 'pending' ? (
        <div className="pending-answer" role="status">
          <span className="reading-dot" />
          {w.progress || 'Reading records…'}
        </div>
      ) : (
        <>
          <Answer text={entry.text || result?.text || ''} failed={entry.status === 'failed'} />
          {entry.status === 'stopped' && <p className="subtle small">Investigation stopped.</p>}
          {result && <ResultView result={result} />}
          {result?.warnings.map((warning) => (
            <p className="read-status" key={warning}>
              {warning}
            </p>
          ))}
          {!!result?.evidence.length && (
            <button
              type="button"
              className="quiet answer-sources"
              onClick={() => w.setSources({ result })}
            >
              <Icon name="source" />
              Sources <span className="source-count">{result.evidence.length}</span>
              <Icon name="chevron" />
            </button>
          )}
          {resultQuery.isFetching && (
            <p role="status" className="subtle small">
              Reading saved result…
            </p>
          )}
          {resultQuery.isError && (
            <p role="alert" className="error">
              Result could not be loaded.{' '}
              <button type="button" className="quiet" onClick={() => void resultQuery.refetch()}>
                Retry
              </button>
            </p>
          )}
        </>
      )}
    </article>
  );
}
export function Conversation() {
  const w = useWorkspace();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!w.focus && w.pending) end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [w.pending, w.focus]);
  const prompts = w.context
    ? [
        `What do the latest inspections show for ${w.context}?`,
        `Show temperature history for ${w.context} over the last 13 weeks`,
        `Summarize repair costs for ${w.context} over the last year`,
      ]
    : [
        'Which wells need attention based on their latest inspections?',
        'Compare repair costs across wells over the last year',
        'Show recorded spills over the last year',
      ];
  return (
    <div className="conversation-page">
      <div className="conversation-scroll">
        <div className="conversation-content">
          {w.historyError && (
            <p className="error" role="alert">
              {w.historyError}
            </p>
          )}
          {w.historyLoading && <p className="empty-state">Reading conversation…</p>}
          {w.hasOlder && (
            <button
              type="button"
              className="secondary load-more"
              disabled={w.historyLoading}
              onClick={w.loadOlder}
            >
              Load older messages
            </button>
          )}
          {!w.historyLoading && !w.entries.length ? (
            <div className="welcome">
              <div className="welcome-mark">
                <Icon name="brand" />
              </div>
              <p className="eyebrow">Your field, in focus</p>
              <h1>
                What do you need
                <br />
                to understand?
              </h1>
              <p>
                Ask a question. Explore the data behind it.
                <br />
                Keep the next decision in your hands.
              </p>
              <div className="prompt-options">
                {prompts.map((text, index) => (
                  <button
                    type="button"
                    key={text}
                    disabled={!!w.pending}
                    onClick={() => w.send(text)}
                  >
                    <Icon name={index === 0 ? 'assets' : index === 1 ? 'trend' : 'source'} />
                    <span>{text}</span>
                    <Icon name="arrow" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages">
              {w.entries.map((entry) =>
                entry.role === 'user' ? (
                  <div className="user-message" key={entry.id}>
                    <p>{entry.text}</p>
                  </div>
                ) : (
                  <AssistantEntry key={entry.id} entry={entry} />
                ),
              )}
            </div>
          )}
          <div ref={end} />
        </div>
      </div>
      <Composer />
    </div>
  );
}
