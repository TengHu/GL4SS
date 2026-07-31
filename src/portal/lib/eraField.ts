/**
 * ERA COLOUR FIELDS.
 *
 * While a station's image generates, the portal must not be a spinner on black.
 * Instead we fill it with a colour field derived from that era's palette — the
 * same palette that is going into the image prompt. The effect is that the
 * portal looks like it is *focusing*: you get the era's light immediately, and
 * the photograph resolves into it. Scrubbing between two uncached stations
 * still visibly changes the screen, which keeps the dial feeling connected to
 * something even when nothing is cached yet.
 *
 * Stops are hand-picked per era rather than derived from the single band colour
 * in format.ts, because a believable "light of a period" needs a warm/cool pair
 * plus a shadow, not one hue.
 */

import { getEraBand } from '../../lib/format';

interface Field {
  /** Bright source light. */
  key: string;
  /** Mid tone / ambient bounce. */
  fill: string;
  /** Deep shadow the vignette falls to. */
  shadow: string;
}

const FIELDS: Record<string, Field> = {
  triassic: { key: '#e8a15c', fill: '#8c3d1f', shadow: '#2a1108' },
  jurassic: { key: '#bfe86a', fill: '#1f6b3a', shadow: '#0a1d12' },
  cretaceous: { key: '#ffb26a', fill: '#2f7d43', shadow: '#101c10' },
  paleogene: { key: '#d8f08a', fill: '#1d6f66', shadow: '#08181a' },
  neogene: { key: '#f0d98a', fill: '#4a7a4a', shadow: '#14180e' },
  pleistocene: { key: '#dff2ff', fill: '#5b7c99', shadow: '#0d151c' },
  neolithic: { key: '#f0c98a', fill: '#6b5436', shadow: '#16110a' },
  bronze: { key: '#f2c078', fill: '#a9662f', shadow: '#25150c' },
  classical: { key: '#f7e6c4', fill: '#4f8fa6', shadow: '#12212b' },
  roman: { key: '#f0d9a8', fill: '#9c4321', shadow: '#1e1008' },
  dark: { key: '#c9b88f', fill: '#4a5340', shadow: '#11140f' },
  medieval: { key: '#e8c46a', fill: '#6b2733', shadow: '#170c10' },
  renaissance: { key: '#f0cb84', fill: '#7a4a1e', shadow: '#1a1108' },
  enlightenment: { key: '#f3ead9', fill: '#8296ad', shadow: '#161c24' },
  industrial: { key: '#d99a4a', fill: '#4a4239', shadow: '#100e0c' },
  'early-modern': { key: '#ddd0b4', fill: '#7a7259', shadow: '#16150f' },
  'late-20': { key: '#ffd166', fill: '#2f7f9e', shadow: '#0d1418' },
  digital: { key: '#eaf6ff', fill: '#3d7ea6', shadow: '#0a1016' },
  'near-future': { key: '#ff5fd2', fill: '#1b3a8f', shadow: '#080a16' },
  advanced: { key: '#7ff5c3', fill: '#3b2f8f', shadow: '#080814' },
  'far-future': { key: '#d9b3ff', fill: '#1d2a5c', shadow: '#04040a' },
};

const FALLBACK: Field = { key: '#cfd8e3', fill: '#465a6e', shadow: '#0c1116' };

export function eraField(year: number): Field {
  return FIELDS[getEraBand(year).id] ?? FALLBACK;
}

/**
 * The full-bleed latent backdrop. Two offset radial pools over a vertical
 * gradient reads as directional light rather than a flat wash.
 */
export function eraFieldCss(year: number): string {
  const f = eraField(year);
  return [
    `radial-gradient(120% 90% at 22% 18%, ${f.key}7a 0%, transparent 58%)`,
    `radial-gradient(100% 80% at 78% 72%, ${f.fill}96 0%, transparent 64%)`,
    `linear-gradient(168deg, ${f.fill}66 0%, ${f.shadow} 88%)`,
  ].join(', ');
}

/** Accent used for the dial needle and readouts at this year. */
export function eraAccent(year: number): string {
  return eraField(year).key;
}
