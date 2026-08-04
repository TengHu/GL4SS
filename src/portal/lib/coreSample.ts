/**
 * THE CORE SAMPLE — one place, photographed at many stations, from one spot.
 *
 * The dial already lets you stand somewhere and change when you are. This takes
 * the same coordinate and sweeps it: N stations, rendered in chronological
 * order, each one handed the previous frame as an input image so the camera does
 * not wander between eras. Played back, it is a single hillside moving from
 * floodplain to ice to forest to farmland to street.
 *
 * THREE DECISIONS WORTH KNOWING ABOUT
 *
 * 1. IMAGES ARE SEQUENTIAL, SCENE DIRECTION IS NOT.
 *    Frame N needs frame N-1 to exist, so the image calls cannot be parallelised
 *    — that is the whole mechanism. The planning calls have no such dependency,
 *    so they run ahead of the cursor a few at a time and are waiting by the time
 *    the renderer arrives. On a 24-frame sweep that removes roughly four minutes
 *    of pure text latency from the wall clock.
 *
 * 2. NOTHING HERE IS WRITTEN TO THE FRAME STORE.
 *    A chained frame is conditioned on its predecessor: it is an artifact of
 *    THIS sweep, not an independent photograph of that spacetime. Persisting it
 *    under sceneKey() would quietly overwrite the archive with frames that only
 *    make sense in sequence, and a later visit to that station would restore one
 *    as though it were an ordinary frame — the same class of silent corruption
 *    as the phaseId-dropping restore documented in engine.ts. A sample lives for
 *    the session, like a film. The warning says so before a penny is spent.
 *
 * 3. A BROKEN FRAME DOES NOT BREAK THE SWEEP.
 *    Moderation, a timeout or a dead model kills one station; the run continues
 *    from the last frame that did render, so the chain re-anchors rather than
 *    collapsing. Twenty-three good frames with a gap at station nine is a
 *    result. Twenty-four abandoned because station nine contained a battle is
 *    not — and the user has already paid for the nine.
 */

import type { Coordinates } from '../../types';
import {
  generateSceneDirection,
  planStandpoint,
  imageModelForMode,
  videoModelSupports,
} from '../../lib/openrouter';
import type { ModelSelection, VideoModelCapability } from '../../lib/openrouter';
import { audioForSequence, renderClip, renderStill } from './render';
import { explainFailure } from '../../lib/failure';
import { buildSweepPrompts } from '../../lib/promptcraft';
import { compositeCutout, segmentAnachronisms } from './timeMask';
import { cameraIsUsable, horizonFraction } from './cameraSkeleton';
import type { StandpointCamera } from '../../lib/openrouter';
import type { SceneDirection } from '../../lib/promptcraft';
import { MAX_YEAR, MIN_YEAR, formatYear } from '../../lib/format';
import { findPhase } from './daylight';
import { STATIONS, nearestStationIndex } from './stations';
import { getFrame } from './frameStore';
import { sceneKey } from './engine';

// ============================================================================
// PLANNING THE SWEEP
// ============================================================================

export interface SampleSpan {
  id: string;
  label: string;
  /** What the span actually covers, in the user's terms. */
  blurb: string;
  fromYear: number;
  toYear: number;
  /**
   * How frames are distributed across the span.
   *
   * 'linear' is even in YEARS — every frame is the same interval after the last,
   * which is what "a timelapse of this period" means to anyone looking at it.
   *
   * 'log' is even in the ORDER OF MAGNITUDE of years before present, and exists
   * for the deep span alone. Linear across 252 million years puts seven of eight
   * frames in the Mesozoic and one in the last two thousand: an accurate picture
   * of where the time is, and a useless film. Log is the scale the ladder itself
   * is built on — its step sizes grow by orders of magnitude — so this is the
   * same judgement applied to sampling.
   */
  curve: 'linear' | 'log';
}

/**
 * The present, for the log curve — and the ladder's own fixed boundary rather
 * than the real clock. `1900 → 2030` is annual precisely so the station grid
 * does not move as the calendar advances (stations.ts), and a sampling scheme
 * that drifted year by year would hand a different sweep to the same request in
 * 2027 than it did in 2026.
 */
const PRESENT = 2030;

/**
 * Four spans rather than a free range control.
 *
 * The ladder is not linear — a station is 25 million years wide at one end and
 * one year wide at the other — so "pick two years" would produce sweeps whose
 * character the user could not predict from the numbers. Naming the four that
 * are actually interesting is both simpler and more honest about what the
 * instrument does.
 */
export const SAMPLE_SPANS: SampleSpan[] = [
  {
    id: 'deep',
    label: 'All of time',
    blurb: 'the Great Dying to 3050',
    fromYear: MIN_YEAR,
    toYear: MAX_YEAR,
    curve: 'log',
  },
  {
    id: 'ice',
    label: 'Since the ice',
    blurb: 'the last glacial maximum to now',
    fromYear: -20000,
    toYear: 2030,
    curve: 'linear',
  },
  {
    id: 'recorded',
    label: 'Recorded history',
    blurb: '3000 BC to now',
    fromYear: -3000,
    toYear: 2030,
    curve: 'linear',
  },
  {
    id: 'memory',
    label: 'Living memory',
    blurb: '1900 to 2030, year by year',
    fromYear: 1900,
    toYear: 2030,
    curve: 'linear',
  },
];

/**
 * Frame counts on offer.
 *
 * 2 and 4 are here to be cheap rather than to be good. A sweep is the most
 * expensive thing in the app and a film over it is several times that again, so
 * there has to be a way to answer "does the chaining actually hold this camera
 * still, and will this provider take a closing frame" for the price of a couple
 * of images rather than twenty-four.
 *
 * 2 is the smallest sweep that is still a sweep: one anchor, one chained frame,
 * and — if filmed — exactly one clip. That is the whole mechanism end to end,
 * and nothing smaller tests anything.
 */
export const SAMPLE_LENGTHS = [2, 4, 8, 16, 24] as const;

export function findSpan(id: string): SampleSpan {
  return SAMPLE_SPANS.find((s) => s.id === id) ?? SAMPLE_SPANS[0]!;
}

/**
 * The years a sweep should ideally land on, before the ladder gets a say.
 *
 * Endpoints are always included: a sweep that stops one station short of the era
 * it is named for reads as a bug even when the spacing is right.
 */
function sampleTargets(span: SampleSpan, n: number): number[] {
  if (span.curve === 'linear') {
    return Array.from(
      { length: n },
      (_, i) => span.fromYear + ((span.toYear - span.fromYear) * i) / (n - 1),
    );
  }

  /**
   * Log time, measured backwards from PRESENT.
   *
   * Future years have no logarithm of "years ago", so the part of the span past
   * PRESENT is not distributed at all — it gets the final frame and nothing
   * else. That is the right weighting anyway: 3050 is one station's worth of
   * speculation hanging off the end of 252 million years of evidence.
   */
  const future = span.toYear > PRESENT;
  const k = future ? n - 1 : n;
  const oldest = Math.max(1, PRESENT - span.fromYear);
  const targets = Array.from({ length: k }, (_, i) => {
    const ago = Math.exp(Math.log(oldest) * (1 - i / (k - 1)));
    return PRESENT - ago;
  });
  if (future) targets.push(span.toYear);
  return targets;
}

/**
 * The station years this sweep will visit, ascending.
 *
 * Two failure modes had to be avoided at once, and each is the other's cure.
 *
 * SPACING BY STATION INDEX oversamples wherever the ladder is dense — and the
 * ladder is dense in living memory, where `1900 → 2030` is annual and therefore
 * holds 130 of the 284 stations. Under index spacing "All of time" put five of
 * its eight frames in the 20th century: a sweep across 252 million years that
 * spent half its budget on 122 years of it. The comment that used to sit here
 * defended index spacing as following "the ladder's own judgement about where
 * resolution is worth having", which was wrong about why that rung exists — it
 * is annual so the dial can REACH 1969 and the year you were born, not because
 * a year in 1950 carries as much change as 25 million years in the Triassic.
 *
 * SPACING BY YEAR fixes the weighting and then loses frames. The ladder has
 * exactly two stations between 20,000 BC and 10,000 BC, so eight evenly spaced
 * targets across "Since the ice" collapsed onto six distinct years — the user
 * asked for eight frames and silently got six.
 *
 * So: targets are chosen in TIME (see sampleTargets), then each is snapped to
 * the nearest station NOT ALREADY TAKEN, walking outward when it is. The
 * distribution is as even as the instrument permits, and the count is always
 * the count that was asked for and quoted.
 */
/**
 * Fixed steps, offered beside the spans.
 *
 * A span answers "cover this stretch of history in N pictures" and lets the gap
 * fall where it may — which is how a sweep ends up jumping forty-three years in
 * one step. A gap answers the other question: "every N years, from where I am
 * standing", and the gap is the thing that actually decides whether a frame
 * holds. Short steps come back nearly identical to their neighbour; long ones
 * come back as a different photograph, and no amount of prompting has changed
 * that.
 */
