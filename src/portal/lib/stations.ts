/**
 * TEMPORAL STATIONS — the idea the whole portal is built on.
 *
 * v1 had a continuous year slider from -3000 to 3050. That reads well but it
 * quietly makes the product slow: every distinct integer year is its own cache
 * key, so nothing is ever a cache hit, nothing can be usefully prefetched, and
 * every single move costs a full ~40s generation round trip. The slider was
 * promising continuity the backend could never deliver.
 *
 * So we quantize time into discrete STATIONS, at a granularity that follows
 * how much actually changes per year:
 *
 *   -252M → -100M  every 25M years   (the age of dinosaurs, in six strides)
 *   -100M → -10M   every 10M years
 *    -10M → -1M    every  1M years
 *     -1M → -100k  every 100k years
 *   -100k → -10k   every  10k years
 *    -10k → -3000  every   1k years   (the last ice age into the Neolithic)
 *   -3000 → 1500   every 100 years   (a century barely moves the Bronze Age)
 *    1500 → 1800   every  25 years
 *    1800 → 1900   every  10 years
 *    1900 → 2030   every   1 year    (living memory, where a year is a subject)
 *    2030 → 2100   every   5 years
 *    2100 → 3050   every  50 years   (speculative, coarse on purpose)
 *
 * THE MODERN RUNG IS ANNUAL because the old ladder could not reach 1969. It
 * stepped 1900→2000 by ten and 2000→2060 by five, so the moon landing, the fall
 * of the Wall and the year you were born were all simply not stations — and in
 * the century people actually have opinions about, a decade is not a granularity,
 * it is a different world. Photographs of 1962 and 1968 share almost nothing.
 *
 * That takes the ladder from 146 rungs to ~280, which a UNIFORM 54px cell would
 * turn into a 15,000px ribbon nobody could drag. So the cell width now follows
 * the graduation order (see stationWidth): a minor tick is 22px and a gear-change
 * rung is 56px, which means the dial travels fast through the coarse ends and
 * slowly where the resolution is genuinely fine. That is also just what a real
 * scale looks like — graduations crowd where the instrument is precise.
 *
 * Because stations are a fixed finite ladder, the cache genuinely hits, the
 * neighbours of wherever you're standing can be generated in the background,
 * and moving between them feels like tuning a radio between stations rather
 * than submitting a form. Discretising the axis is what buys the fluidity.
 */

import { MAX_YEAR, MIN_YEAR } from '../../lib/format';

interface Rung {
  from: number;
  to: number;
  step: number;
}

const LADDER: Rung[] = [
  // DEEP TIME. A linear ladder cannot span 252 million years and also resolve a
  // decade, so the step grows by an order of magnitude as it recedes — the same
  // logic as the rest of the ladder, taken further. Each rung roughly doubles the
  // resolution you would actually want at that distance: 25-million-year strides
  // through the age of dinosaurs, millennia through the last ice age.
  { from: MIN_YEAR, to: -100_000_000, step: 25_000_000 },
  { from: -100_000_000, to: -10_000_000, step: 10_000_000 },
  { from: -10_000_000, to: -1_000_000, step: 1_000_000 },
  { from: -1_000_000, to: -100_000, step: 100_000 },
  { from: -100_000, to: -10_000, step: 10_000 },
  { from: -10_000, to: -3000, step: 1000 },
  { from: -3000, to: 1500, step: 100 },
  { from: 1500, to: 1800, step: 25 },
  { from: 1800, to: 1900, step: 10 },
  // Living memory, one year at a time. 2030 rather than "now" so the boundary is
  // a fixed fact about the ladder and not something that silently moves the
  // station grid — and every cache key with it — as the calendar advances.
  { from: 1900, to: 2030, step: 1 },
  { from: 2030, to: 2100, step: 5 },
  { from: 2100, to: MAX_YEAR, step: 50 },
];

/**
 * LANDMARK YEARS — exact dates the ladder would otherwise round away.
 *
 * Before 1500 the ladder resolves centuries, which is right for browsing: a
 * hundred years barely moves the Bronze Age and a rung per decade would make the
 * dial unusable. But it means a curated journey to a DATED EVENT lands somewhere
 * else entirely — Vesuvius in AD 79 snaps to AD 100, twenty-one years after the
 * eruption, and the frame is a quiet hillside.
 *
 * So a handful of specific years are spliced in. They are deliberately few: each
 * one is a moment a journey actually points at, not a general-purpose increase in
 * resolution. Adding one is cheap — indices are derived, never persisted, and
 * sceneKey is keyed on the YEAR — but every entry is an extra graduation on the
 * dial, so it should be earning its place.
 */
const LANDMARKS: number[] = [
  -150, // Carthage rearmed, the circular harbour finished, four years from the end
  79, //   24 August: Vesuvius buries Pompeii and Herculaneum
  216, //  Caracalla finishes the Severan forum his father began at Leptis Magna
];

