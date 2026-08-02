/**
 * STREET VIEW — a real photograph of a place, for seeding a frame.
 *
 * Ported from demo/street-probe.html, which worked out the parts that are not
 * obvious from the documentation. Three of them decide the shape of this file.
 *
 * THE EMBED IFRAME IS WRITE-ONLY. It accepts an opening heading and never
 * reports where the visitor dragged to, and being cross-origin its pixels cannot
 * be read either. Capturing what someone is ACTUALLY looking at needs `getPov()`,
 * which only the JS panorama exposes — which is why this loads the Maps SDK
 * rather than dropping in a free iframe, and why opening a sphere is billable.
 *
 * THE CAPTURE IS A RE-REQUEST, NOT A SCREENSHOT. The sphere is WebGL over
 * cross-origin tiles, so its canvas is tainted and unreadable. Instead the live
 * camera state is read off the panorama and the same view is asked of the Static
 * endpoint as a JPEG.
 *
 * ONLY THE BYTES TRAVEL. The Static URL carries the API key in its query string,
 * so it is fetched here and converted to a data URL. Handing that URL to
 * OpenRouter would post a Google credential to an inference provider and
 * whatever it logs — the same rule toPlayableUrl already enforces in the other
 * direction.
 *
 * COSTS, since this app names them: opening a sphere is $0.014 (5k/month free),
 * each capture is $0.007 (10k/month free). Metadata and the availability check
 * are free.
 */

/** A panorama's own record of itself. Everything here comes from a free call. */
export interface StreetViewHere {
  panoId: string;
  /** Where the CAMERA is — not where the visitor clicked. */
  at: { lat: number; lng: number };
  /** e.g. "2019-06". Absent on some panoramas. */
  date: string | null;
  copyright?: string;
}

interface MetadataResponse {
  status: string;
  pano_id?: string;
  location?: { lat: number; lng: number };
  date?: string;
  copyright?: string;
}

const METADATA = 'https://maps.googleapis.com/maps/api/streetview/metadata';
const STATIC = 'https://maps.googleapis.com/maps/api/streetview';
const SDK = 'https://maps.googleapis.com/maps/api/js';

/**
 * Is there imagery here, and from when?
 *
 * Free, and CORS-open — verified against the live endpoint rather than the docs.
 * `source=outdoor` matches the probe: indoor business panoramas are a different
 * kind of picture and a poor seed for a street.
 */
export async function lookupStreetView(
  key: string,
  at: { lat: number; lng: number },
  radius = 60,
  signal?: AbortSignal,
): Promise<StreetViewHere | null> {
  const q = new URLSearchParams({
    location: `${at.lat},${at.lng}`,
    radius: String(radius),
    source: 'outdoor',
    key,
  });
  const res = await fetch(`${METADATA}?${q}`, { signal });
  if (!res.ok) throw new Error(`street view metadata: HTTP ${res.status}`);
  const data = (await res.json()) as MetadataResponse;
  if (data.status !== 'OK' || !data.pano_id || !data.location) return null;
  return {
    panoId: data.pano_id,
    at: data.location,
    date: data.date ?? null,
    copyright: data.copyright,
  };
}

/**
 * Compass bearing from one point to another.
 *
 * The probe calls this "the whole trick", and it is: panoramas sit on the road,
 * but the visitor clicked a building. Aiming the camera back at the clicked
 * point is what turns a photograph OF A STREET into a photograph OF THE THING
 * THEY POINTED AT.
 */
export function bearing(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const p1 = rad(from.lat);
  const p2 = rad(to.lat);
  const dl = rad(to.lng - from.lng);
  const t = Math.atan2(
    Math.sin(dl) * Math.cos(p2),
    Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl),
  );
  return ((t * 180) / Math.PI + 360) % 360;
}