export const SAMPLE_GAPS = [20, 50, 100] as const;

/**
 * Stations every `gap` years, growing OUTWARD FROM THE SEED in both directions.
 *
 * From the seed rather than from the start of an era, because the seed is the
 * one frame pinned to a real photograph and everything else is drawn from its
 * neighbour. Walking outward keeps the small steps nearest the evidence, where
 * they are worth most.
 *
 * Alternating past and future so a count that runs out mid-way leaves a sweep
 * centred on the seed rather than one that only goes backwards.
 */
export function planGapSample(seedYear: number, gap: number, count: number): number[] {
  const seed = STATIONS[nearestStationIndex(seedYear)]!;
  const used = new Set<number>([seed]);

  for (let step = 1; used.size < count; step++) {
    const before = used.size;
    for (const year of [seed - step * gap, seed + step * gap]) {
      if (used.size >= count) break;
      if (year < MIN_YEAR || year > MAX_YEAR) continue;
      // Snapped, because the runner keys every frame by station: an off-ladder
      // year renders as its neighbour and shows up twice under two labels.
      used.add(STATIONS[nearestStationIndex(year)]!);
    }
    // Both directions off the end of the ladder, or both snapping onto stations
    // already taken — either way there is nothing further out to reach.
    if (used.size === before) break;
  }

  return [...used].sort((a, b) => a - b);
}

export function planSample(span: SampleSpan, count: number): number[] {
  const lo = nearestStationIndex(span.fromYear);
  const hi = nearestStationIndex(span.toYear);
  const [from, to] = lo <= hi ? [lo, hi] : [hi, lo];
  const available = to - from + 1;
  const n = Math.max(2, Math.min(count, available));

  const used = new Set<number>();
  for (const target of sampleTargets(span, n)) {
    let idx = nearestStationIndex(target);
    if (used.has(idx)) {
      // Nearest free station on either side. Bounded by `available`, so this
      // cannot run past the ends of the span even if every candidate is taken.
      for (let r = 1; r <= available; r++) {
        const free = [idx + r, idx - r].find((c) => c >= from && c <= to && !used.has(c));
        if (free !== undefined) {
          idx = free;
          break;
        }
      }
    }
    // Still taken means the span is full — nothing left to move to.
    if (used.has(idx)) continue;
    used.add(idx);
  }

  // Indices came from nearestStationIndex or a bounded walk inside [from, to],
  // so every one of them addresses a real station.
  return [...used].sort((a, b) => a - b).map((i) => STATIONS[i]!);
}

// ============================================================================
// STATE
// ============================================================================

export type SampleFrameStatus = 'pending' | 'directing' | 'rendering' | 'ready' | 'error';

export interface SampleFrame {
  year: number;
  status: SampleFrameStatus;
  url?: string;
  narrative?: string;
  error?: string;
  /** True when this came from the archive rather than the models. */
  restored?: boolean;
  /**
   * False when this frame was rendered without the previous one attached —
   * either it is the anchor, or the provider refused the input image. Surfaced
   * because it is the visible defect in a finished sweep: an unchained frame is
   * where the camera jumps.
   */
  chained?: boolean;
  /**
   * The camera moved, measured rather than guessed — see measureDrift.
   *
   * Set when the frame that came back was taken from a materially different
   * position than the seed. A short human-readable phrase, because the point is
   * that the visitor can SEE which frames broke the series instead of having to
   * spot it by eye and file a bug. Undefined means either no drift or no
   * measurement — `driftChecked` tells them apart.
   */
  drift?: string;
  /** True when the drift check actually ran on this frame. */
  driftChecked?: boolean;
  /**
   * This frame was cut from a station that has since been re-rendered.
   *
   * It is not wrong, it is inconsistent: it was drawn from a picture that no
   * longer exists. Marked rather than silently re-rendered, because re-rendering
   * is more money and whether the inconsistency matters is the visitor's call.
   */
  stale?: boolean;
}

/**
 * A clip spanning two adjacent ready frames.
 *
 * Held apart from SampleFrame because a clip is not a property of a station: it
 * is what happens BETWEEN two of them, and `from` indexes the ready frames
 * rather than the sweep, so a sample with a failed station in the middle still
 * films across the gap instead of producing a clip that goes nowhere.
 */
export interface SampleClip {
  /** Index into the READY frames. This clip runs from `from` to `from + 1`. */
  from: number;
  status: 'pending' | 'rendering' | 'ready' | 'error';
  url?: string;
  error?: string;
  /** Provider's coarse stage, so a multi-minute wait talks. */
  stage?: string;
  /**
   * False when `last_frame` was refused and the clip was rendered from its
   * opening frame alone. It will NOT land on the next still, so the join after
   * it is a visible cut — which is the whole thing this feature exists to avoid,
   * and therefore has to be said out loud rather than quietly tolerated.
   */
  pinned?: boolean;
}

export type FilmStatus = 'none' | 'rendering' | 'done' | 'cancelled';

export type CoreSampleStatus = 'idle' | 'running' | 'done' | 'cancelled';

export interface CoreSampleState {
  status: CoreSampleStatus;
  frames: SampleFrame[];
  location: string;
  coordinates: Coordinates;
  styleId: string;
  phaseId?: string;
  /** Index the renderer is working on, for progress. */
  cursor: number;
  startedAt?: number;
  /** Frames that reached 'ready'. */
  done: number;
  /** The interpolation pass. Empty until the user asks for a film. */
  clips: SampleClip[];
  filmStatus: FilmStatus;
  filmStartedAt?: number;
  filmError?: string;
}

const IDLE: CoreSampleState = {
  status: 'idle',
  frames: [],
  location: '',
  coordinates: { lat: 0, lng: 0 },
  styleId: '',
  cursor: 0,
  done: 0,
  clips: [],
  filmStatus: 'none',
};

export interface SampleConfig {
  apiKey: string;
  models: ModelSelection;
  styleOverride: string | null;
  /** The Period Process style is active — see promptcraft's PERIOD_PROCESSES. */
  periodProcess?: boolean;
  template?: string;
}

export interface SampleRequest {
  years: number[];
  coordinates: Coordinates;
  location: string;
  styleId: string;
  phaseId?: string;
  /**
   * The year the sweep grows OUT of — the station the lever was pulled at, and
   * the one whose picture is already on the glass.
   *
   * Absent, or not in `years`, and the sweep falls back to growing forward from
   * the earliest year, which is what it always did.
   */
  anchorYear?: number;
}

/** Clips rendered at once. See renderFilm — they are independent, unlike stills. */
const FILM_CONCURRENCY = 3;

export interface FilmOptions {
  model: string;
  /** Seconds per clip. Short: this is a transition, not a scene. */
  seconds: number;
  resolution: '720p' | '1080p';
}

/**
 * Order of preference when the selected video model cannot pin a closing frame.
 *
 * Quality first, because a film pass is opt-in and already expensive; someone
 * who has decided to spend on it is not looking to save a third of it. Every id
 * here reported `supported_frame_images: ['first_frame','last_frame']` from the
 * live capability table on 2026-08-01, but the table is still consulted at
 * runtime rather than trusted from this list — a hardcoded capability is a
 * hardcoded capability, and providers change.
 */
export const FILM_MODEL_PREFERENCE = [
  /**
   * Veo first, on the one axis this feature is actually judged by. Measured
   * across published comparisons it holds the camera locked for a full ten
   * seconds in 82% of tests, against Seedance and Kling — and a wandering camera
   * is the entire defect a pinned clip exists to prevent. Seedance ranks higher
   * overall and holds a SUBJECT better, which is not the problem here.
   *
   * Its ceiling is 8 seconds where the others reach 15, so a long slow drift
   * across a wide year gap is the case where the next entry wins.
   */
  'google/veo-3.1',
  /**
   * Kling O1 second: the only model in the catalogue whose stated purpose is
   * start-to-end frame transitions and morphs, which is this operation by name,
   * and Kling scores best on temporal consistency without morphing artifacts —
   * the failure mode of a long transition.
   */
  'kwaivgi/kling-video-o1',
  'bytedance/seedance-2.0',
  'google/veo-3.1-fast',
  'kwaivgi/kling-v3.0-pro',
  'minimax/hailuo-3',
  'google/veo-3.1-lite',
  'alibaba/wan-2.7',
];

export interface FilmModelChoice {
  model: string;
  /** Why this one. 'selected' = the user's own pick was capable. */
  reason: 'selected' | 'substituted' | 'unknown';
  /** The model the user actually chose, when it had to be passed over. */
  displaced?: string;
}

/**
 * Pick the model that will render the film.
 *
 * The app's default cinematic model is `x-ai/grok-imagine-video`, which is
 * first_frame only — so on a fresh install the user's selection CANNOT produce
 * a seamless film, and silently rendering twenty-three clips with a visible cut
 * at every join would be spending their money on the exact thing they asked to
 * avoid. Substituting is the right call, and saying so in the dialog is what
 * makes it honest rather than sneaky.
 *
 * `unknown` means the capability table could not be read. Proceed on the user's
 * selection rather than substituting on a guess, and let the dialog say the
 * check did not happen.
 */
