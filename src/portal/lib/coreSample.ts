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
  generateImageWithFallback,
  generateSceneDirection,
  generateVideoBlocking,
  imageModelForMode,
  isImageInputRejection,
  isSourceFrameRejection,
  videoModelSupports,
} from '../../lib/openrouter';
import type { ModelSelection, VideoFrame, VideoModelCapability } from '../../lib/openrouter';
import { explainFailure } from '../../lib/failure';
import { buildCoreSamplePrompts } from '../../lib/promptcraft';
import type { SceneDirection } from '../../lib/promptcraft';
import { MAX_YEAR, MIN_YEAR, formatYear } from '../../lib/format';
import { findPhase } from './daylight';
import { STATIONS, nearestStationIndex, neighbourContrast } from './stations';
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
  template?: string;
}

export interface SampleRequest {
  years: number[];
  coordinates: Coordinates;
  location: string;
  styleId: string;
  phaseId?: string;
}

/** How far the planner may run ahead of the renderer. */
const DIRECTION_LOOKAHEAD = 3;

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
  'google/veo-3.1',
  'bytedance/seedance-2.0',
  'google/veo-3.1-fast',
  'kwaivgi/kling-v3.0-pro',
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
 * What a transition clip is asked to be.
 *
 * Deliberately about the CAMERA HOLDING STILL while the world moves through it.
 * Asking for "a transition from X to Y" invites a cross-dissolve or a whip pan —
 * an editing effect between two pictures — when what is wanted is one unbroken
 * shot in which time passes. The years are named because the model is being
 * asked to cover a specific interval, and "centuries" and "eleven years" want
 * visibly different rates of change.
 */
function buildTransitionPrompt(location: string, from: number, to: number): string {
  return (
    `A locked-off time-lapse at ${location}. The camera does not move, pan or zoom: ` +
    `it is bolted to one spot and stays there for the whole shot. Time runs forward ` +
    `from ${formatYear(from)} to ${formatYear(to)} within the shot, and the world ` +
    `changes through that interval — light crossing the sky, weather passing, ` +
    `vegetation and water shifting, whatever stands here being built, weathering or ` +
    `going. Begin exactly on the first image and arrive exactly on the last. ` +
    `One continuous take, no cuts, no dissolves, no camera movement.`
  );
}

// ============================================================================
// THE RUNNER
// ============================================================================

export class CoreSampleRunner {
  private state: CoreSampleState = IDLE;
  private listeners = new Set<() => void>();
  private abort: AbortController | null = null;

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
   * Audio is off and it is not a preference. Veo and Seedance both synthesise
   * sound per clip, so twenty-three independently-scored four-second clips would
   * be twenty-three unrelated soundtracks cutting every four seconds — actively
   * destroying the continuity this exists to create. One bed over the finished
   * sequence is a different feature; this one is silent on purpose.
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

      const prompt = buildTransitionPrompt(this.state.location, a.year, b.year);
      const base = {
        model: opts.model,
        prompt,
        duration: opts.seconds,
        resolution: opts.resolution,
        aspect_ratio: '16:9' as const,
        // See the note above. Not a setting.
        generate_audio: false,
      };

      const run = (frames: VideoFrame[]) =>
        generateVideoBlocking(
          config.apiKey,
          { ...base, frames },
          {
            onStatus: (job) => this.patchClip(i, { stage: job.status }),
            maxWaitMs: Math.max(10, opts.seconds * 2) * 60 * 1000,
          },
        );

      try {
        let url: string;
        let pinned = true;
        try {
          url = await run([
            { url: a.url, frame_type: 'first_frame' },
            { url: b.url, frame_type: 'last_frame' },
          ]);
        } catch (err) {
          /**
           * A refused closing frame costs continuity, not the film.
           *
           * `supported_frame_images` is checked before any of this runs, so
           * reaching here means the model claims last_frame and the PROVIDER
           * refused this particular image — content moderation on the closing
           * still, or a data: URL it will not take. Falling back to an
           * opening-frame-only clip keeps the sequence intact and marks the
           * join as a cut, which is worse than seamless and far better than a
           * hole.
           */
          if (abort.signal.aborted) return;
          if (!isSourceFrameRejection(err) && !isImageInputRejection(err)) throw err;
          pinned = false;
          this.patchClip(i, { stage: 'closing frame refused — rendering unpinned' });
          url = await run([{ url: a.url, frame_type: 'first_frame' }]);
        }
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
    const directions = new Map<number, Promise<SceneDirection>>();
    const planAt = (i: number): void => {
      const frame = this.state.frames[i];
      if (!frame || directions.has(i)) return;
      directions.set(
        i,
        generateSceneDirection(
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
            neighbours: neighbourContrast(frame.year),
          },
        ),
      );
    };

