import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Artifact, Evidence } from '../contracts';

type Geo = Extract<Artifact, { kind: 'geo' }>;
type Props = {
  artifact: Geo;
  mode: 'inline' | 'focus';
  selected: string | null;
  onSelect: (id: string) => void;
  evidence: Evidence[];
  onEvidence: (id: string) => void;
};
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export function GeoView({ artifact, mode, selected, onSelect, evidence, onEvidence }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const overlayLayer = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [status, setStatus] = useState('all');
  const [spillsOnly, setSpillsOnly] = useState(false);
  const [layer, setLayer] = useState<'spill' | 'temperature' | 'none'>('spill');
  const showVolume = layer === 'spill';
  const temperatureValues = artifact.points.flatMap((point) =>
    point.temperatureDeltaC == null ? [] : [point.temperatureDeltaC],
  );
  const hasTemperature = temperatureValues.length > 0;
  const showTemperature = layer === 'temperature' && hasTemperature;
  const minTemperature = Math.min(...temperatureValues);
  const maxTemperature = Math.max(...temperatureValues);
  const [tileState, setTileState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const tileFailure = tileState === 'unavailable';
  const maxVolume = Math.max(0, ...artifact.points.map((point) => point.volumeBbl));
  const visible = useMemo(
    () =>
      artifact.points.filter(
        (point) =>
          (status === 'all' || point.status === status) && (!spillsOnly || point.volumeBbl > 0),
      ),
    [artifact, status, spillsOnly],
  );
  const located = visible.filter((point) => point.lat !== null && point.lon !== null);
  const missing = visible.filter((point) => point.lat === null || point.lon === null);
  const active = visible.find((point) => point.wellId === selected) ?? null;

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, {
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: true,
    }).setView([0, 0], 2);
    map.current = instance;
    let tileTimer: ReturnType<typeof setTimeout>;
    let tileError = false;
    let tileLoaded = false;
    const beginLoading = () => {
      clearTimeout(tileTimer);
      tileError = false;
      tileLoaded = false;
      setTileState('loading');
      tileTimer = setTimeout(() => setTileState('unavailable'), 5000);
    };
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    tiles.on('loading', beginLoading);
    tiles.on('tileload', () => {
      tileLoaded = true;
    });
    tiles.on('tileerror', () => {
      tileError = true;
      setTileState('unavailable');
    });
    tiles.on('load', () => {
      clearTimeout(tileTimer);
      setTileState(tileLoaded && !tileError ? 'ready' : 'unavailable');
    });
    beginLoading();
    tiles.addTo(instance);
    overlayLayer.current = L.layerGroup().addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize({ pan: false }));
    observer.observe(container.current);
    const frame = requestAnimationFrame(() => instance.invalidateSize({ pan: false }));
    return () => {
      clearTimeout(tileTimer);
      cancelAnimationFrame(frame);
      observer.disconnect();
      markers.current.clear();
      instance.remove();
      map.current = null;
      overlayLayer.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current.clear();
    const points = visible.filter((point) => point.lat !== null && point.lon !== null);
    for (const point of points) {
      const marker = L.marker([point.lat!, point.lon!], {
        keyboard: true,
        title: point.label,
        alt: point.label,
        icon: L.divIcon({
          className: 'geo-marker-wrap',
          html: '<span class="geo-marker-dot"></span>',
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).addTo(instance);
      const tooltip = document.createElement('span');
      tooltip.textContent = `${point.label} · ${point.status === 'producing' ? 'Producing' : 'Below threshold'} · ${number.format(point.volumeBbl)} bbl spill${point.temperatureDeltaC == null ? '' : ` · Temperature difference ${number.format(point.temperatureDeltaC)} °C`}`;
      marker.bindTooltip(tooltip, {
        direction: 'top',
        offset: [0, -12],
        className: 'geo-location-tooltip',
      });
      marker.on('click', () => onSelectRef.current(point.wellId));
      markers.current.set(point.id, marker);
    }
    if (points.length === 1) instance.setView([points[0].lat!, points[0].lon!], 12);
    else if (points.length > 1)
      instance.fitBounds(
        L.latLngBounds(points.map((point) => [point.lat!, point.lon!] as [number, number])),
        { padding: [42, 42], maxZoom: 12 },
      );
    // Leaflet can rebuild marker DOM while fitting. Bind keyboard behavior after the fit.
    for (const point of points) {
      const element = markers.current.get(point.id)?.getElement();
      if (!element) continue;
      element.setAttribute('role', 'button');
      element.setAttribute(
        'aria-label',
        `${point.label}, ${point.status === 'producing' ? 'producing' : 'below threshold'}, ${number.format(point.volumeBbl)} bbl spill. Select location`,
      );
      element.classList.toggle('geo-marker-warning', point.status === 'below-threshold');
      element.onfocus = () => markers.current.get(point.id)?.openTooltip();
      element.onblur = () => markers.current.get(point.id)?.closeTooltip();
      element.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectRef.current(point.wellId);
        }
      };
    }
  }, [visible]);

  useEffect(() => {
    for (const point of visible) {
      const element = markers.current.get(point.id)?.getElement();
      element?.classList.toggle('geo-marker-selected', point.wellId === selected);
      element?.setAttribute('aria-pressed', String(point.wellId === selected));
      if (
        point.wellId === selected &&
        point.lat !== null &&
        point.lon !== null &&
        map.current &&
        !map.current.getBounds().contains([point.lat, point.lon])
      )
        map.current.panTo([point.lat, point.lon]);
    }
  }, [selected, visible]);

  useEffect(() => {
    const overlay = overlayLayer.current;
    if (!overlay) return;
    overlay.clearLayers();
    if (!showVolume && !showTemperature) return;
    for (const point of visible) {
      if (point.lat === null || point.lon === null) continue;
      const volume = showVolume && point.volumeBbl > 0 && maxVolume > 0;
      const temperature = showTemperature && point.temperatureDeltaC != null;
      if (!volume && !temperature) continue;
      const tooltip = document.createElement('span');
      tooltip.textContent = volume
        ? `${point.label} · ${number.format(point.volumeBbl)} bbl recorded spill`
        : `${point.label} · Temperature difference ${number.format(point.temperatureDeltaC!)} °C${point.temperatureThresholdC == null ? '' : ` · Supplied threshold ${number.format(point.temperatureThresholdC)} °C`}`;
      const temperatureFraction =
        maxTemperature === minTemperature
          ? 0.5
          : (point.temperatureDeltaC! - minTemperature) / (maxTemperature - minTemperature);
      L.circleMarker([point.lat, point.lon], {
        radius: volume ? 28 * Math.sqrt(point.volumeBbl / maxVolume) : 22,
        color: '#4059D9',
        weight: 1.3,
        fillColor: '#4059D9',
        fillOpacity: volume ? 0.14 : 0.1 + temperatureFraction * 0.45,
      })
        .bindTooltip(tooltip, { className: 'geo-location-tooltip' })
        .on('click', () => onSelectRef.current(point.wellId))
        .addTo(overlay);
    }
  }, [visible, showVolume, showTemperature, maxVolume, minTemperature, maxTemperature]);

  function resetOverview() {
    const instance = map.current;
    if (!instance || !located.length) return;
    if (located.length === 1) instance.setView([located[0].lat!, located[0].lon!], 12);
    else
      instance.fitBounds(
        L.latLngBounds(located.map((point) => [point.lat!, point.lon!] as [number, number])),
        { padding: [42, 42], maxZoom: 12 },
      );
  }

  function sources(ids: string[]) {
    return (
      <span className="viz-sources">
        {ids
          .map((id) => evidence.find((source) => source.id === id))
          .filter((source): source is Evidence => !!source)
          .map((source) => (
            <button
              type="button"
              key={source.id}
              className="viz-source"
              onClick={() => onEvidence(source.id)}
              title={source.label}
            >
              {source.kind === 'calculation' ? 'Calculation' : 'Source'}{' '}
              <span aria-hidden="true">↗</span>
              <span className="viz-sr-only">: {source.label}</span>
            </button>
          ))}
      </span>
    );
  }
  const records = mode === 'focus' ? visible : missing;
  const fallbackRecords = tileFailure ? visible : missing;
  return (
    <div className={`geo-view geo-${mode}`}>
      <div className="viz-toolbar">
        <label className="viz-control">
          Status{' '}
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All locations</option>
            <option value="producing">Producing</option>
            <option value="below-threshold">Below threshold</option>
          </select>
        </label>
        <label className="viz-check">
          <input
            type="checkbox"
            checked={spillsOnly}
            onChange={(event) => setSpillsOnly(event.target.checked)}
          />{' '}
          Spills only
        </label>
        <label className="viz-control">
          Layer{' '}
          <select
            value={layer}
            onChange={(event) => setLayer(event.target.value as 'spill' | 'temperature' | 'none')}
          >
            <option value="spill">Spill volume</option>
            {hasTemperature && <option value="temperature">Temperature difference</option>}
            <option value="none">Status only</option>
          </select>
        </label>
        <button
          type="button"
          className="viz-toggle geo-overview"
          disabled={!located.length}
          onClick={resetOverview}
        >
          Reset view
        </button>
        <span className="viz-toolbar-note">
          {located.length} mapped
          {missing.length > 0 ? ` · ${missing.length} without coordinates` : ''}
        </span>
      </div>
      <div className="geo-layout">
        <div className="geo-canvas-column">
          <div className="geo-map-frame">
            <div className="geo-map" ref={container} aria-label="Interactive well locations map" />
            {tileState === 'loading' && (
              <div className="geo-tile-notice geo-loading" role="status">
                Loading basemap… location markers are ready.
              </div>
            )}
            {tileFailure && (
              <div className="geo-tile-notice" role="status">
                Basemap unavailable. Location markers and records remain available.
              </div>
            )}
            {!located.length && (
              <div className="geo-empty-map">
                {visible.length
                  ? 'No coordinates for these locations.'
                  : 'No locations match these filters.'}
              </div>
            )}
            <div className="geo-map-key" aria-label="Map legend">
              <span>
                <i /> Producing
              </span>
              <span>
                <i className="geo-key-warning" /> Below threshold
              </span>
              {showVolume && maxVolume > 0 && (
                <span className="geo-volume-legend">
                  <i /> Spill circles · 0–{number.format(maxVolume)} bbl
                </span>
              )}
              {showTemperature && (
                <span className="geo-temperature-legend">
                  <i /> Temperature Δ · {number.format(minTemperature)}–
                  {number.format(maxTemperature)} °C
                </span>
              )}
            </div>
          </div>
          {showVolume && maxVolume > 0 && (
            <p className="geo-overlay-note">
              Circle area represents recorded volume in bbl, not spill extent.
            </p>
          )}
          {showTemperature && (
            <p className="geo-overlay-note">
              Discrete wellhead − ambient readings (°C). Darker circles show higher differences; no
              interpolation between locations.
            </p>
          )}
          <div className="geo-selection" aria-live="polite">
            {active ? (
              <>
                <div className="geo-selection-name">
                  <span
                    className={`viz-status-dot ${active.status === 'producing' ? 'viz-good' : 'viz-warning'}`}
                  />
                  <strong>{active.label}</strong>
                  <span>{active.status === 'producing' ? 'Producing' : 'Below threshold'}</span>
                </div>
                <span className="geo-selection-value">
                  {number.format(active.volumeBbl)} <small>bbl spill</small>
                </span>
                {(active.temperatureDeltaC != null || active.temperatureThresholdC != null) && (
                  <span className="geo-selection-temperature">
                    ΔT{' '}
                    {active.temperatureDeltaC == null
                      ? 'unavailable'
                      : `${number.format(active.temperatureDeltaC)} °C`}
                    {active.temperatureThresholdC != null && (
                      <small>
                        {' '}
                        · supplied threshold {number.format(active.temperatureThresholdC)} °C
                      </small>
                    )}
                  </span>
                )}
                {active.inspectedAt && (
                  <span className="geo-observed">
                    Inspected{' '}
                    {new Date(active.inspectedAt).toLocaleString('en-US', {
                      timeZone: 'UTC',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}{' '}
                    UTC{active.inspector ? ` · ${active.inspector}` : ''}
                  </span>
                )}
                {sources(active.sourceIds)}
              </>
            ) : (
              <p>Select a location to see its record and sources.</p>
            )}
          </div>
        </div>
        {mode === 'focus' && (
          <div className="geo-records" aria-label="Location records">
            {records.length ? (
              records.map((point) => (
                <div
                  key={point.id}
                  className={`geo-record ${selected === point.wellId ? 'geo-record-selected' : ''}`}
                >
                  <button
                    type="button"
                    className="geo-record-select"
                    aria-pressed={selected === point.wellId}
                    onClick={() => onSelect(point.wellId)}
                  >
                    <strong>{point.label}</strong>
                    <span>
                      {point.status === 'producing' ? 'Producing' : 'Below threshold'} ·{' '}
                      {number.format(point.volumeBbl)} bbl spill
                    </span>
                    <small>
                      {point.lat === null
                        ? 'Coordinates unavailable'
                        : `${point.lat.toFixed(4)}, ${point.lon!.toFixed(4)}`}
                      {point.eventDate ? ` · ${point.eventDate}` : ''}
                    </small>
                  </button>
                  {sources(point.sourceIds)}
                </div>
              ))
            ) : (
              <p className="viz-empty">No matching records.</p>
            )}
          </div>
        )}
      </div>
      {mode === 'inline' && fallbackRecords.length > 0 && (
        <details className="geo-missing" open={tileFailure || undefined}>
          <summary>
            {tileFailure
              ? 'View location records'
              : `${missing.length} location${missing.length === 1 ? '' : 's'} without coordinates`}
          </summary>
          {fallbackRecords.map((point) => (
            <div className="geo-missing-row" key={point.id}>
              <button
                type="button"
                className="viz-text-button"
                onClick={() => onSelect(point.wellId)}
              >
                {point.label}
              </button>
              <span>{number.format(point.volumeBbl)} bbl spill</span>
              {sources(point.sourceIds)}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