export function chooseFilmModel(
  caps: VideoModelCapability[] | null,
  selected: string,
): FilmModelChoice {
  const supported = videoModelSupports(caps, selected, 'last_frame');
  if (supported === undefined) return { model: selected, reason: 'unknown' };
  if (supported) return { model: selected, reason: 'selected' };
  const better = FILM_MODEL_PREFERENCE.find(
    (id) => videoModelSupports(caps, id, 'last_frame') === true,
  );
  return better
    ? { model: better, reason: 'substituted', displaced: selected }
    : { model: selected, reason: 'unknown' };
}

/**
 * Clip length the model will actually accept, nearest to `wanted`.
 *
 * Veo offers only 4/6/8 while Seedance offers 4-15, and sending an unsupported
 * duration is a 400 — after the user has confirmed a price. Clamping to the
 * table means the quote and the request cannot disagree.
 */
export function clampClipSeconds(
  caps: VideoModelCapability[] | null,
  modelId: string,
  wanted: number,
): number {
  const durations = caps?.find((m) => m.id === modelId)?.supported_durations;
  if (!durations?.length) return wanted;
  return durations.reduce((best, d) =>
    Math.abs(d - wanted) < Math.abs(best - wanted) ? d : best,
  );
}

/** Highest resolution this model offers, capped at 1080p — see the note in the dialog. */
export function bestFilmResolution(
  caps: VideoModelCapability[] | null,
  modelId: string,
): '720p' | '1080p' {
  const res = caps?.find((m) => m.id === modelId)?.supported_resolutions;
  return res?.includes('1080p') ? '1080p' : '720p';
}

/**
 * THE CAMERA, IN NUMBERS — for the clip that lost its closing pin.
 *
 * The same six figures the perspective grid is drawn from, said as figures. The
 * grid itself cannot come here: it is painted only INTO a cut-out's erased
 * regions, and a clip's frames have none — every pixel of them already states
 * the camera. Drawn onto a `first_frame` it would simply be reproduced, because
 * that frame is the first frame of the output rather than something to refill.
 *
 * Prose alone is the approach cameraSkeleton.ts records as having measurably
 * FAILED for stills: across one Colosseum sweep it fixed the lens (74° against
 * 72°) and let the camera climb 1.6 m and level out by 6.2°. "No pan, no zoom,
 * no dolly" is that same prose. The numbers cost nothing — they are in hand
 * before any clip is submitted — and they are the two quantities that drifted.
 */
function describeCamera(cam: StandpointCamera): string {
  const tilt =
    Math.abs(cam.tiltDeg) < 1
      ? 'level'
      : `tilted ${Math.abs(cam.tiltDeg).toFixed(0)}° ${cam.tiltDeg > 0 ? 'down' : 'up'}`;
  return (
    `Hold this camera for the whole shot: ${cam.hfovDeg.toFixed(0)}° horizontal field of ` +
    `view, lens ${cam.eyeHeightM.toFixed(1)} m above the ground, ${tilt}, nearest ` +
    `subject about ${cam.nearestM.toFixed(0)} m away. The horizon must not rise or fall. `
  );
}

/**
 * HOW FAR THE HORIZON MAY MOVE before the frame is a different viewpoint.
 *
 * As a fraction of frame height, and RAISED after the ruler was calibrated.
 *
 * It was 8%, chosen to sit under the 13.4% that cameraSkeleton.ts records for
 * the drift this mechanism exists to stop, and "above the noise" — which was an
 * assumption, not a measurement. Measured: the same unchanged seed read twice
 * came back with tilt 18° and tilt 12°. At 65° field of view on 16:9 those put
 * the horizon at 0.047 and 0.203 of frame height, so the noise floor is about
 * 16% — twice the threshold that was supposed to sit above it. Every horizon
 * drift reported before this was as likely the estimator as the camera.
 *
 * 20% clears the measured floor. It also puts the threshold above the real
 * effect it was built to catch, which is the honest position: with an estimator
 * this noisy in tilt, the horizon cannot detect that drift at all, and pretending
 * otherwise is worse than not measuring. HEIGHT is the half that survived
 * calibration — 0% disagreement across two reads — and it is what to trust.
 */
const DRIFT_HORIZON = 0.2;

/**
 * Relative change in lens height that counts as a different vantage.
 *
 * THE FLOOR IS 0 TO 22%, measured, and the first of those two numbers was
 * published here as though it were the answer. One calibration returned 45m
 * against 45m and this comment called height "the trustworthy half"; the next
 * returned 45m against 35m. A noise floor from a single sample is not a noise
 * floor, and the claim should not have been made from one.
 *
 * 40% still clears the observed spread, and the effect clears it comfortably:
 * every run has moved the same way — 120 to 45, 65 to 45, 115 to 7, 110 to 65,
 * 45 to 22, 45 to 12 — always down, never up, with the reference accepted and
 * twice untouched. A bias that consistent in sign is not scatter, whatever the
 * per-reading error. But the magnitudes carry ±20%, and any conclusion that
 * needs them finer than that needs a better ruler first.
 */
const DRIFT_HEIGHT = 0.4;

/**
 * MEASURE THE VIEWPOINT INSTEAD OF TRUSTING THE PROMPT.
 *
 * Every failure in this file's history was found by a human looking at a picture
 * and saying "that is not the same camera". The quantities involved are ones the
 * app already extracts — planStandpoint reads eye height, tilt and field of view
 * out of an image — so the comparison is arithmetic, not judgement.
 *
 * WHY THE HORIZON, and not the three numbers separately. Tilt and field of view
 * trade off against each other: a wider lens and a steeper tilt can put the
 * horizon in the same place, and that frame is not drifted, it is the same view
 * through different glass. horizonFraction folds both into the single number
 * that says where the eye actually is, and it is the number cameraSkeleton was
 * measured in. Height is checked separately because a camera can climb without
 * the horizon moving at all — the 1900 postcard was both.
 *
 * REPORTS, DOES NOT RETRY. A re-render is another charge on the visitor's key
 * and silently doubling the bill to fix a frame they might have been happy with
 * is not this function's decision to make. It costs one text call per frame and
 * only runs when there is a seed camera to compare against, so a sweep whose
 * standpoint failed pays nothing for a comparison it could not make anyway.
 */
function measureDrift(
  seed: StandpointCamera,
  frame: StandpointCamera,
): string | undefined {
  const ASPECT = 16 / 9;
  const dHorizon =
    horizonFraction(frame.hfovDeg, frame.tiltDeg, ASPECT) -
    horizonFraction(seed.hfovDeg, seed.tiltDeg, ASPECT);
  const dHeight = (frame.eyeHeightM - seed.eyeHeightM) / Math.max(seed.eyeHeightM, 0.3);

  const notes: string[] = [];
  if (Math.abs(dHorizon) > DRIFT_HORIZON) {
    notes.push(
      `the horizon moved ${Math.round(Math.abs(dHorizon) * 100)}% of the frame ` +
        `${dHorizon > 0 ? 'down' : 'up'}`,
    );
  }
  if (Math.abs(dHeight) > DRIFT_HEIGHT) {
    notes.push(
      `the camera ${dHeight > 0 ? 'rose' : 'dropped'} from ${seed.eyeHeightM.toFixed(0)}m ` +
        `to ${frame.eyeHeightM.toFixed(0)}m`,
    );
  }
  return notes.length ? notes.join(', ') : undefined;
}

/**
 * WHAT THE MODEL WAS ACTUALLY HANDED, per frame, on `window.__sweep`.
 *
 * Every diagnosis this file has been through was an argument about a prompt
 * nobody could read and an attachment nobody could look at — the vantage
 * collapse, the doubled Colosseum, the silhouette. Each was settled, eventually,
 * by reasoning from a screenshot, and twice the reasoning was wrong. The two
 * artifacts that would have answered any of them in a glance are the assembled
 * prompt and the cut-out image, and neither was recorded anywhere.
 *
 * Written OUTSIDE the state and outside React: this is not a feature, nothing
 * renders it, and it must not become a thing the sweep maintains. It is a
 * window onto the last run, and the last run only.
 *
 *   open(window.__sweep[1987].cutout)    the picture the model was given
 *   copy(window.__sweep[1987].prompt)    the words it was given with it
 */
export interface SweepDebugEntry {
  from?: number;
  anachronisms: number;
  absent: number;
  attached: 'cut-out' | 'whole source' | 'nothing';
  /** Data URL. Paste into a tab to see exactly what was sent. */
  cutout?: string;
  /** The candidate actually tried first. */
  prompt: string;
  /** What a refused attachment would have fallen back to. */
  promptFallback: string;
  /** Filled in once the frame lands. */
  url?: string;
  /** Whether the provider actually ACCEPTED the attachment, or refused it. */
  anchored?: boolean;
}

