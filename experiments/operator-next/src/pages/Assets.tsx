import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { assetsSchema } from '../contracts';
import { useWorkspace } from '../workspace';
import { Icon } from '../components/Icon';
export function Assets() {
  const w = useWorkspace();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const query = useQuery({
    queryKey: ['assets', w.dataset],
    queryFn: async () => {
      const r = await fetch(`/api/assets?dataset=${w.dataset}`);
      if (!r.ok) throw Error('Unable to read assets');
      return assetsSchema.parse(await r.json());
    },
  });
  const assets =
    query.data?.filter(
      (a) =>
        `${a.label} ${a.id} ${a.area} ${a.type}`.toLowerCase().includes(search.toLowerCase()) &&
        (status === 'all' || a.status === status),
    ) || [];
  return (
    <div className="workspace-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your workspace</p>
          <h1>Assets</h1>
          <p className="subtle">A place to find your bearings, then ask a better question.</p>
        </div>
        <button
          className="secondary"
          onClick={() => {
            w.setContext(null);
            w.send('Show all wells on a map');
          }}
        >
          <Icon name="map" />
          Explore field map
        </button>
      </div>
      <div className="directory-tools">
        <div className="search-field">
          <Icon name="search" />
          <input
            aria-label="Search assets"
            placeholder="Search wells, areas or types"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter assets by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="producing">Producing</option>
          <option value="below-threshold">Below threshold</option>
        </select>
        <span className="subtle small">{assets.length} assets</span>
      </div>
      {query.isPending ? (
        <p className="empty-state">Reading assets…</p>
      ) : query.isError ? (
        <div className="empty-state">
          <p>Assets could not be loaded.</p>
          <button className="secondary" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <div className="asset-table-wrap">
          <table className="asset-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Area</th>
                <th>Status</th>
                <th>Type</th>
                <th>Recorded spills</th>
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
                    <small>{a.label}</small>
                  </td>
                  <td>{a.area}</td>
                  <td>
                    <span
                      className={`asset-status ${a.status === 'producing' ? 'good' : 'warning'}`}
                    >
                      <i />
                      {a.status === 'producing' ? 'Producing' : 'Below threshold'}
                    </span>
                  </td>
                  <td>{a.type}</td>
                  <td>{a.spillBbl.toLocaleString()} bbl</td>
                  <td>
                    <button
                      className="quiet"
                      onClick={() => {
                        w.setContext(a.id);
                        void navigate({ to: '/' });
                        w.send(`Explain the status of ${a.id}`);
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
          {assets.length === 0 && <p className="empty-state">No assets match these filters.</p>}
        </div>
      )}
      <p className="page-footnote">
        {w.dataset === 'sample' ? 'Local sample dataset' : 'Synthetic fixture'} · Spill volumes
        cover all available records. Status is derived from inspection readings and type manuals,
        not a live sensor feed.
      </p>
    </div>
  );
}