// ============================================================================
// THE SDK
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
type Pov = { heading: number; pitch: number };
export interface Panorama {
  getPov(): Pov;
  getPano(): string;
  getZoom(): number | undefined;
  setPano(id: string): void;
  setPov(pov: Pov): void;
}
declare global {
  interface Window {
    google?: any;
    __gl4ssMapsReady?: () => void;
  }
}

let sdk: Promise<any> | null = null;

/** Loads once per session; a second call returns the same promise. */
export function loadMapsSdk(key: string): Promise<any> {
  if (sdk) return sdk;
  sdk = new Promise((resolve, reject) => {
    window.__gl4ssMapsReady = () => resolve(window.google);
    const s = document.createElement('script');
    s.src = `${SDK}?key=${encodeURIComponent(key)}&v=weekly&callback=__gl4ssMapsReady`;
    s.async = true;
    s.onerror = () => {
      sdk = null;
      reject(new Error('Google Maps failed to load — check the key.'));
    };
    document.head.appendChild(s);
  });
  return sdk;
}

/** Open a sphere in `host`. THIS IS THE BILLED CALL — $0.014 per panorama. */
export async function openPanorama(
  key: string,
  host: HTMLElement,
  panoId: string,
  heading: number,
): Promise<Panorama> {
  const google = await loadMapsSdk(key);
  return new google.maps.StreetViewPanorama(host, {
    pano: panoId,
    pov: { heading, pitch: 0 },
    zoom: 1,
    addressControl: false,
    motionTracking: false,
    motionTrackingControl: false,
    fullscreenControl: false,
    enableCloseButton: false,
  }) as Panorama;
}

export interface Capture {
  blob: Blob;
  heading: number;
  pitch: number;
  fov: number;
  panoId: string;
  /** True when the sphere was zoomed wider than the Static API can reproduce. */
  clipped: boolean;
}

/**
 * Capture exactly what is on screen. THIS IS THE BILLED CALL — $0.007.
 *
 * Four details make it what-you-see rather than approximately-right, all of them
 * learned in the probe:
 *
 *   · getPano(), not the id we opened with — arrows let the visitor walk away
 *   · zoom → fov, because zooming a sphere is a narrower lens, not a bigger image
 *   · heading normalised, since getPov() returns negative and >360 values happily
 *   · the request matches the viewer's SHAPE, not only its angles: `fov` is
 *     horizontal only, so asking for a square crop of a wide viewer keeps the
 *     left-right extent right while showing far more sky and road than anyone
 *     could see
 */
export async function captureView(
  key: string,
  panorama: Panorama,
  viewport: { width: number; height: number },
): Promise<Capture> {
  const pov = panorama.getPov();
  const panoId = panorama.getPano();
  const zoom = panorama.getZoom() ?? 1;
  const wantFov = 180 / 2 ** zoom;
  const fov = Math.max(10, Math.min(120, wantFov));
  const heading = ((pov.heading % 360) + 360) % 360;

  // 640 is the standard-tier ceiling on either side.
  const scale = 640 / Math.max(viewport.width, viewport.height);
  const w = Math.max(16, Math.round(viewport.width * scale));
  const h = Math.max(16, Math.round(viewport.height * scale));

  const q = new URLSearchParams({
    size: `${w}x${h}`,
    pano: panoId,
    heading: heading.toFixed(2),
    pitch: pov.pitch.toFixed(2),
    fov: fov.toFixed(1),
    // Without this a location with no coverage returns a GREY RECTANGLE and
    // HTTP 200, and we would seed a frame from it without ever knowing.
    return_error_code: 'true',
    key,
  });

  const res = await fetch(`${STATIC}?${q}`);
  if (!res.ok) throw new Error(`street view capture: HTTP ${res.status}`);
  return {
    blob: await res.blob(),
    heading,
    pitch: pov.pitch,
    fov,
    panoId,
    clipped: wantFov > 120,
  };
}

/** "2019-06" → 2019. Used to move the dial to what the picture actually shows. */
export function captureYear(date: string | null): number | null {
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}
