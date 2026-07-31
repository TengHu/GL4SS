/**
 * PLACE DIAL — the map, demoted, and now a globe as well.
 *
 * In v1 the map was the primary surface and the generated view was a strip of
 * panels. That's backwards: the view is the product. So the map collapses to a
 * small puck in the corner and expands only when you're actually choosing
 * somewhere — now to either a panel or the full screen, because picking a precise
 * point out of a 420×250 box is genuinely hard.
 *
 * Zoom is one continuous range across two renderers. Past the handover point the
 * flat map stands down and a real sphere takes over; scroll back in and the sphere
 * hands back. Both draw the same satellite imagery, so it reads as one world seen
 * from two distances rather than as two separate screens.
 *
 * This component also fixes the v1 bug where picking a destination updated state
 * but never moved the map — the marker ended up ~2000px off-screen. The cause was
 * that nothing ever told Leaflet to move; `setView` was only called at init. A
 * dedicated effect flies the map whenever `coordinates` changes from outside,
 * guarded by `internalMove` so the user's own panning and clicking doesn't fight
 * the camera.
 */

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Coordinates } from '../../types';
import { reverseGeocode, searchPlaces } from '../../lib/geocode';
import type { GeocodeResult } from '../../lib/geocode';
import { createPortal } from 'react-dom';
import { GLOBE_ATTRIBUTION } from '../lib/globeTexture';

const GlobeView = lazy(() =>
  import('./GlobeView').then((m) => ({ default: m.GlobeView })),
);

interface Props {
  coordinates: Coordinates;
  location: string;
  onPick: (coordinates: Coordinates, location: string) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /**
   * HOME MODE — the map is the empty state, not a panel you opened.
   *
   * With no frame to show, the viewport used to be a blank gradient and the
   * globe sat three interactions deep: dismiss the key modal, open the place
   * puck, zoom out past the globe threshold. The first thing a new visitor saw
   * was a request for an API key over an empty screen. Now the map fills the
   * stage and the dial sits under it, so the home screen states the proposition:
   * point at Earth, pick a year, pull the lever.
   *
   * It draws BEHIND the chrome rather than over it, so nothing has to move.
   */
  home?: boolean;
  accent: string;
}

/**
 * Esri's satellite basemap — real greens, blues and topography, and the same
 * imagery the globe is textured from so the handover is continuous. The dark
 * CARTO basemap it replaces was coherent with the UI but told you almost nothing
 * about the terrain you were pointing at.
 */
const SATELLITE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
/** Place names, drawn over the imagery, since satellite alone has no labels. */
const LABELS =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

/** Zoom at or below which the flat map gives way to the sphere. */
const GLOBE_ZOOM = 3;

/**
 * A polar azimuthal plate: latitude is RADIUS (N pole at centre, equator at
 * exactly half, S pole at the limb) and longitude is BEARING with 0° at
 * twelve o'clock. It replaces a 4px crosshatch that encoded nothing and a dot
 * pinned at left:19px/top:18px regardless of where on Earth you were standing.
 * Inline SVG — no external asset, CSP-safe.
 */
function Graticule({ lat, lng }: Coordinates) {
  const r = ((90 - lat) / 180) * 10;
  const th = ((lng - 90) * Math.PI) / 180;
  return (
    <svg className="place-plate" viewBox="0 0 22 22" aria-hidden="true">
      <path className="plate-meridian" d="M11 1v20M1 11h20M3.9 3.9l14.2 14.2M18.1 3.9L3.9 18.1" />
      <circle className="plate-ring" cx="11" cy="11" r="2.5" />
      <circle className="plate-ring" cx="11" cy="11" r="7.5" />
      <circle className="plate-equator" cx="11" cy="11" r="5" />
      <circle className="plate-limb" cx="11" cy="11" r="10" />
      <circle className="plate-fix" cx={11 + r * Math.cos(th)} cy={11 + r * Math.sin(th)} r="1.5" />
    </svg>
  );
}

