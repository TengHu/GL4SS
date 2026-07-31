/**
 * Builds a sphere-ready world texture out of ordinary map tiles.
 *
 * Slippy-map tiles are Web Mercator; a sphere needs equirectangular. Wrapping
 * Mercator straight onto a ball smears everything toward the poles and puts
 * Europe somewhere over the Arctic, so the tiles have to be reprojected first.
 *
 * Mercator is separable: longitude maps linearly to x, and latitude maps to y
 * through a single function independent of x. So the whole reprojection is one
 * vertical resample — for each output row we work out which source row it came
 * from and blit a one-pixel-tall slice. No per-pixel loop, no ImageData, and it
 * stays on the GPU-friendly canvas path.
 *
 * Mercator also cannot represent beyond about ±85.05°, so the caps are filled
 * with a polar tone rather than left transparent — an Earth with two holes in it
 * reads as broken, whereas ice reads as Earth.
 */

/** Esri's satellite basemap: real greens, real blues, real topography. */
const TILE_URL = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

export const GLOBE_ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics';

const TILE_PX = 256;
/** z=3 is 64 tiles — enough detail to recognise coastlines on a spinning globe
 *  without a hundred requests before the thing first appears. */
const ZOOM = 3;
/** Mercator's usable latitude limit, in degrees. */
const MERCATOR_LIMIT = 85.0511287798066;

function loadTile(z: number, x: number, y: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Required so the composited canvas is not tainted — WebGL refuses a tainted
    // canvas as a texture, which would fail at upload rather than at fetch.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = TILE_URL(z, x, y);
  });
}

/**
 * Fetch the tile pyramid at ZOOM and composite it into one Mercator canvas.
 * Missing tiles are simply skipped; a globe with one blank tile is far better
 * than no globe.
 */
async function buildMercatorCanvas(
  onProgress?: (loaded: number, total: number) => void,
): Promise<HTMLCanvasElement> {
  const count = 2 ** ZOOM;
  const size = count * TILE_PX;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0b1a2b';
  ctx.fillRect(0, 0, size, size);

  const coords: Array<[number, number]> = [];
  for (let x = 0; x < count; x++) for (let y = 0; y < count; y++) coords.push([x, y]);

  let loaded = 0;
  // Batched so we never open 64 sockets at once.
  const BATCH = 8;
  for (let i = 0; i < coords.length; i += BATCH) {
    const batch = coords.slice(i, i + BATCH);
    const tiles = await Promise.all(batch.map(([x, y]) => loadTile(ZOOM, x, y)));
    tiles.forEach((img, n) => {
      loaded++;
      if (!img) return;
      const [x, y] = batch[n]!;
      ctx.drawImage(img, x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
    });
    onProgress?.(loaded, coords.length);
  }
  return canvas;
}

/** Latitude (degrees) -> normalised Mercator y in 0..1. */
function latToMercatorY(latDeg: number): number {
  const phi = (latDeg * Math.PI) / 180;
  return (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2;
}

/**
 * Reproject the Mercator composite to equirectangular, which is what a UV-mapped
 * sphere expects.
 */
export async function buildGlobeTexture(
  onProgress?: (loaded: number, total: number) => void,
): Promise<HTMLCanvasElement> {
  const src = await buildMercatorCanvas(onProgress);

  const outW = src.width;
  const outH = Math.round(outW / 2);
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d')!;

  // Polar caps: Mercator carries no data past ±85°. Filling them with flat white
  // produced a disc that read as pasted on. Clamping to the outermost real row
  // instead extends what is actually there — Antarctic ice southward, Arctic sea
  // ice northward — so the caps are continuous with their surroundings.
  for (let j = 0; j < outH; j++) {
    const lat = 90 - (j / outH) * 180;
    const clamped = Math.max(-MERCATOR_LIMIT + 0.01, Math.min(MERCATOR_LIMIT - 0.01, lat));
    const srcY = Math.min(
      src.height - 1,
      Math.max(0, Math.round(latToMercatorY(clamped) * src.height)),
    );
    ctx.drawImage(src, 0, srcY, src.width, 1, 0, j, outW, 1);
  }

  return out;
}

/**
 * Sphere-local point -> lat/lng, matching three.js SphereGeometry's UV origin.
 *
 * Its vertices are x = -r·cosθ·sinφ, y = r·cosφ, z = r·sinθ·sinφ, with θ running
 * 0→2π across the texture's left-to-right. atan2 returns (-180,180], so it has to
 * be lifted into [0,360) BEFORE subtracting 180 — doing it the other way round
 * mirrors the western hemisphere onto the eastern, which shows up as clicks in
 * the Atlantic landing in central Asia.
 */
export function vectorToLatLng(x: number, y: number, z: number): { lat: number; lng: number } {
  const r = Math.sqrt(x * x + y * y + z * z);
  const lat = 90 - (Math.acos(Math.min(1, Math.max(-1, y / r))) * 180) / Math.PI;
  const thetaDeg = ((Math.atan2(z, -x) * 180) / Math.PI + 360) % 360;
  return { lat, lng: thetaDeg - 180 };
}

/** Inverse of the above, for placing a marker at the selected coordinates. */
export function latLngToVector(lat: number, lng: number, radius: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}
