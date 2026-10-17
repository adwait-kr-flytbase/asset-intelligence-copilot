import { Link, Outlet, useLocation } from '@tanstack/react-router';
import './live.css';
import { Icon } from './components/Icon';
import { Dialog, Overlays } from './components/WorkspaceUI';
import { useWorkspace, WorkspaceProvider } from './workspace';

const identityHelp =
  'Shared records; private conversations and saved views. Demo identity is not authentication.';
const roleLabels: Record<string, string> = {
  production_supervisor: 'Production supervisor',
  field_operator: 'Field operator',
  field_inspector: 'Field inspector',
  hse_officer: 'HSE officer',
};

function Navigation() {
  const w = useWorkspace();
  const path = useLocation({ select: (s) => s.pathname });
  const assistantPage = path === '/' || path.startsWith('/chats/');
  return (
    <>
      <Link to="/" className="brand" onClick={() => w.setMenu(false)}>
        <span className="brand-mark">
          <Icon name="brand" />
        </span>
        Fieldwork
        <span className="brand-dot" />
      </Link>
      <button type="button" className="new-chat" onClick={w.newChat}>
        <Icon name="plus" />
        New conversation<span aria-hidden="true">↵</span>
      </button>
      <nav aria-label="Workspace">
        <Link
          to="/"
          className={assistantPage ? 'nav-link active' : 'nav-link'}
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
          Saved views{w.views.length > 0 && <span>{w.views.length}</span>}
        </Link>
      </nav>
      <div className="history-label">Conversations</div>
      <div className="history-list">
        {w.conversations.map((t) => (
          <Link
            to="/chats/$conversationId"
            params={{ conversationId: t.id }}
            key={t.id}
            className={`history-item ${assistantPage && w.activeId === t.id ? 'current' : ''}`}
            onClick={() => w.setMenu(false)}
          >
            <span>{t.title}</span>
            {w.pending?.conversationId === t.id && (
              <span className="chat-working" role="status" aria-label="Investigation in progress">
                <i className="chat-spinner" aria-hidden="true" />
              </span>
            )}
          </Link>
        ))}
        {w.conversationsLoading && <p className="subtle small">Reading conversations…</p>}
        {w.hasMoreConversations && (
          <button type="button" className="quiet" onClick={w.moreConversations}>
            Load more conversations
          </button>
        )}
      </div>
      <footer className="sidebar-footer">
        <div className="workspace-avatar">N</div>
        <div>
          <strong>Fieldwork operations</strong>
          <span>Imported records</span>
        </div>
        <span className="online-dot" />
      </footer>
    </>
  );
}
function Shell() {
  const w = useWorkspace();
  const path = useLocation({ select: (s) => s.pathname });
  const assistantPage = path === '/' || path.startsWith('/chats/');
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Navigation />
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => w.setMenu(true)}
          >
            <Icon name="menu" />
          </button>
          <div className="breadcrumb">
            <span>{assistantPage ? 'Assistant' : 'Workspace'}</span>
            <Icon name="chevron" />
            <strong>
              {assistantPage ? w.activeTitle : path === '/assets' ? 'Assets' : 'Saved views'}
            </strong>
          </div>
          <label className="dataset-picker persona-picker" title={identityHelp}>
            <span>Demo identity</span>
            <select
              aria-label="Demo identity"
              aria-describedby="demo-identity-help"
              value={w.persona?.id || ''}
              disabled={w.sessionLoading}
              onChange={(e) => void w.selectPersona(e.target.value)}
            >
              <option value="" disabled>
                Select a demo person
              </option>
              {w.personas.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} · {roleLabels[person.role] || person.role.replaceAll('_', ' ')} ·{' '}
                  {person.team}
                </option>
              ))}
            </select>
          </label>
          <span id="demo-identity-help" className="sr-only">
            {identityHelp}
          </span>
        </header>
        {w.sessionError && (
          <div className="storage-notice" role="alert">
            {w.sessionError}
          </div>
        )}
        {w.notice && (
          <div className="storage-notice" role="status">
            {w.notice}
          </div>
        )}
        {w.sessionLoading ? (
          <p className="empty-state">Connecting to the workspace…</p>
        ) : w.persona ? (
          <Outlet />
        ) : (
          <div className="empty-state">
            <h2>Select a demo identity</h2>
            <p>
              Choose an imported person above to open their private conversations and saved views.
              Demo identity selection is not production authentication.
            </p>
          </div>
        )}
      </main>
      {w.menu && (
        <Dialog className="navigation-dialog" label="Navigation" onClose={() => w.setMenu(false)}>
          <button
            type="button"
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