function sweepDebug(): Record<number, SweepDebugEntry> {
  const w = window as unknown as { __sweep?: Record<number, SweepDebugEntry> };
  if (!w.__sweep) w.__sweep = {};
  return w.__sweep;
}

/**
 * What a transition clip is asked to be.
 *
 * Deliberately about the CAMERA HOLDING STILL while the world moves through it.
 * Asking for "a transition from X to Y" invites a cross-dissolve or a whip pan —
 * an editing effect between two pictures — when what is wanted is one unbroken
 * shot in which time passes. The years are named because the model is being
 * asked to cover a specific interval, and "centuries" and "eleven years" want
 * visibly different rates of change.
 *
 * `camera` is spent ONLY on the unpinned wording, and that is the whole point of
 * having it. A clip pinned at both ends cannot drift at its ends — it starts on
 * a real frame and lands on a real frame, and the geometry is stated by those
 * pixels far better than four numbers could. Drop the closing pin and that
 * guarantee is gone: the clip is free to wander to somewhere the next clip does
 * not begin. The numbers go exactly where the structure stopped holding.
 */
function buildTransitionPrompt(
  location: string,
  from: number,
  to: number,
  pinned: boolean,
  camera?: StandpointCamera,
): string {
  return (
    `One continuous shot at ${location}, from a camera standing in one place. ` +
    `The viewpoint is fixed: no pan, no zoom, no dolly — only the small settling a ` +
    `camera makes on a tripod. ` +
    (!pinned && camera && cameraIsUsable(camera) ? describeCamera(camera) : '') +
    /**
     * WHAT STAYS, SAID BEFORE WHAT CHANGES.
     *
     * Most of this view is identical in both pictures, and nothing said so. The
     * shot was described entirely in terms of transformation — "time carries the
     * place from 1900 to 1943" — which is a brief for changing everything, and
     * the model changed everything, all at once, in the middle.
     */
    `MOST OF THIS VIEW IS THE SAME IN BOTH PICTURES AND HOLDS STILL THROUGHOUT: the ` +
    `ground, the walls, the standing structures and the horizon keep their exact ` +
    `position and size from the first frame to the last. ` +
    /**
     * CHANGE BY SUBSTITUTION, ONE THING AT A TIME.
     *
     * The defect this exists for: asked to cross forty-three years in four
     * seconds, the model covered it the way an editor would — a whip and a blur
     * through which nothing is legible — because it cannot plausibly walk 1900
     * out and 1943 in that fast. It reinvented the world at a stroke because the
     * shot as described was a stroke.
     *
     * Naming the mechanism instead: things ARRIVE and LEAVE, each at its own
     * moment. That is also the honest description of how a place actually
     * changes, and it degrades gracefully — a step small enough for real
     * substitution gets it, and a step too large at least gets several separate
     * changes rather than one total one.
     */
    `WHAT CHANGES, CHANGES ONE THING AT A TIME, each in its own place and at its ` +
    `own moment: a figure walks out of frame while another walks in somewhere ` +
    `else, a vehicle passes and a later one arrives, a surface weathers, planting ` +
    `grows or is cleared, something is taken down and something else stands there ` +
    `afterwards. ` +
    /**
     * The positive form of "no blur, no whip, no morph". Naming those risks
     * summoning them — this file's rule — and a frame that is a readable
     * photograph cannot be any of them.
     */
    `Paused at any instant, this shot is an ordinary sharp photograph of this ` +
    `place, and there is no moment at which the whole view becomes something ` +
    `else at once. ` +
    `Time carries it from ${formatYear(from)} to ${formatYear(to)}: the light ` +
    `moves, weather passes, growth and water shift, and what stands here is ` +
    `built, weathers or goes. ` +
    (pinned
      ? /**
         * The sentence this replaces read "take whatever small reframing is
         * needed to arrive there exactly" — an explicit licence to move the
         * camera, and with endpoints whose vantages disagree, "small" becomes a
         * whip-pan. It was the instruction producing the defect.
         */
        `Begin on the first attached image and finish on the second. Arrive at the ` +
        `second picture by letting the things in it arrive, one at a time, into a ` +
        `frame that has not moved. `
      : `Begin on the attached image and carry it forward through that interval. `) +
    `No cuts, no dissolves, no title cards.`
  );
}

// ============================================================================
// THE RUNNER
// ============================================================================

/**
 * WHAT A STATION NEEDS THAT IS NOT THE STATION.
 *
 * Established once per sweep and reused: the config and request, the resolved
 * image model, the standpoint read off the seed, and the three closures that
 * decide what a station is cut from and planned against. Held so that a single
 * frame can be re-rendered later without re-running everything that produced
 * the context it needs.
 */
interface RunContext {
  config: SampleConfig;
  request: SampleRequest;
  phase: string;
  model: string;
  camera?: StandpointCamera;
  standpoint: string;
  standpointCamera: string;
  cutSource: (i: number) => { url: string; year: number } | undefined;
  referenceForPlanner: (i: number) => { url: string; year: number } | undefined;
  planAt: (i: number, findings: string[]) => Promise<SceneDirection>;
}