function targetIcon(): L.DivIcon {
  return L.divIcon({
    className: 'place-marker',
    html: '<span class="place-marker-ring"></span><span class="place-marker-core"></span>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function PlaceDial({
  coordinates,
  location,
  onPick,
  expanded,
  onExpandedChange,
  home = false,
  accent,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  /** Set while we're reacting to a user gesture on the map, so the fly-to
   *  effect below doesn't yank the camera back. */
  const internalMove = useRef(false);

  const [fullscreen, setFullscreen] = useState(false);
  const [view, setView] = useState<'map' | 'globe'>('map');
  /**
   * Where the flat map should be LOOKING, which is not the same as the selected
   * point. Zooming in on the globe is navigation: it should land you where you
   * were aiming, not teleport you back to whatever you last clicked.
   */
  const [mapCenter, setMapCenter] = useState<Coordinates>(coordinates);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  /** Distinguishes "Nominatim is down / rate-limited" from "no such place". */
  const [searchFailed, setSearchFailed] = useState(false);

  // --- map lifecycle -------------------------------------------------------
  useEffect(() => {
    if (!expanded || view !== 'map') return;
    const host = hostRef.current;
    if (!host || mapRef.current) return;

    const map = L.map(host, {
      center: [mapCenter.lat, mapCenter.lng],
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
      // The globe owns everything below GLOBE_ZOOM, so the map must not go there.
      minZoom: GLOBE_ZOOM,
    });
    L.tileLayer(SATELLITE, { attribution: GLOBE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    L.tileLayer(LABELS, { maxZoom: 19, opacity: 0.9 }).addTo(map);

    const marker = L.marker([coordinates.lat, coordinates.lng], {
      icon: targetIcon(),
      draggable: true,
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      internalMove.current = true;
      void reverseGeocode({ lat: pos.lat, lng: pos.lng }).then((name) => {
        onPick({ lat: pos.lat, lng: pos.lng }, name);
      });
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      const next = { lat: e.latlng.lat, lng: e.latlng.lng };
      marker.setLatLng(e.latlng);
      internalMove.current = true;
      void reverseGeocode(next).then((name) => onPick(next, name));
    });

    // Scrolling out past the floor is the gesture that asks for the globe.
    map.on('zoomend', () => {
      if (map.getZoom() <= GLOBE_ZOOM) setView('globe');
    });

    mapRef.current = map;
    markerRef.current = marker;

    // Leaflet measures its container on init; if that happened mid-transition
    // the tiles come back sized wrong until something invalidates them.
    const t = setTimeout(() => map.invalidateSize(), 220);

    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Intentionally not re-running on coordinate changes — that's the fly-to
    // effect's job. Re-running here would tear the map down on every pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, view]);

  /** Resizing the container needs Leaflet told, or half the panel stays grey. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.invalidateSize(), 260);
    return () => clearTimeout(t);
  }, [fullscreen]);

  // --- THE FIX: keep the camera and marker on the selected coordinates -----
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    marker.setLatLng([coordinates.lat, coordinates.lng]);

    if (internalMove.current) {
      // The user just clicked/dragged here; they can already see it.
      internalMove.current = false;
      return;
    }
    const current = map.getCenter();
    const moved = Math.abs(current.lat - coordinates.lat) > 0.01 || Math.abs(current.lng - coordinates.lng) > 0.01;
    if (moved) {
      // A 1.1s animated camera sweep across the globe is exactly the kind of
      // motion prefers-reduced-motion exists for; CSS honours the setting
      // everywhere else in the app, but Leaflet animates in JS and cannot see it.
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const zoom = Math.max(map.getZoom(), 5);
      if (reduced) map.setView([coordinates.lat, coordinates.lng], zoom, { animate: false });
      else map.flyTo([coordinates.lat, coordinates.lng], zoom, { duration: 1.1 });
    }
  }, [coordinates]);

  // --- search --------------------------------------------------------------
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    setSearchFailed(false);
    const t = setTimeout(() => {
      searchPlaces(trimmed, controller.signal)
        .then((rows) => {
          setResults(rows.slice(0, 6));
          setSearchFailed(false);
        })
        .catch((err) => {
          // An abort is our own doing (the user kept typing) and is not a
          // failure. A real one used to be swallowed, leaving an empty panel
          // that read exactly like "no such place" — so Nominatim being
          // rate-limited looked like the user misspelling Petra.
          if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
          setResults([]);
          setSearchFailed(true);
        })
        .finally(() => setSearching(false));
    }, 320);
    return () => {
      clearTimeout(t);
      controller.abort();
      setSearching(false);
    };
  }, [query]);

  const choose = (r: GeocodeResult) => {
    setQuery('');
    setResults([]);
    // Selecting a named place is an act of zooming in; the globe is for browsing.
    setView('map');
    setMapCenter(r.coordinates);
    onPick(r.coordinates, r.shortName);
  };

  const pickFromGlobe = (next: Coordinates) => {
    setMapCenter(next);
    void reverseGeocode(next).then((name) => onPick(next, name));
  };

  /** Globe -> map handover. Carries the aimed-at point, and suppresses the
   *  fly-to effect once so it does not immediately drag the camera back to the
   *  current selection. */
  const handoverToMap = (target: Coordinates) => {
    setMapCenter(target);
    internalMove.current = true;
    setView('map');
  };

  if (!expanded) {
    // The legend is a real element, not CSS `content`: pseudo text can't be
    // translated and some screen readers announce it, so the button's accessible
    // name would drift from what is on screen. The term is the codebase's own —
    // Portal.tsx's docblock calls it "the place you're standing".
    return (
      <button className="place-puck" onClick={() => onExpandedChange(true)} title="Change location (M)">
        <Graticule lat={coordinates.lat} lng={coordinates.lng} />
        <span className="place-puck-legend">PLACE</span>
        <span className="place-puck-label">{location}</span>
      </button>
    );
  }

  const filling = fullscreen || home;

  const panel = (
    <div
      className={`place-panel${filling ? ' place-panel--full' : ''}${home ? ' place-panel--home' : ''}`}
    >
      <div className="place-panel-head">
        <input
          className="place-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search anywhere on Earth…"
          autoFocus={!home}
          aria-label="Search for a place"
        />
        <button
          className="place-view-toggle"
          onClick={() => setView((v) => (v === 'map' ? 'globe' : 'map'))}
          aria-pressed={view === 'globe'}
          title={view === 'globe' ? 'Switch to the flat map' : 'Switch to the globe'}
        >
          {view === 'globe' ? 'MAP' : 'GLOBE'}
        </button>
        {!home && (
          <button
            className="place-view-toggle"
            onClick={() => setFullscreen((f) => !f)}
            aria-pressed={fullscreen}
            title={fullscreen ? 'Shrink the map' : 'Fill the screen — easier to pick a precise point'}
          >
            {fullscreen ? '⤡' : '⤢'}
          </button>
        )}
        {!home && (
          <button className="place-close" onClick={() => onExpandedChange(false)} aria-label="Close map">
            ✕
          </button>
        )}
      </div>

      {results.length > 0 && (
        <ul className="place-results">
          {results.map((r) => (
            <li key={`${r.coordinates.lat},${r.coordinates.lng}`}>
              <button onClick={() => choose(r)}>
                <strong>{r.shortName}</strong>
                <span>{r.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searching && results.length === 0 && <div className="place-searching">searching…</div>}
      {!searching && searchFailed && (
        <div className="place-searching place-searching--failed" role="status">
          place lookup unavailable — not the same as no match. try again shortly.
        </div>
      )}
      {!searching && !searchFailed && query.trim().length >= 2 && results.length === 0 && (
        <div className="place-searching" role="status">
          no places match “{query.trim()}”
        </div>
      )}

      <div className="place-stage">
        {view === 'map' ? (
          <div ref={hostRef} className="place-map" />
        ) : (
          <Suspense fallback={<div className="globe-status">loading the globe…</div>}>
            <GlobeView
              coordinates={coordinates}
              onPick={pickFromGlobe}
              onZoomIn={handoverToMap}
              accent={accent}
            />
          </Suspense>
        )}
      </div>

      <div className="place-panel-foot">
        <span>{location}</span>
        <span className="place-coords">
          {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
        </span>
      </div>
    </div>
  );

  /**
   * Home mode renders into <body>, not into the control row where PlaceDial
   * lives. .portal-bottom sets z-index 4 and so opens a stacking context; any
   * descendant of it paints above .portal-top (3) regardless of its own
   * z-index, which is the opposite of what home mode wants. Leaving the subtree
   * is the only way for the map to sit UNDER the chrome. The expanded panel
   * keeps rendering in place, since it is meant to be on top.
   */
  return home ? createPortal(panel, document.body) : panel;
}
