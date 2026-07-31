/**
 * TIME OF DAY — the second axis, and a ladder for the same reason the years are.
 *
 * A continuous 24-hour slider would be the obvious control and the wrong one: it
 * makes every minute its own cache key, so nothing is ever a hit and nothing can
 * be prefetched — exactly the trap the year slider fell into before STATIONS
 * existed. So the day is quantised into eight phases, spaced evenly around a
 * dial, which is also how a sundial is actually graduated.
 *
 * Eight is chosen from what a PHOTOGRAPH looks like, not from the clock: dawn and
 * sunset are each their own phase because low sun is the most visually distinct
 * light there is, while the four hours either side of midday all look like
 * midday. The night half is deliberately coarser than the day half for the same
 * reason — after dark the light comes from whatever the era has, not from the sun.
 *
 * MIDDAY IS THE DEFAULT, and the default is load-bearing beyond taste: sceneKey
 * omits the phase when it is midday, so every frame generated before this control
 * existed keeps its exact key and nobody's archive silently empties.
 */

export interface DayPhase {
  id: string;
  /** Shown in the UI. Plain words — this is a control, not a costume. */
  label: string;
  /** Position on the dial, 0–23. Drives the indicator's angle directly. */
  hour: number;
  /** False after dark: the dial shows a moon and the prompt stops citing the sun. */
  daylight: boolean;
  /**
   * How high the body rides, 0 (on the horizon) to 1 (overhead). Drives the
   * disc's size and colour, so dawn reads as a big low red sun and midday as a
   * small hard white one — which is the actual difference between those two
   * photographs, and the reason they are separate phases at all.
   */
  elevation: number;
  /**
   * Illuminated fraction of the moon, signed: -1 is a waning crescent lit on the
   * left, 0 is full, +1 is a waxing crescent lit on the right. Night only.
   *
   * The moon does NOT really cycle over one night — this is a month's worth of
   * phases spread across the dark half of the dial. It is a legibility device,
   * not an ephemeris: it makes the three night stops distinguishable at 14px and
   * makes the whole sweep read as a cycle rather than as a light switch.
   */
  lunar: number;
  /**
   * The colour of this hour's light. EVERY phase has one, and no two are alike.
   *
   * They form an arc around the dial rather than eight arbitrary swatches:
   * coldest and dimmest in the small hours, warming through dawn, peaking at
   * midday as the palest and most luminant of the eight, then falling back
   * through a warmer hazier afternoon into a deep red sunset and out into
   * moonlight. Midday is the top of the dial and the top of the arc, so the
   * control gets brighter as you drag towards it — which is the one thing about
   * a day everybody already knows.
   *
   * The two that matter most are dawn and sunset, because both sit exactly on
   * the horizon line and are therefore both drawn as half a disc. Colour is the
   * only thing distinguishing them: dawn is the cooler pinker one, sunset deeper
   * and redder, which is the way round they actually are.
   *
   * Daylight tints are blended with the era accent so the dial still belongs to
   * the year you are standing in; the moon's are used neat, because moonlight is
   * not a property of the century.
   */
  tint: string;
  /**
   * Handed to the scene planner and to the image prompt. Written as a statement
   * about the light that IS present — the image models we route to either ignore
   * negations or act on the noun inside them, so "no sun" is not available to us.
   */
  prompt: string;
}

