import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { WorkspaceProvider, useWorkspace } from './workspace';
import { Dialog, Overlays } from './components/WorkspaceUI';
import { Icon } from './components/Icon';
function Navigation() {
  const w = useWorkspace();
  const path = useLocation({ select: (s) => s.pathname });
  return (
    <>
      <Link to="/" className="brand" onClick={() => w.setMenu(false)}>
        <span className="brand-mark">
          <Icon name="brand" />
        </span>
        Fieldwork
        <span className="brand-dot" />
      </Link>
      <button className="new-chat" onClick={w.newChat}>
        <Icon name="plus" />
        New conversation<span aria-hidden="true">↵</span>
      </button>
      <nav aria-label="Workspace">
        <Link
          to="/"
          className={path === '/' ? 'nav-link active' : 'nav-link'}
          onClick={() => w.setMenu(false)}
        >
          <Icon name="chat" />
          Assistant
        </Link>
        <Link
          to="/assets"
          className={path === '/assets' ? 'nav-link active' : 'nav-link'}
          onClick={() => w.setMenu(false)}
        >
          <Icon name="assets" />
          Assets
        </Link>
        <Link
          to="/saved"
          className={path === '/saved' ? 'nav-link active' : 'nav-link'}
          onClick={() => w.setMenu(false)}
        >
          <Icon name="bookmark" />
          Saved views{w.store.views.length > 0 && <span>{w.store.views.length}</span>}
        </Link>
      </nav>
      <div className="history-label">Conversations</div>
      <div className="history-list">
        {w.store.threads.map((t) => (
          <button
            key={t.id}
            className={`history-item ${path === '/' && w.store.activeId === t.id ? 'current' : ''}`}
            onClick={() => w.activate(t.id)}
          >
            <span>{t.title}</span>
            {t.sample && <small>Example</small>}
          </button>
        ))}
      </div>
      <footer className="sidebar-footer">
        <div className="workspace-avatar">N</div>
        <div>
          <strong>Northfield operations</strong>
          <span>Demo workspace</span>
        </div>
        <span className="online-dot" />
      </footer>
    </>
  );
}
function Shell() {
  const w = useWorkspace();
  const path = useLocation({ select: (s) => s.pathname });
  const thread = w.store.threads.find((t) => t.id === w.store.activeId)!;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Navigation />
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => w.setMenu(true)}
          >
            <Icon name="menu" />
          </button>
          <div className="breadcrumb">
            <span>
              {path === '/' ? 'Assistant' : path === '/assets' ? 'Workspace' : 'Workspace'}
            </span>
            <Icon name="chevron" />
            <strong>
              {path === '/' ? thread.title : path === '/assets' ? 'Assets' : 'Saved views'}
            </strong>
          </div>
          <label className="dataset-picker">
            <span className="sr-only">Dataset</span>
            <select
              aria-label="Dataset"
              value={w.dataset}
              onChange={(e) => w.changeDataset(e.target.value as 'fixture' | 'sample')}
            >
              <option value="fixture">Synthetic demo</option>
              <option value="sample">Sample dataset</option>
            </select>
          </label>
        </header>
        {w.notice && (
          <div className="storage-notice" role="status">
            {w.notice}
          </div>
        )}
        <Outlet />
      </main>
      {w.menu && (
        <Dialog className="navigation-dialog" label="Navigation" onClose={() => w.setMenu(false)}>
          <button
            className="icon-button nav-close"
            aria-label="Close navigation"
            onClick={() => w.setMenu(false)}
          >
            <Icon name="close" />
          </button>
          <Navigation />
        </Dialog>
      )}
      <Overlays />
    </div>
  );
}
export default function App() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}