    try {
      /**
       * The anchor may come free.
       *
       * If the visitor already owns an ordinary frame at the first station of
       * the sweep, it becomes frame zero: the sample then continues from the
       * photograph they have actually been looking at, and costs one image less.
       * Only the FIRST frame is allowed to do this. Substituting owned frames
       * further down the chain would save more money and wreck the product — an
       * unchained frame in the middle is exactly where the camera visibly jumps,
       * and continuity is the entire reason this feature exists.
       */
      let reference: string | undefined;
      const first = this.state.frames[0];
      if (first) {
        const stored = await getFrame(
          sceneKey({
            year: first.year,
            coordinates: request.coordinates,
            location: request.location,
            styleId: request.styleId,
            phaseId: request.phaseId,
          }),
        );
        if (stored?.heroUrl && !abort.signal.aborted) {
          reference = stored.heroUrl;
          this.patchFrame(0, {
            status: 'ready',
            url: stored.heroUrl,
            narrative: stored.narrative,
            restored: true,
            chained: false,
          });
        }
      }

      for (let i = 0; i < this.state.frames.length; i++) {
        if (abort.signal.aborted) break;
        const frame = this.state.frames[i];
        if (!frame) continue;
        if (frame.status === 'ready') continue; // the restored anchor

        this.emit({ cursor: i });
        for (let ahead = i; ahead < i + DIRECTION_LOOKAHEAD; ahead++) planAt(ahead);

        this.patchFrame(i, { status: 'directing' });
        let direction: SceneDirection;
        try {
          direction = await directions.get(i)!;
        } catch (err) {
          if (abort.signal.aborted) break;
          this.patchFrame(i, { status: 'error', error: explainFailure(err).title });
          continue;
        }
        if (abort.signal.aborted) break;

        this.patchFrame(i, { status: 'rendering', narrative: direction.narrative });

        const prompts = buildCoreSamplePrompts(
          {
            location: request.location,
            coordinates: request.coordinates,
            year: frame.year,
            mode: 'wide-field',
            styleSuffix: config.styleOverride,
            phase,
            template: config.template,
            aspect: '16:9',
          },
          direction,
          Boolean(reference),
        );
        // Without a reference the anchor sentence is absent from `prompts`, so
        // the unchained retry below has to be built from its own candidate list
        // rather than reusing this one — otherwise a refused input image would
        // leave the prompt talking about an attachment that is no longer there.
        const unchainedPrompts = reference
          ? buildCoreSamplePrompts(
              {
                location: request.location,
                coordinates: request.coordinates,
                year: frame.year,
                mode: 'wide-field',
                styleSuffix: config.styleOverride,
                phase,
                template: config.template,
                aspect: '16:9',
              },
              direction,
              false,
            )
          : prompts;

        try {
          let url: string;
          let chained = Boolean(reference);
          try {
            url = (
              await generateImageWithFallback(config.apiKey, prompts, model, {
                signal: abort.signal,
                reference,
              })
            ).url;
          } catch (err) {
            // A provider that will not take an input image must not cost the
            // user the rest of the sweep. Drop continuity for this frame only,
            // and keep going — the next frame tries to chain again.
            if (!reference || !isImageInputRejection(err)) throw err;
            chained = false;
            url = (
              await generateImageWithFallback(config.apiKey, unchainedPrompts, model, {
                signal: abort.signal,
              })
            ).url;
          }
          if (abort.signal.aborted) break;
          this.patchFrame(i, { status: 'ready', url, chained });
          reference = url;
        } catch (err) {
          if (abort.signal.aborted) break;
          // `reference` is deliberately left pointing at the last GOOD frame, so
          // the chain re-anchors across the gap instead of restarting from
          // nothing on the far side of it.
          this.patchFrame(i, { status: 'error', error: explainFailure(err).title });
        }
      }
    } finally {
      if (this.abort === abort) this.abort = null;
      if (this.state.status === 'running') {
        this.emit({ status: abort.signal.aborted ? 'cancelled' : 'done' });
      }
    }
  }
}
