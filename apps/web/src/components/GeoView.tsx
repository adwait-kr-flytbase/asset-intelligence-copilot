import type { ApplicationPanel } from '@repo/contracts';
import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { type ApplicationPanelViewProps, cellText, PanelEvidence } from './ApplicationPanelView';

type MapFeature = NonNullable<ApplicationPanel['geo']>['features'][number];
const EMPTY_FEATURES: MapFeature[] = [];
const statusLabel = (status: string) =>
  status === 'below-threshold'
    ? 'Below threshold'
    : status === 'producing'
      ? 'Producing'
      : 'Unknown';
function popupContent(feature: MapFeature, onEvidence: (id: string) => void) {
  const content = document.createElement('div');
  content.className = 'asset-map-popup';
  const title = document.createElement('strong');
  title.textContent = feature.properties.assetId;
  content.append(title);
  if (feature.properties.label !== feature.properties.assetId) {
    const name = document.createElement('p');
    name.textContent = feature.properties.label;
    content.append(name);
  }
  const fields = document.createElement('dl');
  const properties = feature.properties;
  for (const [label, value] of [
    ...(properties.eventId
      ? [
          ['Event', properties.eventId ?? 'Not provided'],
          ['Observed (UTC)', properties.observedAt ?? 'Unknown'],
          ['Volume', properties.volumeBbl === null ? 'Unknown' : `${properties.volumeBbl} bbl`],
          ['Production status', statusLabel(properties.status)],
        ]
      : []),
    [
      'Location (lat, lon)',
      feature.geometry
        ? `${feature.geometry.coordinates[1]}, ${feature.geometry.coordinates[0]}`
        : 'Not recorded',
    ],
  ]) {
    const term = document.createElement('dt'),
      detail = document.createElement('dd');
    term.textContent = label ?? '';
    detail.textContent = value ?? '';
    fields.append(term, detail);
  }
  content.append(fields);
  const source = properties.evidenceIds[0];
  if (source) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `View evidence (${properties.evidenceIds.length})`;
    button.addEventListener('click', () => onEvidence(source));
    content.append(button);
  }
  return content;
}
export function GeoView({
  panel,
  result,
  mode,
  selected,
  onSelect,
  onEvidence,
}: ApplicationPanelViewProps) {
  const container = useRef<HTMLElement>(null);
  const map = useRef<L.Map | null>(null);
  const markerLayer = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, L.CircleMarker>());
  const onEvidenceRef = useRef(onEvidence);
  onEvidenceRef.current = onEvidence;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [onlyMatches, setOnlyMatches] = useState(false);
  const [labels, setLabels] = useState('hover');
  const [eventId, setEventId] = useState<string | null>(null);
  const [tiles, setTiles] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const features = panel.geo?.features ?? EMPTY_FEATURES;
  const searchTerm = search.trim().toLowerCase();
  const isEventMap =
    features.some((feature) => feature.properties.eventId !== null) ||
    panel.resultBinding?.metric === 'spills';
  const recordLabel = isEventMap ? 'events' : 'assets';
  const scoped = useMemo(
    () => features.filter((feature) => status === 'all' || feature.properties.status === status),
    [features, status],
  );
  const matches = useMemo(
    () =>
      new Set(
        scoped
          .filter((feature) =>
            `${feature.properties.label} ${feature.properties.assetId} ${feature.properties.eventId ?? ''}`
              .toLowerCase()
              .includes(searchTerm),
          )
          .map((feature) => feature.id),
      ),
    [scoped, searchTerm],
  );
  const visible = useMemo(
    () =>
      onlyMatches && searchTerm ? scoped.filter((feature) => matches.has(feature.id)) : scoped,
    [scoped, onlyMatches, searchTerm, matches],
  );
  const located = useMemo(() => visible.filter((feature) => feature.geometry !== null), [visible]);
  const missing = visible.filter((feature) => feature.geometry === null);
  const soleMatch =
    searchTerm && matches.size === 1
      ? visible.find((feature) => matches.has(feature.id))
      : undefined;
  const active =
    soleMatch ??
    visible.find((feature) => feature.id === eventId && feature.properties.assetId === selected) ??
    visible.find((feature) => feature.properties.assetId === selected);
  const highlight = useRef({ activeId: active?.id, searching: !!searchTerm, matches });
  highlight.current = { activeId: active?.id, searching: !!searchTerm, matches };
  function fitMap(onlySearchMatches = false) {
    const points = located.flatMap((feature): L.LatLngTuple[] =>
      feature.geometry && (!onlySearchMatches || matches.has(feature.id))
        ? [[feature.geometry.coordinates[1], feature.geometry.coordinates[0]]]
        : [],
    );
    if (points.length)
      map.current?.fitBounds(L.latLngBounds(points), {
        padding: [35, 35],
        maxZoom: 13,
        animate: false,
      });
  }

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { scrollWheelZoom: false }).setView([0, 0], 2);
    map.current = instance;
    markerLayer.current = L.layerGroup().addTo(instance);
    let loaded = false;
    const timer = setTimeout(() => {
      if (!loaded) setTiles('unavailable');
    }, 10000);
    const layer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    });
    layer.on('tileload', () => {
      loaded = true;
      clearTimeout(timer);
      setTiles('ready');
    });
    layer.on('tileerror', () => {
      if (!loaded) setTiles('unavailable');
    });
    layer.addTo(instance);
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);
    return () => {
      clearTimeout(timer);
      resize.disconnect();
      instance.remove();
      map.current = null;
      markerLayer.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current,
      layer = markerLayer.current;
    if (!instance || !layer) return;
    layer.clearLayers();
    markers.current.clear();
    const bounds: L.LatLngTuple[] = [];
    for (const feature of located) {
      if (!feature.geometry) continue;
      const [lon, lat] = feature.geometry.coordinates;
      const position: L.LatLngTuple = [lat, lon];
      bounds.push(position);
      const property = feature.properties;
      const marker = L.circleMarker(position, {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor:
          property.status === 'producing'
            ? '#39815f'
            : property.status === 'below-threshold'
              ? '#ba8431'
              : '#7b879b',
        fillOpacity: 0.9,
      });
      markers.current.set(feature.id, marker);
      const tooltip = document.createElement('span');
      tooltip.textContent = `${property.assetId} · ${property.label}${property.eventId ? ` · ${property.eventId}` : ''}`;
      marker.bindTooltip(tooltip, { direction: 'top', className: 'asset-map-tooltip' });
      marker.bindPopup(
        popupContent(feature, (id) => onEvidenceRef.current(id)),
        { className: 'asset-map-popup-container', maxWidth: 300, minWidth: 220 },
      );
      const choose = () => {
        setEventId(feature.id);
        onSelectRef.current(property.assetId);
        marker.openPopup();
      };
      const restyle = () => {
        const state = highlight.current,
          isActive = state.activeId === feature.id;
        marker.setRadius(isActive ? 10 : state.searching && state.matches.has(feature.id) ? 8 : 7);
        marker.setStyle({
          color:
            isActive || (state.searching && state.matches.has(feature.id)) ? '#4059d9' : '#ffffff',
          weight: isActive ? 3 : 2,
        });
      };
      marker.on('click', choose);
      marker.on('mouseover', () => {
        marker.setRadius(10);
        marker.setStyle({ color: '#293d9c', weight: 3 });
        marker.bringToFront();
      });
      marker.on('mouseout', restyle);
      marker.addTo(layer);
      const element = marker.getElement();
      if (element) {
        element.setAttribute('tabindex', '0');
        element.setAttribute('role', 'button');
        element.setAttribute(
          'aria-label',
          `Inspect ${property.assetId}, ${property.label}${property.eventId ? `, event ${property.eventId}` : ''}`,
        );
        element.setAttribute('data-map-feature', feature.id);
        element.addEventListener('keydown', (event) => {
          if (event instanceof KeyboardEvent && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            event.stopPropagation();
            choose();
          }
        });
        element.addEventListener('focus', () => marker.openTooltip());
        element.addEventListener('blur', () => marker.closeTooltip());
      }
    }
    if (bounds.length)
      instance.fitBounds(L.latLngBounds(bounds), {
        padding: [35, 35],
        maxZoom: 13,
        animate: false,
      });
  }, [located]);
  useEffect(() => {
    const points = located.flatMap((feature): L.LatLngTuple[] =>
      feature.geometry && (!searchTerm || matches.has(feature.id))
        ? [[feature.geometry.coordinates[1], feature.geometry.coordinates[0]]]
        : [],
    );
    if (points.length)
      map.current?.fitBounds(L.latLngBounds(points), {
        padding: [35, 35],
        maxZoom: 13,
        animate: false,
      });
  }, [located, searchTerm, matches]);
  useEffect(() => {
    for (const feature of located) {
      const id = feature.id;
      const marker = markers.current.get(id);
      if (!marker) continue;
      const isActive = active?.id === id;
      const matching = !!searchTerm && matches.has(id);
      marker.setRadius(isActive ? 10 : matching ? 8 : 7);
      marker.setStyle({
        color: isActive || matching ? '#4059d9' : '#ffffff',
        fillOpacity: searchTerm && !matching && !isActive ? 0.35 : 0.9,
        weight: isActive ? 3 : 2,
      });
      marker.getElement()?.setAttribute('aria-pressed', String(isActive));
      if (isActive) {
        marker.bringToFront();
        marker.openPopup();
      }
    }
  }, [active?.id, located, searchTerm, matches]);
  useEffect(() => {
    for (const feature of located) {
      const marker = markers.current.get(feature.id);
      if (!marker) continue;
      marker.unbindTooltip();
      const text = document.createElement('span');
      text.textContent =
        labels === 'asset-id'
          ? feature.properties.assetId
          : labels === 'name'
            ? feature.properties.label
            : labels === 'volume'
              ? `${feature.properties.assetId}: ${feature.properties.volumeBbl === null ? 'Unknown' : `${feature.properties.volumeBbl} bbl`}`
              : `${feature.properties.assetId} · ${feature.properties.label}${feature.properties.eventId ? ` · ${feature.properties.eventId}` : ''}`;
      marker.bindTooltip(text, {
        permanent: labels !== 'hover',
        direction: 'top',
        className: 'asset-map-tooltip',
      });
    }
  }, [labels, located]);

  return (
    <div className={`geo-view geo-${mode}`}>
      <div className="viz-toolbar">
        {isEventMap && (
          <label className="viz-control">
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="unknown">Unknown</option>
              <option value="producing">Producing</option>
              <option value="below-threshold">Below threshold</option>
            </select>
          </label>
        )}
        <label className="viz-control">
          Search this map
          <input
            type="search"
            aria-label="Search map assets or events"
            placeholder="Asset name, ID or event"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="viz-control">
          Labels
          <select
            aria-label="Map labels"
            value={labels}
            onChange={(event) => setLabels(event.target.value)}
          >
            <option value="hover">On hover</option>
            <option value="asset-id">Asset IDs</option>
            <option value="name">Asset names</option>
            {isEventMap && <option value="volume">Event volume</option>}
          </select>
        </label>
        <label className="viz-control map-match-toggle">
          <input
            type="checkbox"
            checked={onlyMatches}
            onChange={(event) => setOnlyMatches(event.target.checked)}
          />
          Only search matches
        </label>
        {search && (
          <button type="button" className="viz-source" onClick={() => setSearch('')}>
            Clear search
          </button>
        )}
        <button type="button" className="viz-source" onClick={() => fitMap(!!searchTerm)}>
          Fit map
        </button>
      </div>
      {panel.mapCoverage && (
        <p className="viz-chart-note">
          Returned: {panel.mapCoverage.returnedEvents} events · mapped:{' '}
          {panel.mapCoverage.mappedEvents} · missing locations: {panel.mapCoverage.unmappedEvents} ·{' '}
          {panel.mapCoverage.distinctMappedAssets} distinct mapped assets.
        </p>
      )}
      <p className="geo-overlay-note">
        {isEventMap
          ? 'Each marker represents a returned event at its recorded asset location. Overlapping events can be selected in the records below. Spill events do not establish production status.'
          : 'Each marker represents a returned asset at its recorded location. Hover or click a marker to identify it; search highlights matching assets on this map.'}
      </p>
      <div className="geo-map-frame">
        <section
          ref={container}
          className="geo-map"
          aria-label={isEventMap ? 'Returned event locations' : 'Returned asset locations'}
        />
        {tiles !== 'ready' && (
          <div className="geo-tile-notice" role="status">
            {tiles === 'loading'
              ? 'Loading basemap…'
              : 'Basemap unavailable. Coordinates and records remain available.'}
          </div>
        )}
        {located.length === 0 && (
          <div className="geo-empty-map">No recorded coordinates match these filters.</div>
        )}
        <div className="geo-map-key">
          {!isEventMap ? (
            <span>
              <i className="application-geo-unknown" />
              Asset location
            </span>
          ) : (
            <>
              <span>
                <i />
                Producing
              </span>
              <span>
                <i className="geo-key-warning" />
                Below threshold
              </span>
              <span>
                <i className="application-geo-unknown" />
                Unknown
              </span>
            </>
          )}
        </div>
      </div>
      <p className="viz-toolbar-note">
        {searchTerm
          ? `${matches.size} matching returned ${recordLabel} · highlighted in blue`
          : `${visible.length} returned ${recordLabel}`}{' '}
        · {located.length} mapped · {missing.length} missing coordinates
      </p>
      {active && (
        <div className="application-geo-detail">
          <strong>
            {active.properties.assetId} · {active.properties.label}
            {active.properties.eventId ? ` · ${active.properties.eventId}` : ''}
          </strong>
          {isEventMap && (
            <span>
              {cellText(active.properties.volumeBbl)}
              {active.properties.volumeBbl !== null ? ' bbl' : ''} ·{' '}
              {statusLabel(active.properties.status)}
            </span>
          )}
          <PanelEvidence
            ids={active.properties.evidenceIds}
            result={result}
            onEvidence={onEvidence}
          />
        </div>
      )}
      <div className="viz-table-scroll">
        <table className="viz-table">
          <thead>
            <tr>
              <th>Asset / event</th>
              {isEventMap && (
                <>
                  <th>Observed (UTC)</th>
                  <th>Volume (bbl)</th>
                  <th>Production status</th>
                </>
              )}
              <th>Longitude, latitude</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((feature) => (
              <tr
                key={feature.id}
                className={active?.id === feature.id ? 'application-selected-row' : undefined}
              >
                <td>
                  <button
                    type="button"
                    className="viz-text-button"
                    aria-pressed={active?.id === feature.id}
                    onClick={() => {
                      setEventId(feature.id);
                      onSelect(feature.properties.assetId);
                    }}
                  >
                    {feature.properties.label}
                  </button>
                  <span className="viz-record-subtitle">
                    {feature.properties.assetId}
                    {feature.properties.eventId ? ` · Event: ${feature.properties.eventId}` : ''}
                  </span>
                </td>
                {isEventMap && (
                  <>
                    <td>{cellText(feature.properties.observedAt)}</td>
                    <td>{cellText(feature.properties.volumeBbl)}</td>
                    <td>{statusLabel(feature.properties.status)}</td>
                  </>
                )}
                <td>
                  {feature.geometry
                    ? feature.geometry.coordinates.join(', ')
                    : 'Missing coordinates'}
                </td>
                <td>
                  <PanelEvidence
                    ids={feature.properties.evidenceIds}
                    result={result}
                    onEvidence={onEvidence}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible.length === 0 && (
        <p className="viz-chart-note">No returned records match these filters.</p>
      )}
    </div>
  );
}