function buildStations(): number[] {
  const out: number[] = [];
  for (const rung of LADDER) {
    for (let y = rung.from; y < rung.to; y += rung.step) out.push(y);
  }
  out.push(...LANDMARKS);
  out.push(MAX_YEAR);
  // The ladder boundaries can collide (e.g. 1900 emitted by two rungs).
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Every year the portal can be tuned to, ascending. See STATION_COUNT. */
export const STATIONS: number[] = buildStations();

export const STATION_COUNT = STATIONS.length;

/** Index of the station nearest to `year`. Always in range. */
export function nearestStationIndex(year: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < STATIONS.length; i++) {
    const dist = Math.abs(STATIONS[i]! - year);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/** Snap an arbitrary year onto the station ladder. */
export function snapToStation(year: number): number {
  return STATIONS[nearestStationIndex(year)]!;
}

export function stationAt(index: number): number {
  const clamped = Math.max(0, Math.min(STATIONS.length - 1, index));
  return STATIONS[clamped]!;
}

/**
 * Neighbours to speculatively generate, nearest-first.
 *
 * Nearest-first matters: if the user is walking forward through time we want
 * the +1 station ready before the -2 station, and the queue is drained in
 * order. `radius` is deliberately small — each station is a real image spend.
 */
export function neighbourStations(index: number, radius = 2): number[] {
  const out: number[] = [];
  for (let d = 1; d <= radius; d++) {
    for (const i of [index + d, index - d]) {
      if (i >= 0 && i < STATIONS.length) out.push(STATIONS[i]!);
    }
  }
  return out;
}

/** Fractional 0..1 position of a station index, for laying out the dial. */
export function stationProgress(index: number): number {
  if (STATIONS.length <= 1) return 0;
  return index / (STATIONS.length - 1);
}

/**
 * The stations either side of `year`, for prompt contrast.
 *
 * The scene-direction prompt asks the planner to make a frame distinguishable
 * from its neighbours. Deriving that window from the era's span produced
 * nonsense once deep time existed — a quarter of the Neogene is 5.1 million
 * years, which pushed seventeen prehistoric stations into a POSITIVE year, so
 * the last ice age was being contrasted against 627075 AD. The dial's own
 * neighbours are both correct and more honest about what the user can compare.
 */
export function neighbourContrast(year: number): { earlier: number; later: number } {
  const i = nearestStationIndex(year);
  return {
    earlier: STATIONS[Math.max(0, i - 1)]!,
    later: STATIONS[Math.min(STATIONS.length - 1, i + 1)]!,
  };
}

/**
 * Parse a year the user typed, in any of the registers the app itself uses.
 *
 * The dial displays "500 BC", "20,000 years ago" and "66 million years ago"
 * depending on scale, so it has to accept all three back — a control that shows
 * you a format it will not read is just rude. Deliberately unbounded: callers
 * snap the result to the ladder, and clamping is the caller's business.
 */
export function parseYearInput(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(/,/g, '');
  if (!text) return null;

  const num = Number.parseFloat(text);
  if (!Number.isFinite(num)) return null;

  // "66 million years ago", "66 mya", "3.2m years ago"
  if (/(million|mya|myr|\bm\b)/.test(text)) return Math.round(-Math.abs(num) * 1_000_000);
  if (/(thousand|kya|\bk\b)/.test(text)) return Math.round(-Math.abs(num) * 1000);
  // "20000 years ago" / "20000 bp"
  if (/(years?\s*ago|\bbp\b)/.test(text)) return Math.round(-Math.abs(num));
  if (/\bbce?\b/.test(text)) return Math.round(-Math.abs(num));
  if (/\b(ad|ce)\b/.test(text)) return Math.round(Math.abs(num));
  return Math.round(num);
}

/**
 * Which of the four graduation orders a station carries.
 *
 * `rung` is one of the ELEVEN places LADDER's step size actually changes gear
 * (−252M, −100M, −10M, −1M, −100k, −10k, −3000, 1500, 1900, 2000, 2060).
 * The dial has been drawing 146 evenly-spaced identical ticks across a ladder
 * whose adjacent stations are 25 million years apart at one end and five
 * years apart at the other. These marks are what stop it lying.
 */
export type StationOrder = 'minor' | 'major' | 'rung';

const RUNG_YEARS = new Set(LADDER.map((r) => r.from));

const ORDERS: StationOrder[] = (() => {
  const out: StationOrder[] = [];
  let sinceRung = 0;
  for (const y of STATIONS) {
    if (RUNG_YEARS.has(y)) { out.push('rung'); sinceRung = 0; continue; }
    sinceRung++;
    out.push(sinceRung % 5 === 0 ? 'major' : 'minor');
  }
  return out;
})();

export function stationOrder(index: number): StationOrder {
  return ORDERS[index] ?? 'minor';
}

/**
 * A scale figure is engraving, not prose: it must fit under a 54px station.
 * U+2212 MINUS, never a hyphen.
 */
export function shortYear(year: number): string {
  const a = Math.abs(year);
  const sign = year < 0 ? '−' : '';
  if (a >= 1_000_000) return `${sign}${Math.round(a / 1_000_000)}M`;
  if (a >= 10_000) return `${sign}${Math.round(a / 1000)}K`;
  if (year < 0) return `${a} BC`;
  // Year 0 IS a station (the -3000..1500 rung steps by 100 straight through it),
  // and formatYear/splitYear both call it 1 AD. Left as String(year) the scale
  // would engrave "0" directly beneath a readout saying "1 AD".
  if (year === 0) return '1';
  return String(year);
}

/**
 * The readout, split into a cut figure and a small unit.
 *
 * formatYear() returns prose, so “66 million years ago” at 34px is ~430px of
 * display type: the app's PRIMARY readout resizes by a factor of six as you
 * scrub. Must stay in exact agreement with formatYear()'s thresholds.
 */
export function splitYear(year: number): { fig: string; unit: string } {
  const ago = Math.abs(year);
  if (year < -1_000_000) {
    const m = ago / 1_000_000;
    const r = m >= 10 ? Math.round(m) : Math.round(m * 10) / 10;
    return { fig: String(r), unit: 'MILLION YEARS AGO' };
  }
  if (year < -12_000) return { fig: Math.round(ago).toLocaleString('en-US'), unit: 'YEARS AGO' };
  if (year < 0) return { fig: Math.round(ago).toLocaleString('en-US'), unit: 'BC' };
  if (year === 0) return { fig: '1', unit: 'AD' };
  return { fig: String(year), unit: 'AD' };
}

/* ---------- ribbon geometry ---------------------------------------------- */

/**
 * Cell width per graduation order, in px.
 *
 * The dial used one SPACING constant for every station, which was honest while
 * the ladder was 146 evenly-significant rungs. With an annual modern rung it is
 * not: a uniform 54px cell makes a 15,000px ribbon, and dragging 1900→2000 alone
 * would be 5,400px — five full screens to cross a century.
 *
 * Tying width to order fixes both problems at once and is what a real scale does
 * anyway. Crossing a century of minor ticks is now ~2,700px, the coarse deep-time
 * end stays open and readable, and the numbered majors keep enough room for an
 * engraved figure.
 */
const ORDER_WIDTH: Record<StationOrder, number> = { minor: 22, major: 46, rung: 56 };

export function stationWidth(index: number): number {
  return ORDER_WIDTH[stationOrder(index)];
}

/**
 * Cumulative left edge of every station, plus a final total.
 *
 * Computed once. The dial needs to convert both ways on every pointer move, and
 * summing widths per frame across ~280 stations is exactly the kind of work that
 * shows up as drag latency.
 */
const EDGES: number[] = (() => {
  const out: number[] = new Array(STATIONS.length + 1);
  out[0] = 0;
  for (let i = 0; i < STATIONS.length; i++) out[i + 1] = out[i]! + stationWidth(i);
  return out;
})();

/** Total ribbon width in px. */
export const RIBBON_WIDTH = EDGES[STATIONS.length]!;

function clampIndex(index: number): number {
  return Math.max(0, Math.min(STATIONS.length - 1, index));
}

/** Left edge of station `index` within the ribbon. */
export function stationLeft(index: number): number {
  return EDGES[clampIndex(index)]!;
}

/**
 * Centre of station `index` — where its tick actually sits, and therefore the
 * only x the needle, the pin fiducial and the comparison span may anchor to.
 */
export function stationCentre(index: number): number {
  const i = clampIndex(index);
  return EDGES[i]! + stationWidth(i) / 2;
}

/** Total px occupied by `count` stations starting at `from`. */
export function stationRunWidth(from: number, count: number): number {
  return EDGES[clampIndex(from + count)]! - EDGES[clampIndex(from)]!;
}

/**
 * Inverse of stationCentre: the station whose centre is nearest a ribbon x.
 *
 * Binary search on the edges, then compare the two candidates by centre rather
 * than by edge — a drag should commit to whichever tick is closest to the finger,
 * and with cells of three different widths those two answers genuinely differ.
 */
export function stationAtCentre(x: number): number {
  let lo = 0;
  let hi = STATIONS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (EDGES[mid + 1]! <= x) lo = mid + 1;
    else hi = mid;
  }
  const here = lo;
  const prev = clampIndex(here - 1);
  const next = clampIndex(here + 1);
  let best = here;
  let bestDist = Math.abs(stationCentre(here) - x);
  for (const cand of [prev, next]) {
    const d = Math.abs(stationCentre(cand) - x);
    if (d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  return best;
}