export class CoreSampleRunner {
  private state: CoreSampleState = IDLE;
  /** Set by start(); see RunContext. Null before the first sweep. */
  private run: RunContext | null = null;
  private listeners = new Set<() => void>();
  private abort: AbortController | null = null;
  /**
   * The standpoint's camera numbers, kept from the sweep for the film pass.
   *
   * Off the state rather than on it: nothing renders it, and CoreSampleState is
   * the snapshot every subscriber re-reads. It is written once per sweep, read
   * only by a clip that lost its closing pin, and cleared in start() so a second
   * sweep cannot film against the first sweep's viewpoint.
   */
  private camera: StandpointCamera | undefined;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): CoreSampleState => this.state;

  get isRunning(): boolean {
    return this.state.status === 'running';
  }

  private emit(next: Partial<CoreSampleState>): void {
    this.state = { ...this.state, ...next };
    for (const fn of this.listeners) fn();
  }

  private patchFrame(i: number, next: Partial<SampleFrame>): void {
    const frames = this.state.frames.slice();
    const current = frames[i];
    if (!current) return;
    frames[i] = { ...current, ...next };
    this.emit({ frames, done: frames.filter((f) => f.status === 'ready').length });
  }

  /** Abandon the run. Frames already rendered stay on screen — they were paid for. */
  cancel(): void {
    this.abort?.abort();
    this.abort = null;
    if (this.state.status === 'running') this.emit({ status: 'cancelled' });
    if (this.state.filmStatus === 'rendering') this.emit({ filmStatus: 'cancelled' });
  }

  /** Throw the whole sample away and return to the dial. */
  clear(): void {
    this.abort?.abort();
    this.abort = null;
    // Clips are blob: URLs the browser holds until told otherwise; dropping the
    // state without revoking leaks every one of them for the session. Same
    // lesson as evictMemory() in engine.ts.
    for (const clip of this.state.clips) {
      if (clip.url?.startsWith('blob:')) URL.revokeObjectURL(clip.url);
    }
    this.state = IDLE;
    for (const fn of this.listeners) fn();
  }

  /** The ready frames, in order. The film runs between adjacent members of this. */
  readyFrames(): SampleFrame[] {
    return this.state.frames.filter((f) => f.status === 'ready' && f.url);
  }

  private patchClip(i: number, next: Partial<SampleClip>): void {
    const clips = this.state.clips.slice();
    const current = clips[i];
    if (!current) return;
    clips[i] = { ...current, ...next };
    this.emit({ clips });
  }

  /**
   * Render the sample as a continuous film.
   *
   * One clip per adjacent PAIR of ready frames, each generated with both ends
   * pinned — `first_frame` is the still we already have, `last_frame` is the
   * next one. That is the whole trick: clip N finishes on the exact image clip
   * N+1 opens on, so the joins have nothing to conceal. Anchored at one end
   * only, each clip would wander off to somewhere the next clip does not begin,
   * and the result would be what it is trying not to be — a row of separate
   * clips with a jump at every seam.
   *
   * UNLIKE THE STILLS, THESE RUN IN PARALLEL. Every clip already knows both of
   * its endpoints, so no clip waits on another; the sequential discipline that
   * governs the sweep does not apply here and would cost an hour of wall clock
   * for nothing. Bounded, because each one is a real charge.
   *
   * Audio follows the clip COUNT rather than a preference — see
   * `audioForSequence` in film.ts. A sweep of two frames films to a single clip
   * and keeps its sound; anything longer goes silent, because a per-clip score
   * would cut to an unrelated soundtrack at every join.
   */
  async renderFilm(config: SampleConfig, opts: FilmOptions): Promise<void> {
    if (this.state.filmStatus === 'rendering') return;
    const frames = this.readyFrames();
    if (frames.length < 2) return;

    const abort = new AbortController();
    this.abort = abort;

    const clips: SampleClip[] = [];
    for (let i = 0; i < frames.length - 1; i++) clips.push({ from: i, status: 'pending' });
    this.emit({
      clips,
      filmStatus: 'rendering',
      filmStartedAt: Date.now(),
      filmError: undefined,
    });

    const render = async (i: number): Promise<void> => {
      const a = frames[i];
      const b = frames[i + 1];
      if (!a?.url || !b?.url || abort.signal.aborted) return;

      this.patchClip(i, { status: 'rendering', stage: 'submitting' });

      try {
        // Both ends offered, always. renderClip steps down to an opening frame
        // only if the provider refuses the closing one, and reports which
        // happened — see film.ts, which the single-station film shares.
        const { url, pinned } = await renderClip(
          config.apiKey,
          {
            prompt: buildTransitionPrompt(this.state.location, a.year, b.year, true),
            // The fallback carries the camera numbers; the pinned wording does
            // not need them. See buildTransitionPrompt.
            unpinnedPrompt: buildTransitionPrompt(
              this.state.location,
              a.year,
              b.year,
              false,
              this.camera,
            ),
            model: opts.model,
            seconds: opts.seconds,
            resolution: opts.resolution,
            first: a.url,
            last: b.url,
            audio: audioForSequence(frames.length - 1),
          },
          {
            signal: abort.signal,
            onStatus: (job) => this.patchClip(i, { stage: job.status }),
            onDegrade: (note) => this.patchClip(i, { stage: note }),
          },
        );
        if (abort.signal.aborted) return;
        this.patchClip(i, { status: 'ready', url, stage: undefined, pinned });
      } catch (err) {
        if (abort.signal.aborted) return;
        this.patchClip(i, { status: 'error', error: explainFailure(err).title, stage: undefined });
      }
    };

    // A small gate. Video jobs are submit-and-poll, so concurrency is nearly
    // free in wall clock — but each is a real charge, and a provider that rate
    // limits will fail them all at once if we fire twenty-three at it.
    let next = 0;
    const workers = Array.from({ length: Math.min(FILM_CONCURRENCY, clips.length) }, async () => {
      while (!abort.signal.aborted) {
        const i = next++;
        if (i >= clips.length) return;
        await render(i);
      }
    });

    try {
      await Promise.all(workers);
    } finally {
      if (this.abort === abort) this.abort = null;
      // Read through the accessor: the early-return guard at the top narrowed
      // `this.state.filmStatus` for the rest of the body, and TypeScript has no
      // way to know emit() has since written 'rendering' into it.
      if (this.getSnapshot().filmStatus === 'rendering') {
        this.emit({ filmStatus: abort.signal.aborted ? 'cancelled' : 'done' });
      }
    }
  }

  async start(request: SampleRequest, config: SampleConfig): Promise<void> {
    if (this.state.status === 'running') return;
    const abort = new AbortController();
    this.abort = abort;

    this.state = {
      status: 'running',
      frames: request.years.map((year) => ({ year, status: 'pending' })),
      location: request.location,
      coordinates: request.coordinates,
      styleId: request.styleId,
      phaseId: request.phaseId,
      cursor: 0,
      startedAt: Date.now(),
      done: 0,
      clips: [],
      filmStatus: 'none',
    };
    // A new sweep must not film against the previous sweep's viewpoint.
    this.camera = undefined;
    // The debug window shows the LAST run. Mixing two runs in it would recreate
    // the exact confusion it exists to end.
    (window as unknown as { __sweep?: unknown }).__sweep = {};
    for (const fn of this.listeners) fn();

    const model = imageModelForMode('wide-field', config.models);
    const phase = findPhase(request.phaseId).prompt;

    /**
     * Planning runs ahead of rendering, bounded.
     *
     * Unbounded, a 24-frame sweep would fire 24 text calls in the first second
     * and rate-limit itself before a single image existed. The lookahead keeps a
     * small queue warm without turning the opening moment into a burst.
     */
    /**
     * THE SWEEP GROWS OUT OF THE SEED, IN BOTH DIRECTIONS.
     *
     * The seed is the station the lever was pulled at — the picture already on
     * the glass, already paid for, already in the archive. Years earlier than
     * it extend backwards; years later extend forwards. Both directions chain
     * the same way, each frame drawn while looking at its neighbour nearer the
     * seed, so one camera position propagates outward through the whole sweep.
     *
     *   1900  ◀──  1980  ──▶  1987  ──▶  2020
     *              seed
     *
     * This used to assume the seed was the EARLIEST year and only ever grow
     * forward. With the lever pulled at 1980 and 1900 in the queue, that
     * ignored the 1980 picture entirely, generated 1900 out of nothing, and
     * charged for a frame the visitor already owned — the one thing the
     * archive exists to prevent.
     *
     * Only the seed is restored from disk. Substituting other owned frames
     * mid-chain would save more money and wreck the product: an unchained
     * frame in the middle is exactly where the camera visibly jumps, and
     * continuity is the entire reason this feature exists.
     */
    const anchor = (() => {
      if (request.anchorYear === undefined) return 0;
      const i = this.state.frames.findIndex((f) => f.year === request.anchorYear);
      return i < 0 ? 0 : i;
    })();

    /**
     * TWO ANCHORS: the neighbour, and the seed.
     *
     * The neighbour one step nearer the seed keeps consecutive frames
     * continuous with each other. The seed keeps the whole sweep faithful to
     * the viewpoint it grew out of — without it the seed's influence passes
     * through every intervening frame and decays, so frame twelve is a copy of
     * a copy of a copy and the camera has quietly walked away.
     *
     * Sending both costs nothing: every image model in the catalog advertises
     * room for several references (FLUX 2 takes 8, Gemini 14) and we sent one.
     *
     * Nearest first, because order is a priority signal — the frame beside
     * this one matters more to it than the origin does.
     */
    /** The years either side of this frame WITHIN THE SWEEP. */
    const sweepNeighbours = (i: number) => ({
      earlier: this.state.frames[i - 1]?.year ?? this.state.frames[i]!.year,
      later: this.state.frames[i + 1]?.year ?? this.state.frames[i]!.year,
    });

    /**
     * THE SEED IS READ, NEVER REDRAWN — and this is the only place it is used.
     *
     * The photograph goes to the planner, which is a vision model: image in,
     * TEXT out. That is the right tool for "what is in this picture and where
     * was the camera", and its output is words, so nothing pictorial can travel
     * with it. The drawing request gets no attachment at all.
     *
     * Whoever reads this next and thinks the drawing request is missing an
     * obvious optimisation: it was there, for four days, and it repainted the
     * same crowd's clothes across ninety years. See ReferenceKind in promptcraft.
     *
     * Falls back to a neighbour when the seed never rendered — some photograph
     * of this spot is better than none for working out what stands here.
     */
    /**
     * WHICH PICTURE GETS CUT — the neighbour, not always the seed.
     *
     * The sweep is one timeline that a viewer watches evolve, and the seed is
     * the point on it that happens to be pinned to a real photograph. It is not
     * the hub. Reading every frame radially off the seed makes each one an
     * independent sample, which is exactly wrong once the seed stops saying
     * anything: a 2010 seed cut for 110 AD comes back 95% grey, so 110 and 111
     * are two unrelated inventions that share only a camera, despite being one
     * year apart and effectively the same world.
     *
     * Cut the neighbour instead and the same 110 frame arrives as 111 with a
     * different crowd, because one year erases almost nothing.
     *
     * THE SEED'S PIXELS STILL REACH THE FAR END. They travel along the chain,
     * surviving wherever history left something standing and being erased where
     * it did not — so its authority decays at exactly the rate the world
     * actually changed, rather than being asserted in full or not at all.
     *
     * SAFE NOW, AND IT WAS NOT BEFORE. The old chain propagated a 1987 crowd
     * into 1900 with only their clothes repainted, but that was chaining UNCUT
     * frames. Every link now passes through the cut, and people are always
     * erased, so nobody can cross one. The camera does not travel in the pixels
     * either — it is in the standpoint text and the grid, both year-independent
     * — so the viewpoint drift chaining used to cause is held by something
     * chaining cannot touch.
     *
     * The cost is that the sweep goes serial: this frame waits for the one
     * beside it. The call count is unchanged — the neighbour is cut INSTEAD of
     * the seed, not as well.
     */
    const cutSource = (i: number): { url: string; year: number } | undefined => {
      if (i === anchor) return undefined;
      // Walk back toward the seed, taking the first frame that actually landed.
      // A failed station must not break the chain behind it.
      const step = i > anchor ? -1 : 1;
      for (let j = i + step; step < 0 ? j >= anchor : j <= anchor; j += step) {
        const f = this.state.frames[j];
        if (f?.status === 'ready' && f.url) return { url: f.url, year: f.year };
      }
      return undefined;
    };

    const referenceForPlanner = (i: number): { url: string; year: number } | undefined => {
      if (i === anchor) return undefined;
      const seedFrame = this.state.frames[anchor];
      if (seedFrame?.status === 'ready' && seedFrame.url) {
        return { url: seedFrame.url, year: seedFrame.year };
      }
      const towardSeed = i > anchor ? i - 1 : i + 1;
      const neighbour = this.state.frames[towardSeed];
      if (neighbour?.status === 'ready' && neighbour.url) {
        return { url: neighbour.url, year: neighbour.year };
      }
      return undefined;
    };

    /**
     * Called once per station, AFTER that station has been segmented, with the
     * labels the vision pass found. No longer prefetched: `findings` is the
     * whole reason the planner now writes edits instead of a scene, and it
     * cannot be known before something has looked at the picture.
     */
    const planAt = (i: number, findings: string[]): Promise<SceneDirection> => {
      const frame = this.state.frames[i]!;
      return generateSceneDirection(
          config.apiKey,
          request.location,
          request.coordinates,
          frame.year,
          'wide-field',
          config.models.text,
          config.styleOverride,
          {
            signal: abort.signal,
            phase,
            /**
             * THE SWEEP'S OWN NEIGHBOURS, not the dial's.
             *
             * neighbourContrast() returns the stations either side on the
             * ladder — for 1987 that is 1986 and 1988. A sweep stepping 35 years
             * was being told to make its frames distinguishable from years one
             * apart, which is differentiation at a scale nobody asked for, while
             * nothing asked for continuity at the scale that actually exists.
             */
            neighbours: sweepNeighbours(i),
            /**
             * The planner sees the frame this one is drawn from, and is told
             * what it is: a photograph of this spot in a DIFFERENT year. That is
             * what lets it reason about which structures were standing in the
             * target year — see `standing` in SceneDirection. Without it, every
             * station was planned in isolation from its place name alone, which
             * is how "Ward 2, 1900" became a street corner instead of the White
             * House.
             */
            reference: referenceForPlanner(i)?.url,
            referenceKind: 'sweep' as const,
            referenceYear: referenceForPlanner(i)?.year,
            findings,
          },
      );
    };

    try {

      let anchorUrl: string | undefined;
      const seed = this.state.frames[anchor];
      if (seed) {
        const stored = await getFrame(
          sceneKey({
            year: seed.year,
            coordinates: request.coordinates,
            location: request.location,
            styleId: request.styleId,
            phaseId: request.phaseId,
          }),
        );
        if (stored?.heroUrl && !abort.signal.aborted) {
          anchorUrl = stored.heroUrl;
          this.patchFrame(anchor, {
            status: 'ready',
            url: stored.heroUrl,
            narrative: stored.narrative,
            restored: true,
            chained: false,
          });
        }
      }

      /**
       * THE STANDPOINT, WRITTEN ONCE, BEFORE ANYTHING IS DRAWN.
       *
       * Needs the seed, so it cannot happen until the restore above has run;
       * needed by every frame, so it cannot happen any later. One text call.
       *
       * Only possible when the seed is actually on disk. A sweep whose seed was
       * never rendered has no photograph to read the geometry out of, and
       * inventing one from the place name would produce a paragraph that sounds
       * authoritative and describes somewhere else — worse than having none,
       * because every frame would then agree on the wrong view.
       */
      let standpoint = '';
      /**
       * The camera sentence alone. See Standpoint.cameraText: a frame with a
       * picture attached must not also be told where in the frame things go.
       */
      let standpointCamera = '';
      let camera: StandpointCamera | undefined;
      if (anchorUrl && !abort.signal.aborted) {
        const years = this.state.frames.map((f) => f.year);
        const sp = await planStandpoint(
          config.apiKey,
          request.location,
          request.coordinates,
          anchorUrl,
          this.state.frames[anchor]!.year,
          { earliest: Math.min(...years), latest: Math.max(...years) },
          config.models.text,
          { signal: abort.signal },
        );
        standpoint = sp.text;
        standpointCamera = sp.cameraText;

        /**
         * CALIBRATE THE RULER BEFORE BELIEVING IT.
         *
         * Every drift number here is the difference between two independent
         * language-model estimates of a camera read off two pictures. That is
         * only a measurement if the estimator is repeatable, and across one
         * session the same kind of elevated view of Rome came back as 150m,
         * 1.6m, 45m, 120m, 65m, 115m and 110m. A frame reported as falling from
         * 110m to 65m may be an image drawn from a lower camera, or it may be
         * the ruler.
         *
         * So the SEED is read twice and the spread is printed. Two reads of one
         * unchanged picture are the noise floor: any drift smaller than that is
         * not evidence of anything. One extra text call per sweep, once, and it
         * is the difference between a diagnostic and a number that merely looks
         * like one.
         *
         * Angles are expected to hold far better than height — the horizon
         * states tilt and field of view outright, and nothing in a picture
         * states metres. If that is what the spread shows, the horizon half of
         * measureDrift is worth trusting and the height half is not.
         */
        void planStandpoint(
          config.apiKey,
          request.location,
          request.coordinates,
          anchorUrl,
          this.state.frames[anchor]!.year,
          { earliest: Math.min(...years), latest: Math.max(...years) },
          config.models.text,
          { signal: abort.signal },
        )
          .then((again) => {
            if (abort.signal.aborted || !cameraIsUsable(again.camera) || !cameraIsUsable(sp.camera))
              return;
            const a = sp.camera;
            const b = again.camera;
            console.info(
              `[looking-glass] ruler check — the SAME seed read twice: ` +
                `${a.eyeHeightM.toFixed(0)}m vs ${b.eyeHeightM.toFixed(0)}m, ` +
                `tilt ${a.tiltDeg.toFixed(0)}° vs ${b.tiltDeg.toFixed(0)}°, ` +
                `fov ${a.hfovDeg.toFixed(0)}° vs ${b.hfovDeg.toFixed(0)}°. ` +
                `Height disagrees by ` +
                `${Math.round((Math.abs(b.eyeHeightM - a.eyeHeightM) / Math.max(a.eyeHeightM, 0.3)) * 100)}% ` +
                `with nothing changed — any drift below that is noise.`,
            );
          })
          .catch(() => {});
        /**
         * The numbers stay; the standalone diagram goes. The grid is now painted
         * into the cut-out's erased regions instead of shipped as a second
         * reference — one attachment, one convention to explain.
         */
        camera = sp.camera;
        // Kept for the film pass, which runs long after this method returns.
        this.camera = sp.camera;
        console.info(
          `[looking-glass] standpoint: ${sp.camera ? JSON.stringify(sp.camera) : 'no camera numbers'}`,
        );
      }
      if (abort.signal.aborted) return;

      /**
       * Outward, nearest first: the seed, then its neighbours, then theirs.
       *
       * Walking forward-then-backward instead would leave the far past until
       * last, so a visitor watching a sweep build would see it march away from
       * them and only afterwards fill in behind. Interleaving keeps the picture
       * on screen adjacent to the one they started from.
       */
      /**
       * Captured here because this is the first point where everything a station
       * needs exists: the standpoint has been read and the closures are defined.
       */
      this.run = {
        config,
        request,
        phase,
        model,
        camera,
        standpoint,
        standpointCamera,
        cutSource,
        referenceForPlanner,
        planAt,
      };

      const order: number[] = [];
      for (let d = 0; d <= this.state.frames.length; d++) {
        if (d === 0) order.push(anchor);
        else {
          if (anchor + d < this.state.frames.length) order.push(anchor + d);
          if (anchor - d >= 0) order.push(anchor - d);
        }
      }




      for (const i of order) {
        if (abort.signal.aborted) break;
        const f = this.state.frames[i];
        if (!f || f.status === 'ready') continue; // the restored seed
        this.emit({ cursor: i });
        await this.renderStation(i, abort);
      }
    } finally {
      if (this.abort === abort) this.abort = null;
      if (this.state.status === 'running') {
        this.emit({ status: abort.signal.aborted ? 'cancelled' : 'done' });
      }
    }
  }
  /**
   * RENDER ONE STATION — the body of the sweep loop, callable on its own.
   *
   * It was 370 lines inlined in start(), which meant a sweep could only ever
   * be run whole: one drifted or hallucinated frame and the choice was keep it
   * or pay for the entire ladder again. Everything the strip can now do to a
   * single frame — re-roll it, move it to another year, insert one — is this
   * method with a different index, and a failed station can finally be retried
   * without re-running its neighbours.
   *
   * Reads `this.run`, which start() fills in once: the config, the request,
   * the resolved model, the standpoint and the three closures that decide what
   * a station is cut from and planned against. Those depend on the sweep, not
   * on the station, so they are established once and reused.
   */
  /**
   * EDIT ONE STATION. Four operations, three of which spend.
   *
   * A sweep used to be all-or-nothing: one drifted or hallucinated frame and the
   * choice was keep it or pay for the whole ladder again. These are all
   * renderStation with a different index, which is what the extraction bought.
   *
   * None of them runs automatically, and none of them touches a neighbour. A
   * station drawn FROM one that is re-rendered is marked `stale` instead: it was
   * cut from a picture that no longer exists, and re-rendering it is another
   * image call that the visitor may not want to make.
   */
  private markDownstreamStale(i: number): void {
    const anchor = this.anchorIndex();
    // Outward from the seed: the stations this one fed are the ones further
    // from the anchor than it is, in the same direction.
    const step = i >= anchor ? 1 : -1;
    const frames = this.state.frames.slice();
    for (let j = i + step; j >= 0 && j < frames.length; j += step) {
      const f = frames[j];
      if (!f || f.status !== 'ready') break;
      frames[j] = { ...f, stale: true };
    }
    this.emit({ frames });
  }

  private anchorIndex(): number {
    const year = this.run?.request.anchorYear;
    if (year === undefined) return 0;
    const i = this.state.frames.findIndex((f) => f.year === year);
    return i < 0 ? 0 : i;
  }

  /** Render this station again, unchanged. One image call plus its two text calls. */
  async reroll(i: number): Promise<void> {
    await this.renderOne(i);
  }

  /** Move this station to another year and render it there. Same cost as a re-roll. */
  async retime(i: number, year: number): Promise<void> {
    const frames = this.state.frames.slice();
    const f = frames[i];
    if (!f) return;
    frames[i] = { ...f, year, status: 'pending', url: undefined, narrative: undefined, error: undefined, drift: undefined, stale: undefined };
    this.emit({ frames });
    await this.renderOne(i);
  }

  /**
   * Drop this station. Free, and instant.
   *
   * The chain re-links around it without being told to: cutSource walks outward
   * to the first station that landed, so the frames either side simply become
   * each other's neighbours. A frame that is wrong and cannot be fixed is better
   * gone than kept.
   */
  drop(i: number): void {
    const frames = this.state.frames.slice();
    if (!frames[i]) return;
    frames.splice(i, 1);
    this.emit({ frames, done: frames.filter((f) => f.status === 'ready').length });
  }

  /**
   * Add a station at `year` and render it. Same cost as a re-roll.
   *
   * Slotted into ladder order, which is what makes its source correct: cutSource
   * takes the nearest finished frame toward the seed, so a station inserted
   * between two finished ones cuts from whichever is nearer the anchor —
   * precisely as it would have in the original run.
   */
  async insert(year: number): Promise<void> {
    if (this.state.frames.some((f) => f.year === year)) return;
    const frames = this.state.frames.slice();
    const at = frames.findIndex((f) => f.year > year);
    const i = at < 0 ? frames.length : at;
    frames.splice(i, 0, { year, status: 'pending' });
    this.emit({ frames });
    await this.renderOne(i);
  }

  /** Shared by the three that render: one station, its own abort, stale marks after. */
  private async renderOne(i: number): Promise<void> {
    if (!this.run || this.state.status === 'running') return;
    const abort = new AbortController();
    this.abort = abort;
    this.emit({ status: 'running', cursor: i });
    try {
      await this.renderStation(i, abort);
      if (!abort.signal.aborted) this.markDownstreamStale(i);
    } finally {
      if (this.abort === abort) this.abort = null;
      this.emit({
        status: abort.signal.aborted ? 'cancelled' : 'done',
        done: this.state.frames.filter((f) => f.status === 'ready').length,
      });
    }
  }

  private async renderStation(i: number, abort: AbortController): Promise<void> {
    const run = this.run;
    if (!run) return;
    const { config, request, phase, model, camera, standpoint, standpointCamera } = run;
    const { cutSource, planAt } = run;
    const frame = this.state.frames[i];
    if (!frame || abort.signal.aborted) return;

      this.patchFrame(i, { status: 'directing' });

      /**
       * THE SEGMENTER RUNS FIRST NOW, and the planner reads its answer.
       *
       * The order used to be the other way round, with the planner running
       * several stations AHEAD of the cursor — the lookahead that took roughly
       * four minutes of text latency out of a 24-frame sweep. That is gone,
       * and knowingly: the planner's job has changed from describing a year to
       * writing edits to a specific photograph, and it cannot do that before
       * something has looked at the photograph.
       *
       * What it buys is the whole point of the change. "In 1943 Rome is
       * occupied, troops in the streets, sandbags at the monuments" is a brief
       * for a scene, and the model composed that scene — a street-level war
       * photograph owing nothing to the aerial it was handed. The same facts as
       * "the asphalt road: unpaved earth; the yellow crane: open ground" point
       * at the picture rather than at the year, and leave the year nothing to
       * summon.
       */
      const source = cutSource(i);
      let masked: string | null = null;
      let reference: string | null = null;
      let anachronisms = 0;
      let absent = 0;
      /**
       * THE ANACHRONISM CUT IS THE DEFAULT, and `window.__noCut = true` sends
       * the source whole instead.
       *
       * Two variables moved at once and only one has been isolated. The runs
       * that drifted used the full cut AND a four-hundred-word prompt; the run
       * that held its vantage used a clean source AND the ninety-word one. So
       * the improvement may have come from either, and the untried combination
       * — full cut, short prompt — is the cell that separates them.
       *
       * Sending the source whole is what reintroduced the crowd: the 1700
       * Colosseum came back with the 2010 queue standing where it had stood,
       * re-costumed. That is the failure the cut exists for, and the reason it
       * is the default rather than the alternative.
       *
       * NO CATEGORY LIST. A version of this asked specifically for people,
       * animals and vehicles, which is the lookup table this file's own header
       * rejects: "every earlier design tried to classify objects and then
       * decide policy per class; each one turned into a lookup table that
       * generalised to nothing." The open-vocabulary pass reasons about dates
       * and names whatever it finds, and that is what it goes back to.
       */
      /**
       * RAW. The neighbouring frame goes over untouched, and no anachronism
       * pass runs at all.
       *
       * The erasure is what a sweep frame is built on and it is switched off
       * here on purpose, to see what the picture alone can carry. It costs the
       * crowd — the people come through into the next century re-costumed,
       * which is the failure the cut-out was invented for — and it saves a text
       * call per frame and every hole the model would otherwise compose into.
       *
       * `window.__cut = true` puts the cut-out back.
       */
      let findings: string[] = [];
      const useCut = (window as unknown as { __cut?: boolean }).__cut === true;
      if (source && !useCut) {
        /**
         * THE LABELS, NOT THE BOXES.
         *
         * The same call as ever — open vocabulary, reasoning about dates — but
         * its answer is used as TEXT rather than as a mask. Nothing is erased,
         * so the reference keeps every pixel that was holding the camera, and
         * the planner gets a grounded list of what a viewer of this picture
         * would point at.
         */
        const items = await segmentAnachronisms(
          config.apiKey, source.url, source.year, frame.year, request.location, config.models.text,
          { signal: abort.signal },
        );
        if (abort.signal.aborted) return;
        findings = items.map((a) => `${a.label} (${a.change})`);
        anachronisms = items.length;
        absent = items.filter((a) => a.change === 'absent').length;
        reference = source.url;
        console.info(
          `[looking-glass] ${frame.year} from ${source.year}: ${items.length} findings ` +
            `(${absent} absent) · RAW frame + an edit list`,
        );
      } else if (source) {
        const items = await segmentAnachronisms(
          config.apiKey,
          source.url,
          source.year,
          frame.year,
          request.location,
          config.models.text,
          { signal: abort.signal },
        );
        if (abort.signal.aborted) return;
        // The labels feed the planner here too, so the switch compares the
        // ATTACHMENT and nothing else: both branches get the same edit list.
        findings = items.map((a) => `${a.label} (${a.change})`);
        if (items.length) {
          try {
            masked = await compositeCutout(source.url, items, camera);
          } catch (err) {
            // A tainted canvas or an unreadable source costs this frame its
            // cut-out, not the sweep: it falls through to the unmasked path.
            console.warn(
              `[looking-glass] could not cut ${source.year} for ${frame.year} — rendering ` +
                `without it. ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
        /**
         * NOTHING TO ERASE MEANS SEND IT WHOLE, NOT SEND NOTHING.
         *
         * This is the bug that produced a ground-level postcard when a 2008
         * aerial was asked for 1987. `if (items.length)` guarded the composite,
         * and no composite meant no attachment — so the shorter the step, the
         * more likely the source was discarded. Exactly backwards: a step over
         * which nothing changed is the step whose source is MOST reusable, and
         * a 900-year jump kept its reference while a 21-year one threw it away.
         *
         * Both of the places that already described this behaviour agreed with
         * the fix and neither was implemented: compositeCutout is documented to
         * return null because "the seed is already the right picture for this
         * year and should go as-is", and the segmentation failure warns that
         * "this frame keeps the whole seed photograph". It did not keep it.
         *
         * Covers the failure route too. segmentAnachronisms returns [] both
         * when it genuinely finds nothing and when the call fails, and the
         * answer is the same either way: the attached view is better evidence
         * of where the camera stands than any paragraph, and losing the vantage
         * is a worse outcome than a surviving anachronism.
         */
        reference = masked ?? source.url;
        anachronisms = items.length;
        absent = items.filter((a) => a.change === 'absent').length;
        console.info(
          `[looking-glass] ${frame.year} from ${source.year}: ${anachronisms} anachronisms ` +
            `(${absent} absent) · attached ` +
            `${masked ? 'cut-out + the uncut neighbour for the camera' : 'the whole source'}`,
        );
      }

      /**
       * NO PHOTOGRAPH IS ATTACHED. A sweep frame is drawn, not edited.
       *
       * The seed's contribution arrives as information — `standpoint` for the
       * vantage and the permanent fabric, `direction.standing` for what stood
       * here in this year, and the diagram for the camera — all of it written
       * or computed by steps that READ the photograph rather than repaint it.
       * See ReferenceKind in promptcraft for what the attachment used to do.
       */
      let direction: SceneDirection;
      try {
        direction = await planAt(i, findings);
      } catch (err) {
        if (abort.signal.aborted) return;
        this.patchFrame(i, { status: 'error', error: explainFailure(err).title });
        return;
      }
      if (abort.signal.aborted) return;
      this.patchFrame(i, { status: 'rendering', narrative: direction.narrative });

      /**
       * THE SWEEP HAS ITS OWN PROMPT NOW — see buildSweepPrompts.
       *
       * It used to assemble DEFAULT_IMAGE_TEMPLATE, which is built to invent a
       * photograph out of nothing, and then suppress the parts of it that
       * fought the attachment. Three of those parts were never suppressed and
       * each produced a reported failure: the viewpoint clause walked the
       * camera down to eye level, the subject block drew a second Colosseum
       * into the erased region, and the biome block describes terrain the
       * attachment shows. Suppression is an exception list, and it grows.
       *
       * Nothing on the lever's path changed. buildCoreSamplePrompts is still
       * what pullLever calls, and it is untouched.
       */
      const sweepOpts = {
        location: request.location,
        year: frame.year,
        styleSuffix: config.styleOverride,
        periodProcess: config.periodProcess,
        phase,
        // Computed from the seed's own tilt and field of view — the one camera
        // fact the model can verify against the canvas instead of inferring
        // from metres. See SweepPromptOpts.horizonFromTop.
        horizonFromTop: cameraIsUsable(camera)
          ? horizonFraction(camera.hfovDeg, camera.tiltDeg, 16 / 9)
          : undefined,
        /**
         * WITH A PICTURE ATTACHED, ONLY THE CAMERA SENTENCE.
         *
         * The standpoint's other two paragraphs place the landmark in the
         * frame and describe it in full — written for an observer who would
         * never see a photograph, which every frame now does. Sending both is
         * how the Colosseum got drawn twice: once reproduced from the
         * attachment, once composed from the frame map.
         *
         * The unattached frame still gets all three. That is the case those
         * paragraphs exist for and the only one where nothing else says where
         * anything is.
         */
        standpoint: reference ? standpointCamera : standpoint,
      };
      const prompts = buildSweepPrompts(
        {
          ...sweepOpts,
          // Both keyed on `masked`, NOT on the attachment. An uncut source has
          // no grey regions and no grid, and its clause is `wholeSourceYear`'s
          // — describing holes in a picture that has none is how promptcraft's
          // own rule about naming absent things gets broken.
          cutout: Boolean(masked),
          // The uncut neighbour rides along as a second reference, for the
          // camera only. See SweepPromptOpts.cameraReferenceYear.
          cameraReferenceYear: masked && source ? source.year : undefined,
          // Whether a grid was PAINTED, not whether one was wanted — the clause
          // must not describe lines the compositor decided not to draw.
          cameraGrid: Boolean(masked) && cameraIsUsable(camera),
          wholeSourceYear: !masked && source ? source.year : undefined,
        },
        direction,
      );
      /**
       * The attachment can be refused as an input image like any other, and
       * the clause above TALKS ABOUT IT. Retrying with those words after it has
       * been dropped would leave the model reading instructions about a
       * picture it was never given — the lesson the stills path learned once.
       */
      const promptsNoDiagram = reference
        ? buildSweepPrompts(sweepOpts, direction)
        : prompts;

      // See SweepDebugEntry. Recorded BEFORE the render, so a frame that fails
      // or is moderated still leaves behind what it was asked to be.
      sweepDebug()[frame.year] = {
        from: source?.year,
        anachronisms,
        absent,
        attached: masked ? 'cut-out' : reference ? 'whole source' : 'nothing',
        cutout: reference ?? undefined,
        prompt: prompts[0]!,
        promptFallback: promptsNoDiagram[0]!,
      };

      try {
        const { url, anchored } = await renderStill(
          config.apiKey,
          {
            model,
            prompts,
            /**
             * TWO, WHEN THERE IS A CUT-OUT: the cut-out first because it is
             * the authority on what is present, then the uncut neighbour for
             * the camera. Every provider in the catalog takes at least three.
             */
            references: masked && source ? [masked, source.url] : reference ? [reference] : undefined,
            unanchoredPrompts: promptsNoDiagram,
          },
          {
            signal: abort.signal,
            /**
             * A REFUSED ATTACHMENT WAS SILENT ON THIS PATH, and it is the one
             * thing that invalidates every other measurement.
             *
             * renderStill degrades by design: refused reference, retry with
             * unanchoredPrompts, return a frame. It reports which happened in
             * `anchored`, and the lever passes an onDegrade handler to catch
             * it. The sweep destructured `{ url }` and passed no handler, so a
             * run whose every frame was drawn from prose alone was
             * indistinguishable from one anchored to a photograph — and the
             * cut-outs, the standpoint, the prompt rewrite and the drift
             * numbers were all being read as though the picture had been sent.
             */
            onDegrade: (note) => console.warn(`[looking-glass] ${frame.year}: ${note}`),
          },
        );
        if (abort.signal.aborted) return;
        console.info(
          `[looking-glass] ${frame.year} reference ` +
            `${anchored ? 'ACCEPTED' : 'REFUSED — this frame was drawn from prose alone'}`,
        );
        /**
         * TRUE WHEN THIS FRAME WAS ACTUALLY CUT FROM ANOTHER, which is what
         * the player's break marker is asking about.
         *
         * Hardcoded false since the sweep stopped editing photographs, which
         * flagged every frame in the strip as unanchored — a warning that
         * fired on the healthy path and so meant nothing. A frame with no
         * attachment genuinely is unanchored: it was drawn from prose alone,
         * and that is the seam the marker exists to show.
         *
         * `anchored`, not `reference`. Its own doc says this is false when "the
         * provider refused the input image" — and it was set from whether one
         * was OFFERED, which is a different question and always true. The strip
         * has been reporting every frame as chained regardless of whether the
         * attachment survived.
         */
        this.patchFrame(i, { status: 'ready', url, chained: anchored });
        const debugEntry = sweepDebug()[frame.year];
        if (debugEntry) {
          debugEntry.url = url;
          debugEntry.anchored = anchored;
        }

        /**
         * NOW CHECK WHETHER IT IS ACTUALLY THE SAME CAMERA.
         *
         * After the patch, deliberately: the picture is paid for and on screen
         * either way, and a measurement is not a reason to make the visitor
         * wait for it. Only when the seed gave usable numbers — with nothing to
         * compare against there is no question to ask, and a sweep whose
         * standpoint failed should not pay for a call that cannot answer.
         */
        if (cameraIsUsable(camera)) {
          void planStandpoint(
            config.apiKey,
            request.location,
            request.coordinates,
            url,
            frame.year,
            { earliest: frame.year, latest: frame.year },
            config.models.text,
            { signal: abort.signal },
          )
            .then((sp) => {
              if (abort.signal.aborted) return;
              if (!cameraIsUsable(sp.camera)) {
                console.warn(
                  `[looking-glass] ${frame.year} not measured — the produced frame gave no ` +
                    `usable camera numbers.`,
                );
                return;
              }
              const drift = measureDrift(camera, sp.camera);
              this.patchFrame(i, { driftChecked: true, drift });
              /**
               * BOTH OUTCOMES SPEAK. Logging only the failure made silence
               * mean two different things — "the camera held" and "the check
               * never ran" — and a diagnostic that cannot distinguish those is
               * not a diagnostic. This is the same silence that hid a rejected
               * camera for an entire session.
               */
              console.info(
                `[looking-glass] ${frame.year} on ${model} — camera: ` +
                  `${sp.camera.eyeHeightM.toFixed(0)}m / tilt ${sp.camera.tiltDeg.toFixed(0)}° / ` +
                  `fov ${sp.camera.hfovDeg.toFixed(0)}° vs seed ` +
                  `${camera.eyeHeightM.toFixed(0)}m / ${camera.tiltDeg.toFixed(0)}° / ` +
                  `${camera.hfovDeg.toFixed(0)}° — ${drift ?? 'held'}`,
              );
            })
            // A measurement that fails costs the measurement, never the frame.
            .catch((err) => {
              console.warn(
                `[looking-glass] ${frame.year} drift check failed — ` +
                  `${err instanceof Error ? err.message : String(err)}`,
              );
            });
        }
      } catch (err) {
        if (abort.signal.aborted) return;
        // A failed frame costs only itself. Nothing downstream was drawn from
        // it, so there is no chain to re-anchor across the gap.
        this.patchFrame(i, { status: 'error', error: explainFailure(err).title });
      }
  }

}
