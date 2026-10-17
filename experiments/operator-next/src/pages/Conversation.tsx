import { Answer } from '../components/Answer';
import { useEffect, useRef } from 'react';
import { useWorkspace } from '../workspace';
import { Composer, ResultCard } from '../components/WorkspaceUI';
import { Icon } from '../components/Icon';
const prompts = [
  ['map', 'Which wells need attention, and where are they?'],
  ['trend', 'Show temperature history for W04'],
  ['shield', 'Which regulatory obligations need review?'],
] as const;
export function Conversation() {
  const w = useWorkspace();
  const thread = w.store.threads.find((t) => t.id === w.store.activeId)!;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!w.focus) end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread.entries.length, w.pending, w.focus]);
  return (
    <div className="conversation-page">
      <div className="conversation-scroll">
        <div className="conversation-content">
          {thread.sample && (
            <div className="example-label">
              <span className="tag">Example investigation</span>
              <span>Explore six synthetic wells. Nothing here changes operational records.</span>
            </div>
          )}
          {thread.entries.length === 0 ? (
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
                {prompts.map(([icon, text]) => (
                  <button
                    key={text}
                    onClick={() =>
                      w.send(w.dataset === 'sample' ? text.replaceAll('W04', 'WELL-0001') : text)
                    }
                  >
                    <Icon name={icon} />
                    <span>
                      {w.dataset === 'sample' ? text.replaceAll('W04', 'WELL-0001') : text}
                    </span>
                    <Icon name="arrow" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages">
              {thread.entries.map((entry) =>
                entry.role === 'user' ? (
                  <div className="user-message" key={entry.id}>
                    <p>{entry.text}</p>
                  </div>
                ) : (
                  <article className="assistant-message" key={entry.id}>
                    <div className="assistant-identity">
                      <Icon name="brand" />
                      <span>Fieldwork</span>
                      {entry.status === 'pending' && (
                        <span className="thinking">Investigating</span>
                      )}
                    </div>
                    {entry.status === 'pending' ? (
                      <div className="pending-answer" role="status">
                        <span className="reading-dot" />
                        {w.progress}
                      </div>
                    ) : (
                      <>
                        <Answer text={entry.text} failed={entry.status === 'failed'} />
                        {entry.response?.visuals.map((visual) => (
                          <ResultCard
                            key={visual.resultId}
                            visual={visual}
                            response={entry.response!}
                          />
                        ))}
                        {entry.response?.citations && (
                          <button
                            className="quiet answer-sources"
                            onClick={() =>
                              w.setSources({ evidence: entry.response!.citations!.evidence })
                            }
                          >
                            <Icon name="source" />
                            {entry.response.citations.evidence.length} source records
                          </button>
                        )}
                      </>
                    )}
                  </article>
                ),
              )}
            </div>
          )}
          <div ref={end} />
          {!w.pending && thread.entries.length > 0 && (
            <div className="followups">
              <button
                onClick={() =>
                  w.send(
                    w.dataset === 'sample'
                      ? 'Show temperature history for WELL-0001 for the last 13 weeks'
                      : 'Show temperature history for W04',
                  )
                }
              >
                Explore temperature history
                <Icon name="arrow" />
              </button>
              <button onClick={() => w.send('Compare repair costs across all wells')}>
                Compare repair costs
                <Icon name="arrow" />
              </button>
              <button onClick={() => w.send('What observations have operators reported?')}>
                Read field observations
                <Icon name="arrow" />
              </button>
            </div>
          )}
        </div>
      </div>
      <Composer />
    </div>
  );
}
