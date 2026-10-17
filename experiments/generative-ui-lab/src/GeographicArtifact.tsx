import L from 'leaflet';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Artifact } from './artifact-contract';
import 'leaflet/dist/leaflet.css';
import './GeographicArtifact.css';

type Geography = Extract<Artifact, { kind: 'geo' }>;
type GeoPoint = Geography['points'][number];
type LocatedPoint = GeoPoint & { lat: number; lon: number };
type Props = {
  artifact: Geography;
  onEvidence: (id: string) => void;
  onSelect: (id: string) => void;
  selected: string;
};

function hasLocation(point: GeoPoint): point is LocatedPoint {
  return (
    typeof point.lat === 'number' &&
    Number.isFinite(point.lat) &&
    Math.abs(point.lat) <= 90 &&
    typeof point.lon === 'number' &&
    Number.isFinite(point.lon) &&
    Math.abs(point.lon) <= 180
  );
}
const statusLabel = (point: GeoPoint) =>
  point.status === 'producing' ? 'Producing' : 'Below threshold';
const volume = (value: number) =>
  new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value);
const dateLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${value}T00:00:00Z`))
    : 'No event date recorded';

export function GeographicArtifact({ artifact, onEvidence, onSelect, selected }: Props) {
  const uid = useId();
  const mapNode = useRef<HTMLElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const fitted = useRef(false);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const focusDetail = useRef(false);
  const selectRef = useRef(onSelect);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [tileStatus, setTileStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [status, setStatus] = useState('all');
  const [spillOnly, setSpillOnly] = useState(false);
  const [localId, setLocalId] = useState<string | null>(null);
  selectRef.current = onSelect;

  const visible = useMemo(
    () =>
      artifact.points.filter(
        (point) =>
          (status === 'all' || point.status === status) && (!spillOnly || point.volumeBbl > 0),
      ),
    [artifact.points, status, spillOnly],
  );
  const located = useMemo(() => visible.filter(hasLocation), [visible]);
  const hasLocated = located.length > 0;
  const latestPoints = useRef(artifact.points);
  latestPoints.current = artifact.points;
  const local = artifact.points.find((point) => point.id === localId && point.wellId === selected);
  const active = local || artifact.points.find((point) => point.wellId === selected);
  const activeHidden = !!active && !visible.some((point) => point.id === active.id);
  const missing = visible.length - located.length;

  function choose(point: GeoPoint, moveFocus = false) {
    focusDetail.current = moveFocus;
    setLocalId(point.id);
    selectRef.current(point.wellId);
    if (moveFocus && active?.id === point.id) {
      detailHeading.current?.focus({ preventScroll: true });
      focusDetail.current = false;
    }
  }
  const chooseRef = useRef(choose);
  chooseRef.current = choose;

  const fitVisible = useCallback(() => {
    const map = mapRef.current;
    if (!map || !located.length) return;
    map.fitBounds(L.latLngBounds(located.map((point) => [point.lat, point.lon])), {
      padding: [35, 35],
      maxZoom: 13,
      animate: false,
    });
  }, [located]);

  // Keep a single map alive while selection, filters and evidence change.
  useEffect(() => {
    if (!mapNode.current) return;
    let map: L.Map | undefined;
    let observer: ResizeObserver | undefined;
    try {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      map = L.map(mapNode.current, {
        keyboard: true,
        scrollWheelZoom: false,
        zoomAnimation: !reduced,
        fadeAnimation: !reduced,
        markerZoomAnimation: !reduced,
        maxZoom: 19,
      });
      mapRef.current = map;
      map.attributionControl.setPrefix(
        '<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>',
      );
      L.control.scale({ imperial: false }).addTo(map);
      const instance = map;
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => instance.invalidateSize({ pan: false }));
        observer.observe(mapNode.current);
      }
      setMapReady(true);
    } catch {
      map?.remove();
      mapRef.current = null;
      setMapFailed(true);
      return;
    }
    return () => {
      observer?.disconnect();
      markers.current.clear();
      tileRef.current = null;
      mapRef.current = null;
      fitted.current = false;
      map?.remove();
    };
  }, []);

  // A tile request contains only z/x/y, never labels, source IDs or record data.
  // Browser HTTP caching is left intact. No tile prefetch or offline downloads.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !hasLocated || tileRef.current) return;
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      keepBuffer: 0,
      updateWhenIdle: true,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    });
    tileRef.current = tiles;
    let failed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const loading = () => {
      failed = false;
      setTileStatus('loading');
      clearTimeout(timeout);
      timeout = setTimeout(() => setTileStatus('unavailable'), 8000);
    };
    tiles.on('loading', loading);
    tiles.on('tileerror', () => {
      failed = true;
      setTileStatus('unavailable');
    });
    tiles.on('load', () => {
      clearTimeout(timeout);
      setTileStatus(failed ? 'unavailable' : 'ready');
    });
    loading();
    tiles.addTo(map);
    return () => {
      clearTimeout(timeout);
      tiles.off();
      tiles.remove();
      if (tileRef.current === tiles) tileRef.current = null;
    };
    // First valid geometry starts the basemap. Filters do not reload the layer.
  }, [mapReady, hasLocated]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    // Leaflet creates marker elements only after the first view is established.
    if (!fitted.current && located.length) {
      fitVisible();
      fitted.current = true;
    }
    const next = new Set(located.map((point) => point.id));
    for (const [id, marker] of markers.current) {
      if (!next.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    }
    for (const point of located) {
      let marker = markers.current.get(point.id);
      if (!marker) {
        marker = L.marker([point.lat, point.lon], {
          keyboard: true,
          riseOnHover: true,
          icon: L.divIcon({
            className: 'geo-marker',
            html: '<span class="geo-marker-core"></span>',
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
          alt: point.label,
        }).addTo(map);
        const pointId = point.id;
        marker.on('click', (event: L.LeafletMouseEvent) => {
          const record = latestPoints.current.find((item) => item.id === pointId);
          if (record) chooseRef.current(record, event.originalEvent instanceof KeyboardEvent);
        });
        const element = marker.getElement();
        element?.addEventListener('keydown', (event) => {
          if (event.key !== ' ' && event.key !== 'Enter') return;
          event.preventDefault();
          event.stopPropagation();
          const record = latestPoints.current.find((item) => item.id === pointId);
          if (record) chooseRef.current(record, true);
        });
        markers.current.set(point.id, marker);
      }
      marker.setLatLng([point.lat, point.lon]);
      const element = marker.getElement();
      const isActive = active?.id === point.id;
      element?.classList.toggle('geo-marker-below', point.status === 'below-threshold');
      element?.classList.toggle('geo-marker-spill', point.volumeBbl > 0);
      element?.classList.toggle('geo-marker-selected', isActive);
      element?.setAttribute(
        'aria-label',
        `${point.label}, ${statusLabel(point)}, ${volume(point.volumeBbl)} bbl recorded spill. Show details.`,
      );
      element?.setAttribute('aria-pressed', String(isActive));
      element?.setAttribute('aria-controls', `${uid}-details`);
      marker.setZIndexOffset(isActive ? 500 : 0);
      const label = document.createElement('span');
      label.textContent = point.label;
      if (marker.getTooltip()) marker.setTooltipContent(label);
      else marker.bindTooltip(label, { direction: 'top', offset: [0, -12] });
    }
    if (active && hasLocation(active) && next.has(active.id)) {
      map.panInside([active.lat, active.lon], { padding: [35, 35], animate: false });
    }
  }, [mapReady, located, active, uid, fitVisible]);

  useEffect(() => {
    if (focusDetail.current && active) {
      detailHeading.current?.focus({ preventScroll: true });
      focusDetail.current = false;
    }
  }, [active]);

  function resetFilters() {
    setStatus('all');
    setSpillOnly(false);
  }

  return (
    <section className="geo-artifact" aria-label={artifact.title}>
      <div className="geo-toolbar">
        <label className="geo-filter">
          Production status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="producing">Producing</option>
            <option value="below-threshold">Below threshold</option>
          </select>
        </label>
        <label className="geo-check">
          <input
            type="checkbox"
            checked={spillOnly}
            onChange={(event) => setSpillOnly(event.target.checked)}
          />
          Recorded spills only
        </label>
        <button
          type="button"
          className="geo-fit"
          onClick={fitVisible}
          disabled={!mapReady || !located.length}
        >
          Fit visible locations
        </button>
      </div>
      <p className="geo-scope">
        {artifact.scope.label} · {dateLabel(artifact.scope.from)}–{dateLabel(artifact.scope.to)} ·
        Synthetic locations and records
      </p>
      <div className="geo-layout">
        <div className="geo-map-area">
          <section
            ref={mapNode}
            className="geo-map"
            aria-label="Synthetic well map. Arrow keys pan; plus and minus zoom. Tab to location markers or use the location list."
          />
          {(!located.length || mapFailed) && (
            <p className="geo-map-empty">
              {mapFailed
                ? 'Interactive map unavailable. Use the location list and evidence below.'
                : visible.length
                  ? 'No coordinates for these records. Their evidence remains available in the list.'
                  : 'No locations match these filters.'}
            </p>
          )}
          {!!located.length && !mapFailed && tileStatus !== 'ready' && (
            <p className="geo-tile-notice">
              {tileStatus === 'loading'
                ? 'Loading basemap… Location records are available in the list.'
                : 'Basemap tiles unavailable. Location markers and the evidence list still work.'}
            </p>
          )}
        </div>
        <div className="geo-list-area">
          <div className="geo-list-heading">
            <h4>Location records</h4>
            <span aria-live="polite">
              {visible.length} of {artifact.points.length}
            </span>
          </div>
          {visible.length ? (
            <ul className="geo-location-list" aria-label="Synthetic location records">
              {visible.map((point) => (
                <li key={point.id}>
                  <button
                    type="button"
                    className={`geo-location${active?.id === point.id ? ' geo-location-selected' : ''}`}
                    aria-pressed={active?.id === point.id}
                    aria-controls={`${uid}-details`}
                    onClick={() => choose(point)}
                  >
                    <span className="geo-location-title">
                      <span
                        className={`geo-status-dot${point.status === 'below-threshold' ? ' geo-status-below' : ''}`}
                      />
                      <strong>{point.label}</strong>
                    </span>
                    <span className="geo-location-meta">
                      {statusLabel(point)} · {volume(point.volumeBbl)} bbl spill
                    </span>
                    {!hasLocation(point) && (
                      <span className="geo-missing">Coordinates unavailable</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="geo-list-empty">
              <p>No records match the filters.</p>
              <button type="button" className="geo-source" onClick={resetFilters}>
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="geo-legend">
        <span>
          <i className="geo-status-dot" />
          Producing
        </span>
        <span>
          <i className="geo-status-dot geo-status-below" />
          Below threshold
        </span>
        <span>
          <i className="geo-spill-key" />
          Recorded spill
        </span>
        {missing > 0 && <span>{missing} without coordinates</span>}
      </div>
      <div className="geo-details" id={`${uid}-details`}>
        {active ? (
          <>
            <div className="geo-detail-heading">
              <h4 ref={detailHeading} tabIndex={-1}>
                {active.label}
              </h4>
              <span>{statusLabel(active)}</span>
            </div>
            {activeHidden && (
              <p className="geo-hidden">
                This selection is hidden by the filters.{' '}
                <button type="button" className="geo-source" onClick={resetFilters}>
                  Clear filters to reveal
                </button>
              </p>
            )}
            <dl className="geo-facts">
              <div>
                <dt>Recorded spill</dt>
                <dd>
                  {volume(active.volumeBbl)} <span>bbl</span>
                </dd>
              </div>
              <div>
                <dt>Event date</dt>
                <dd>{dateLabel(active.eventDate)}</dd>
              </div>
              <div>
                <dt>Coordinates</dt>
                <dd>
                  {hasLocation(active)
                    ? `${active.lat.toFixed(5)}, ${active.lon.toFixed(5)}`
                    : 'Unavailable in source'}
                </dd>
              </div>
            </dl>
            <div className="geo-sources">
              <span>Snapshot evidence</span>
              {active.sourceIds.map((id, index) => (
                <button
                  type="button"
                  className="geo-source"
                  key={id}
                  aria-label={`Open source ${index + 1} for ${active.label}`}
                  onClick={() => onEvidence(id)}
                >
                  Source {index + 1}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="geo-detail-prompt">
            Select a marker or location record to inspect its event date, spill volume and snapshot
            evidence.
          </p>
        )}
      </div>
      <p className="geo-map-help">
        Pan by dragging; use the map controls to zoom. Basemap:{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          © OpenStreetMap contributors
        </a>
        .{' '}
        <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">
          Report a map issue
        </a>
        .
      </p>
    </section>
  );
}
