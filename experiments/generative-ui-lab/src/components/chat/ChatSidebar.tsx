import { useState } from 'react';
import { Icon } from '../ui/Icon';
import type { ChatProps } from './types';

export function ChatSidebar({
  operator = false,
  savedViews = [],
  savedError,
  onOpenSaved,
  history,
  thread,
  storageState,
  onThread,
}: Pick<
  ChatProps,
  | 'operator'
  | 'savedViews'
  | 'savedError'
  | 'onOpenSaved'
  | 'history'
  | 'thread'
  | 'storageState'
  | 'onThread'
>) {
  const [search, setSearch] = useState('');
  const threads = [...history.threads]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter((t) =>
      (t.title + ' ' + t.entries.map((e) => e.text).join(' '))
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  return (
    <aside className="past-chats" aria-label="Past chats">
      <button className="primary-button" type="button" onClick={() => onThread()}>
        {operator && <Icon name="plus" />}New chat
      </button>
      {operator && (
        <section className="saved-sidebar">
          <h2>Saved views</h2>
          <div className="saved-sidebar-list">
            {savedViews.map((definition) => (
              <button type="button" key={definition.id} onClick={() => onOpenSaved?.(definition)}>
                <strong>{definition.name}</strong>
                <small>{definition.plan.views.length} panels · On this device</small>
              </button>
            ))}
          </div>
          {!savedViews.length && (
            <p>Save a useful visual answer to reuse its layout with fresh data.</p>
          )}
          {savedError && <p role="alert">{savedError}</p>}
        </section>
      )}
      <label htmlFor="past-chat-search">{operator ? 'Recent chats' : 'Past chats'}</label>
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
      <p className="past-chats-storage">
        {storageState}.{' '}
        {operator ? 'Chats and views stay on this device.' : 'Same chats in both comparison pages.'}
      </p>
    </aside>
  );
}
