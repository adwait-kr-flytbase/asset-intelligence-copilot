import { useState } from 'react';
import { Icon } from '../components/Icon';
import { useWorkspace } from '../workspace';
export function Saved() {
  const w = useWorkspace();
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const views = w.views.filter((v) => v.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="workspace-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your workspace</p>
          <h1>Saved views</h1>
          <p className="subtle">Saved recipes read fresh records when you open them.</p>
        </div>
      </div>
      {!!w.views.length && (
        <div className="search-field saved-search">
          <Icon name="search" />
          <input
            aria-label="Search loaded saved views"
            placeholder="Find a loaded saved view"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {w.viewsLoading ? (
        <p className="empty-state">Reading saved views…</p>
      ) : views.length ? (
        <div className="saved-grid">
          {views.map((view) => (
            <article className="saved-card" key={view.id}>
              <div className="saved-icon">
                <Icon name="bookmark" />
              </div>
              <span className="eyebrow">Revision {view.revision}</span>
              <h2>{view.name}</h2>
              <footer>
                <span className="subtle small">
                  Saved {new Date(view.createdAt).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  className="quiet"
                  disabled={!!opening || !!w.pending}
                  onClick={async () => {
                    setError('');
                    setOpening(view.id);
                    try {
                      await w.runView(view, undefined, true);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Unable to open view');
                    } finally {
                      setOpening(null);
                    }
                  }}
                >
                  {opening === view.id ? 'Reading…' : 'Open view'}
                  <Icon name="arrow" />
                </button>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="saved-empty">
          <span className="empty-icon">
            <Icon name="bookmark" />
          </span>
          <h2>{search ? 'No matching loaded views' : 'Keep the views you come back to'}</h2>
          <p>
            {search
              ? 'Try another name or load more views.'
              : 'Save a supported result from a conversation to keep its recipe and filters.'}
          </p>
          <button type="button" className="secondary" onClick={w.newChat}>
            Start an investigation
          </button>
        </div>
      )}
      {w.hasMoreViews && (
        <button type="button" className="secondary load-more" onClick={w.moreViews}>
          Load more saved views
        </button>
      )}
    </div>
  );
}
