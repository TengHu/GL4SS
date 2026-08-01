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
  imageModelForMode,
  isImageInputRejection,
} from '../../lib/openrouter';
import type { ModelSelection } from '../../lib/openrouter';
import { explainFailure } from '../../lib/failure';
import { buildCoreSamplePrompts } from '../../lib/promptcraft';
import type { SceneDirection } from '../../lib/promptcraft';
import { MAX_YEAR, MIN_YEAR } from '../../lib/format';
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
}

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
  },
  {
    id: 'ice',
    label: 'Since the ice',
    blurb: 'the last glacial maximum to now',
    fromYear: -20000,
    toYear: 2030,
  },
  {
    id: 'recorded',
    label: 'Recorded history',
    blurb: '3000 BC to now',
    fromYear: -3000,
    toYear: 2030,
  },
  {
    id: 'memory',
    label: 'Living memory',
    blurb: '1900 to 2030, year by year',
    fromYear: 1900,
    toYear: 2030,
  },
];

export const SAMPLE_LENGTHS = [8, 16, 24] as const;

export function findSpan(id: string): SampleSpan {
  return SAMPLE_SPANS.find((s) => s.id === id) ?? SAMPLE_SPANS[0]!;
}

/**
 * The station years this sweep will visit, ascending.
 *
 * Even spacing is by STATION INDEX, not by year. Spacing by year over the deep
 * span would put twenty-three of twenty-four frames in the Mesozoic and one
 * everywhere else, because 96% of the ladder's range is older than the
 * dinosaurs. Index spacing follows the ladder's own judgement about where
 * resolution is worth having, which is the judgement the whole app is built on.
 */
export function planSample(span: SampleSpan, count: number): number[] {
  const lo = nearestStationIndex(span.fromYear);
  const hi = nearestStationIndex(span.toYear);
  const [from, to] = lo <= hi ? [lo, hi] : [hi, lo];
  const available = to - from + 1;
  const n = Math.max(2, Math.min(count, available));

  const years: number[] = [];
  for (let i = 0; i < n; i++) {
    // Endpoints inclusive: a sweep that stops one station short of the era it
    // was named for reads as a bug even when the spacing is right.
    const idx = from + Math.round((i * (available - 1)) / (n - 1));
    const year = STATIONS[idx];
    if (year !== undefined && years[years.length - 1] !== year) years.push(year);
  }
  return years;
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
}

const IDLE: CoreSampleState = {
  status: 'idle',
  frames: [],
  location: '',
  coordinates: { lat: 0, lng: 0 },
  styleId: '',
  cursor: 0,
  done: 0,
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
  }

  /** Throw the whole sample away and return to the dial. */
  clear(): void {
    this.abort?.abort();
    this.abort = null;
    this.state = IDLE;
    for (const fn of this.listeners) fn();
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
