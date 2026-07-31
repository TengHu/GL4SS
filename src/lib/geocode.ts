/**
 * Nominatim wrappers. We already use the reverse endpoint to label a clicked
 * map point; this adds forward search so the user can type a place name and
 * fly there.
 *
 * Nominatim has a strict rate limit and asks for a real referer; default
 * settings should be fine for casual use.
 */

import type { Coordinates } from '../types';

export interface GeocodeResult {
  displayName: string;
  shortName: string;
  coordinates: Coordinates;
  type?: string;
  importance?: number;
}

interface NominatimRow {
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  importance?: number;
  name?: string;
}

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';

function shortenName(displayName: string): string {
  return displayName.split(',').slice(0, 2).map((s) => s.trim()).join(', ');
}

/**
 * Label an arbitrary point. Falls back to formatted coordinates rather than
 * throwing — an unnamed spot in the ocean is a legitimate place to stand, and
 * the caller always needs *some* string to put in the prompt.
 */
export async function reverseGeocode(
  coordinates: Coordinates,
  signal?: AbortSignal,
): Promise<string> {
  const fallback = `${coordinates.lat.toFixed(3)}, ${coordinates.lng.toFixed(3)}`;
  const url = new URL(NOMINATIM_REVERSE);
  url.searchParams.set('lat', String(coordinates.lat));
  url.searchParams.set('lon', String(coordinates.lng));
  url.searchParams.set('format', 'json');
  url.searchParams.set('zoom', '12');

  try {
    const res = await fetch(url.toString(), { signal });
    if (!res.ok) return fallback;
    const row = (await res.json()) as { display_name?: string; name?: string };
    if (row.name) return row.name;
    if (row.display_name) return shortenName(row.display_name);
    return fallback;
  } catch {
    return fallback;
  }
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const url = new URL(NOMINATIM_SEARCH);
  url.searchParams.set('q', trimmed);
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '0');
  url.searchParams.set('limit', '8');

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Nominatim search ${res.status}`);
  const rows: NominatimRow[] = await res.json();
  return rows.map((r) => ({
    displayName: r.display_name,
    shortName: r.name ?? shortenName(r.display_name),
    coordinates: { lat: parseFloat(r.lat), lng: parseFloat(r.lon) },
    type: r.type,
    importance: r.importance,
  }));
}