export const DAY_PHASES: DayPhase[] = [
  {
    id: 'midnight',
    // Full moon, and the brightest of the three dark stops — which is correct.
    tint: '#d7e2f0',
    elevation: 0.95,
    lunar: 0,
    label: 'midnight',
    hour: 0,
    daylight: false,
    prompt:
      'the middle of the night, the sky at its darkest and the land lit only by the moon, the stars, and whatever fires, lamps or windows this place and year actually have',
  },
  {
    id: 'small-hours',
    // Coldest and dimmest of the eight. The bottom of the arc.
    tint: '#aebdd1',
    elevation: 0.55,
    lunar: -0.65,
    label: 'small hours',
    hour: 3,
    daylight: false,
    prompt:
      'the small hours before first light, cold and still, the air damp and the sky only just beginning to separate from the horizon',
  },
  {
    id: 'dawn',
    // Cooler and pinker than sunset — first light, not last.
    elevation: 0.06,
    lunar: 0,
    tint: '#ff9d6e',
    label: 'dawn',
    hour: 6,
    daylight: true,
    prompt:
      'first light, the sun sitting right on the horizon, shadows stretched far across the ground and the colour running from cold blue in the shade to warm gold where the light lands',
  },
  {
    id: 'morning',
    // Clean gold. Its own prompt calls the air "at its clearest".
    tint: '#ffd79a',
    elevation: 0.55,
    lunar: 0,
    label: 'morning',
    hour: 9,
    daylight: true,
    prompt:
      'mid-morning, the sun well up but still low enough to rake across surfaces, shadows long and crisp, the air at its clearest',
  },
  {
    id: 'midday',
    // The peak: palest, most luminant, top of the dial.
    tint: '#fff4d0',
    elevation: 1,
    lunar: 0,
    label: 'midday',
    hour: 12,
    daylight: true,
    prompt:
      'midday, the sun high and close to overhead, shadows short and hard directly beneath things, the light flat and bright on upward-facing surfaces',
  },
  {
    id: 'afternoon',
    // Warmer and hazier than morning, per its own prompt.
    tint: '#ffc07a',
    elevation: 0.55,
    lunar: 0,
    label: 'afternoon',
    hour: 15,
    daylight: true,
    prompt:
      'mid-afternoon, the light warming and beginning to slant, shadows lengthening again and haze building in the distance',
  },
  {
    id: 'sunset',
    // Deepest red of the eight.
    elevation: 0.06,
    lunar: 0,
    tint: '#f2542a',
    label: 'sunset',
    hour: 18,
    daylight: true,
    prompt:
      'sunset, the sun on the horizon and the whole scene under low raking orange light, shadows very long, the sky graded from warm at the horizon to deep blue overhead',
  },
  {
    id: 'night',
    // Cool moonlight, a touch bluer than the small hours are grey.
    tint: '#a8bcd8',
    elevation: 0.55,
    lunar: 0.65,
    label: 'night',
    hour: 21,
    daylight: false,
    prompt:
      'after dark, the sky fully night, the scene lit from below and within by whatever light sources this place and year actually possess',
  },
];

export const DEFAULT_PHASE_ID = 'midday';

const BY_ID = new Map(DAY_PHASES.map((p) => [p.id, p]));

/** Always returns a phase; an unknown id degrades to the default rather than throwing. */
export function findPhase(id: string | null | undefined): DayPhase {
  return BY_ID.get(id ?? '') ?? BY_ID.get(DEFAULT_PHASE_ID)!;
}

export function isDefaultPhase(id: string | null | undefined): boolean {
  return findPhase(id).id === DEFAULT_PHASE_ID;
}

/** Index of a phase in DAY_PHASES, for stepping the dial. */
export function phaseIndex(id: string | null | undefined): number {
  const i = DAY_PHASES.findIndex((p) => p.id === findPhase(id).id);
  return i < 0 ? DAY_PHASES.findIndex((p) => p.id === DEFAULT_PHASE_ID) : i;
}

/**
 * Angle of the indicator, in degrees clockwise from the top.
 *
 * Midnight at the top and midday at the bottom would be the astronomer's
 * convention (the sun is beneath your feet at midnight). This uses the opposite —
 * MIDDAY AT THE TOP — because the dial reads as a sun crossing a sky, and a sun
 * that is highest when it is brightest is the thing everyone already knows.
 */
export function phaseAngle(id: string | null | undefined): number {
  const { hour } = findPhase(id);
  return ((hour - 12) / 24) * 360;
}


/**
 * The phase nearest a bearing, in degrees clockwise from the top.
 *
 * The inverse of phaseAngle, and the whole reason the sun can be DRAGGED: a
 * pointer anywhere around the rim resolves to exactly one stop. Distance is
 * measured on the circle, not on the number line, so a pointer just past
 * midnight snaps back to midnight instead of travelling the long way to dawn.
 */
export function phaseAtAngle(degrees: number): DayPhase {
  const bearing = ((degrees % 360) + 360) % 360;
  let best = DAY_PHASES[0]!;
  let bestGap = Infinity;
  for (const p of DAY_PHASES) {
    const a = ((phaseAngle(p.id) % 360) + 360) % 360;
    const raw = Math.abs(a - bearing);
    const gap = Math.min(raw, 360 - raw);
    if (gap < bestGap) {
      bestGap = gap;
      best = p;
    }
  }
  return best;
}

/**
 * Bearing of a pointer relative to a circle's centre, degrees clockwise from
 * the top — the convention phaseAngle already uses, so the two compose.
 */
export function bearingFromCentre(dx: number, dy: number): number {
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}
