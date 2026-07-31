/**
 * THE PIN — the anchor half of the comparison.
 *
 * You drop a pin on a station you already own, walk the dial somewhere else, and
 * the two photographs share the screen split by a draggable seam. The pin is an
 * anchor, not a mode: while you are standing on it, nothing happens at all.
 *
 * The load-bearing rule is that a pin can only ever target a frame that is
 * ALREADY owned — in memory or on disk. That is what makes the whole feature
 * structurally incapable of producing a surprise bill: no gesture anywhere in
 * the comparison can trigger a generation, because pinning validates ownership
 * before it will attach.
 */

import type { Coordinates } from '../../types';

export interface Pin {
  /** Station index of the held frame. */
  index: number;
  /** Place + style at pin time. A pin is "same place, same style, other year", so
   *  it self-invalidates when either changes rather than comparing two unrelated
   *  pictures that merely share a screen. */
  lat: string;
  lng: string;
  styleId: string;
}

/** Clamp so neither era can ever be pushed entirely off screen. */
export const SEAM_MIN = 0.04;
export const SEAM_MAX = 0.96;

export function clampSeam(fraction: number): number {
  return Math.min(SEAM_MAX, Math.max(SEAM_MIN, fraction));
}

export function makePin(index: number, coordinates: Coordinates, styleId: string): Pin {
  return {
    index,
    lat: coordinates.lat.toFixed(3),
    lng: coordinates.lng.toFixed(3),
    styleId,
  };
}

/** A pin only applies to the place and style it was dropped in. */
export function pinApplies(pin: Pin | null, coordinates: Coordinates, styleId: string): boolean {
  if (!pin) return false;
  return (
    pin.lat === coordinates.lat.toFixed(3) &&
    pin.lng === coordinates.lng.toFixed(3) &&
    pin.styleId === styleId
  );
}

/**
 * Which side of the screen the held frame occupies.
 *
 * Earlier stations are always left of the fixed needle on the ribbon, so putting
 * an earlier pinned era on the left of the seam makes the screen's geometry and
 * the dial's geometry agree exactly. It is a consequence of the tuner's layout
 * rather than a convention the user has to be taught.
 */
export function pinnedSide(pin: Pin, index: number): 'left' | 'right' {
  return pin.index < index ? 'left' : 'right';
}

/**
 * Where the seam sits when a comparison first opens.
 *
 * Proportional to temporal distance, so a two-station hop opens as a sliver of
 * the past intruding on the present, while a forty-station leap opens near the
 * middle as a genuine confrontation. Read as "how much of the old world is left
 * standing". It is only the OPENING position — the user drags it anywhere after.
 */
export function openingSeam(pin: Pin, index: number, stationCount: number): number {
  const distance = Math.abs(index - pin.index);
  const share = Math.min(1, distance / (stationCount / 3));
  const fromEdge = 0.12 + share * 0.38;
  return clampSeam(pinnedSide(pin, index) === 'left' ? fromEdge : 1 - fromEdge);
}

/**
 * The character of a jump: which way through time, and how far.
 *
 * Waiting 5-30s for a frame is the app's least pleasant moment, and it was a
 * single generic sweep regardless of whether you had nudged one decade or fallen
 * a hundred million years. Giving the wait direction and magnitude turns dead
 * time into the part where the travelling actually happens.
 */
export type JumpDirection = 'forward' | 'back';
export type JumpReach = 'near' | 'far';

export interface JumpCharacter {
  direction: JumpDirection;
  reach: JumpReach;
  /** Stations crossed, for tuning intensity. */
  distance: number;
}

/** A leap of more than this many stations reads as "far". */
const FAR_STATIONS = 6;

export function jumpCharacter(fromIndex: number, toIndex: number): JumpCharacter | null {
  const delta = toIndex - fromIndex;
  if (delta === 0) return null;
  return {
    direction: delta > 0 ? 'forward' : 'back',
    reach: Math.abs(delta) > FAR_STATIONS ? 'far' : 'near',
    distance: Math.abs(delta),
  };
}

// Note: the pin is deliberately NOT synced to the URL yet. It would need both
// scene keys to hydrate out of IndexedDB before it could restore honestly, and
// a `?pin=` param that silently drops on a fresh browser is worse than no param
// at all. Left for when sharing is designed properly.
