import { useState } from 'react';
import { useWorkspace } from '../workspace';
import { titles } from '../components/WorkspaceUI';
import { Icon } from '../components/Icon';
export function Saved() {
  const w = useWorkspace();
  const [search, setSearch] = useState('');
  const views = w.store.views.filter((v) => v.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="workspace-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your workspace</p>
          <h1>Saved views</h1>
          <p className="subtle">
            The investigations you chose to keep. Fresh records every time you open one.
          </p>
        </div>
      </div>
      {w.store.views.length > 0 && (
        <div className="search-field saved-search">
          <Icon name="search" />
          <input
            aria-label="Search saved views"
            placeholder="Find a saved view"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}
      {views.length ? (
        <div className="saved-grid">
          {views.map((view) => (
            <article className="saved-card" key={view.id}>
              <div className="saved-icon">
                <Icon
                  name={view.kind === 'geo' ? 'map' : view.kind === 'series' ? 'trend' : 'bookmark'}
                />
              </div>
              <span className="eyebrow">{titles[view.kind]}</span>
              <h2>{view.name}</h2>
              <p className="subtle small">
                {view.parameters.wellId === 'all' ? 'All wells' : view.parameters.wellId}
                {view.parameters.metric ? ` · ${view.parameters.metric.replaceAll('-', ' ')}` : ''}
              </p>
              <footer>
                <span className="subtle small">
                  Saved{' '}
                  {new Date(view.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <button
                  className="quiet"
                  disabled={!!w.pending}
                  onClick={() => void w.runView(view)}
                >
                  Open view
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
          <h2>{search ? 'No matching views' : 'Keep the views you come back to'}</h2>
          <p>
            {search
              ? 'Try another name.'
              : 'Save a map, chart or review from any conversation. Your saved view keeps its filters, then reads fresh records when you open it.'}
          </p>
          {!search && (
            <button className="secondary" onClick={w.newChat}>
              <Icon name="plus" />
              Start an investigation
            </button>
          )}
        </div>
      )}
    </div>
  );
}
