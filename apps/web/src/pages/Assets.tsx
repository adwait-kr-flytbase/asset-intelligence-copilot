import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { useWorkspace } from '../workspace';
export function Assets() {
  const w = useWorkspace();
  const [search, setSearch] = useState('');
  const [area, setArea] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const tableRef = useRef<HTMLElement>(null);
  const cursor = cursors.at(-1);
  const searching = search.trim() !== appliedSearch;
  useEffect(() => {
    if (search.trim() === appliedSearch) return;
    const timeout = setTimeout(() => {
      setAppliedSearch(search.trim());
      setCursors([undefined]);
    }, 250);
    return () => clearTimeout(timeout);
  }, [search, appliedSearch]);
  const query = useQuery({
    queryKey: ['assets', w.namespace, w.persona?.id, area, appliedSearch, cursor],
    queryFn: ({ signal }) =>
      api.assets(
        { after: cursor, limit: 25, area: area || undefined, search: appliedSearch || undefined },
        signal,
      ),
    enabled: !!w.persona && !searching,
  });
  useEffect(() => {
    if (query.data && tableRef.current) tableRef.current.scrollTop = 0;
  }, [query.data]);
  const areas = useInfiniteQuery({
    queryKey: ['areas', w.namespace, w.persona?.id],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => api.areas({ after: pageParam, limit: 100 }, signal),
    getNextPageParam: (page) => page.nextCursor || undefined,
    enabled: !!w.persona,
  });
  const assets = query.data?.items ?? [];
  const busy = searching || query.isPending;
  return (
    <div className="workspace-page assets-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your workspace</p>
          <h1>Assets</h1>
          <p className="subtle">Find an imported asset and explore its records.</p>
        </div>
      </div>
      <div className="directory-tools">
        <div className="search-field">
          <Icon name="search" />
          <input
            aria-label="Search assets"
            placeholder="Search by asset, area or well type"
            value={search}
            maxLength={200}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter assets by area"
          value={area}
          onChange={(e) => {
            setArea(e.target.value);
            setCursors([undefined]);
          }}
        >
          <option value="">All areas</option>
          {areas.data?.pages
            .flatMap((p) => p.items)
            .map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
        </select>
        {areas.hasNextPage && (
          <button type="button" className="quiet small" onClick={() => void areas.fetchNextPage()}>
            More areas
          </button>
        )}
        <span className="subtle small">
          {busy
            ? 'Searching…'
            : `${assets.length} ${assets.length === 1 ? 'asset' : 'assets'} on this page`}
        </span>
      </div>
      {areas.isError && (
        <p role="alert" className="error">
          Area filters could not be loaded.{' '}
          <button type="button" className="quiet" onClick={() => void areas.refetch()}>
            Retry
          </button>
        </p>
      )}
      <div className="asset-results" aria-busy={busy}>
        {busy ? (
          <p className="empty-state">Reading assets…</p>
        ) : query.isError ? (
          <div className="empty-state">
            <p role="alert">{query.error.message}</p>
            <button type="button" className="secondary" onClick={() => void query.refetch()}>
              Try again
            </button>
          </div>
        ) : (
          <section
            className="asset-table-wrap"
            ref={tableRef}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable table supports keyboard scrolling.
            tabIndex={0}
            aria-label="Asset table"
          >
            <table className="asset-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Area</th>
                  <th>Well type</th>
                  <th>Recorded location</th>
                  <th>
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="asset-symbol">
                        <Icon name="assets" />
                      </span>
                      <strong>{a.id}</strong>
                      <small>{a.name}</small>
                    </td>
                    <td>{a.area || 'Unknown'}</td>
                    <td>{a.wellType || 'Unknown'}</td>
                    <td>
                      {a.geometry
                        ? `${a.geometry.coordinates[1]}, ${a.geometry.coordinates[0]}`
                        : 'Not recorded'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="quiet"
                        onClick={() => {
                          w.newChat();
                          w.setContext(a.id);
                        }}
                      >
                        Ask about asset
                        <Icon name="arrow" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!assets.length && <p className="empty-state">No assets match these filters.</p>}
          </section>
        )}
        <nav className="asset-pagination" aria-label="Asset pagination">
          <span className="subtle small" aria-live="polite">
            Page {cursors.length}
            {!busy && !query.isError && !query.data?.nextCursor ? ' · Last page' : ''}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={busy || cursors.length === 1}
            onClick={() => setCursors((current) => current.slice(0, -1))}
          >
            Previous
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || query.isError || !query.data?.nextCursor}
            onClick={() => {
              const next = query.data?.nextCursor;
              if (next) setCursors((current) => [...current, next]);
            }}
          >
            Next
          </button>
        </nav>
      </div>
    </div>
  );
}
