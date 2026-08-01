/**
 * SCENE ENGINE — cache, priority queue, and speculative prefetch.
 *
 * The portal's whole feel depends on this file. Two rules:
 *
 *  1. A scene the user is looking at is DEMAND priority and jumps the queue.
 *  2. Neighbouring stations are PREFETCH priority and only run when no demand
 *     work is in flight, so speculation never delays the thing being looked at.
 *
 * Scenes resolve in two visible stages so there is something to look at within
 * a couple of seconds instead of forty:
 *
 *    directing  → one text call returns narrative + atmosphere + subjects
 *    rendering  → the hero image call
 *    ready
 *
 * The `directing` stage is cheap and fast, so the portal can show real prose
 * and an era-derived colour field almost immediately, then crossfade the
 * photograph in underneath it when it lands.
 *
 * Cost note: v1 generated 3 images per jump. Here a station costs ONE image by
 * default; the two peripheral frames are generated only if the user widens the
 * view. Scrubbing a dozen stations therefore costs a dozen images, not 36.
 */

import type { Coordinates } from '../../types';
import {
  generateImage,
  generateSceneDirection,
  imageModelForMode,
} from '../../lib/openrouter';
import { audioForSequence, renderClip, renderStill } from './render';
import type { ModelSelection } from '../../lib/openrouter';
import { explainFailure } from '../../lib/failure';
import type { Failure } from '../../lib/failure';
import { findPhase, isDefaultPhase } from './daylight';
import {
  buildCinematicPromptFromDirection,
  buildImagePromptsFromDirection,
} from '../../lib/promptcraft';
import type { SceneDirection } from '../../lib/promptcraft';
import {
  deleteFrame,
  evict,
  getFrame,
  loadIndex,
  measure,
  placeKey,
  putFrame,
  touchFrame,
  FRAME_STORE_TARGET_BYTES,
} from './frameStore';
import type { FrameIndex } from './frameStore';
import { neighbourContrast } from './stations';

export type SceneStatus =
  | 'queued'
  | 'restoring'
  | 'directing'
  | 'rendering'
  | 'ready'
  | 'error';

export interface Scene {
  key: string;
  year: number;
  coordinates: Coordinates;
  location: string;
  styleId: string;
  /** Time-of-day phase id. Undefined means midday, the pre-sundial behaviour. */
  phaseId?: string;
  status: SceneStatus;
  /** Prose for the user. Present from the `directing` stage onward. */
  narrative?: string;
  atmosphere?: string;
  /** The full-bleed frame. Present once `ready`. */
  heroUrl?: string;
  /** Peripheral frames, populated only by `widen()`. */
  wideUrls?: string[];
  wideStatus?: 'none' | 'loading' | 'ready' | 'error';
  /** Separate from `error` so a widen failure is renderable on a ready scene. */
  wideError?: string;
  /**
   * The classified failure — cause, advice, whether a retry is worth offering.
   * Held whole rather than flattened into four parallel fields, so the advice
   * physically cannot drift from the cause that produced it. Never persisted:
   * only ready frames reach disk.
   */
  failure?: Failure;
  /** Film: an 4-12s clip WITH sound, rendered from this station's hero frame. */
  videoUrl?: string;
  videoStatus?: 'none' | 'rendering' | 'ready' | 'error';
  videoError?: string;
  /** Coarse progress text from the provider's polling, so a 5-minute wait talks. */
  videoStage?: string;
  /** When the render began, so the UI can show elapsed time honestly. */
  videoStartedAt?: number;
  /** False when the provider refused the still as a source frame, so the clip
   *  is a fresh scene rather than a continuation of the picture on screen. */
  videoContinuous?: boolean;
  direction?: SceneDirection;
  prompts?: string[];
  /** How many candidate prompts the provider moderated before one rendered. */
  moderatedCount?: number;
  /** Set only when the frame had to be rescued on a model other than the selected one. */
  modelUsed?: string;
  /** True when this frame came back from disk rather than the models. */
  restored?: boolean;
  /**
   * Set when the frame is real but was produced on a degraded path — currently
   * only a scene-direction parse failure. Distinct from `error`: there IS a
   * picture, it is just a worse one than the app is capable of, and the user
   * deserves to know which of those they are looking at.
   */
  degraded?: string;
  error?: string;
  /** For LRU eviction. */
  touchedAt: number;
}

export interface SceneCoords {
  year: number;
  coordinates: Coordinates;
  location: string;
  styleId: string;
  /** Time-of-day phase id. Undefined means midday — see sceneKey. */
  phaseId?: string;
}

/**
 * Cache identity. Coordinates are rounded to ~100m — finer than that and
 * panning the map by a pixel would miss the cache for no perceptual gain.
 */
export function sceneKey(c: SceneCoords): string {
  const base = [c.coordinates.lat.toFixed(3), c.coordinates.lng.toFixed(3), c.year, c.styleId].join('|');
  /**
   * The phase is APPENDED, and only when it is not the default.
   *
   * Time of day is a new axis, and adding a new segment unconditionally would
   * have changed the key of every frame ever generated — so every archive on
   * disk would have gone unreachable in one release, and the dial would have
   * shown an empty timeline the user had already paid for. Midday was the
   * implicit behaviour before the sundial existed, so a midday key stays
   * byte-identical to what it was.
   */
  return isDefaultPhase(c.phaseId) ? base : `${base}|${findPhase(c.phaseId).id}`;
}

interface Job {
  key: string;
  coords: SceneCoords;
  priority: 'demand' | 'prefetch';
  abort: AbortController;
}

const MAX_CACHED_SCENES = 48;

export interface EngineConfig {
  apiKey: string;
  models: ModelSelection;
}

export class SceneEngine {
  private scenes = new Map<string, Scene>();
  private queue: Job[] = [];
  private active = new Map<string, Job>();
  private listeners = new Set<() => void>();
  private config: EngineConfig;
  /**
   * Demand work runs 2-wide. Prefetch runs 2-wide as well, which is a change
   * forced by measurement: probed live on 2026-07-30, a hero image takes 5.4s
   * (Grok Imagine) to 27.7s (FLUX 2 Max). At 1-wide with 4 neighbours queued,
   * filling the horizon on the slowest model took ~110s — long enough that
   * "stepping is instant" would simply have been false. 2-wide with radius 1
   * (see PREFETCH_RADIUS) has both immediate neighbours ready in one image's
   * time instead of four.
   */
  private readonly maxDemand = 2;
  private readonly maxPrefetch = 2;
  private snapshot: Scene[] = [];
  /**
   * Keys we hold on disk, loaded once at startup. Held in memory specifically so
   * request() can answer "do I already own this frame?" synchronously — an async
   * check there would mean every cache hit briefly reported 'queued' and the
   * portal would flash the latent field over a frame we already had.
   */
  /**
   * Style suffix and meta-prompt, both now user-controlled. Held on the engine
   * rather than looked up from styleId because the CUSTOM chip's suffix is free
   * text that no lookup table can know, and the template is editable.
   */
  private styleOverride: string | null = null;
  private template: string | undefined;
  /** Stations with a film in flight. Not Jobs, so the queue cannot protect them. */
  private filming = new Set<string>();
  private persisted: FrameIndex = { keys: new Map(), totalBytes: 0 };
  private hydrated = false;
  private hydration: Promise<void>;

  constructor(config: EngineConfig) {
    this.config = config;
    this.hydration = this.hydrate();
  }

  /** Load the on-disk index. Cheap relative to the frames themselves. */
  private async hydrate(): Promise<void> {
    this.persisted = await loadIndex();
    this.hydrated = true;
    // Anything requested before the index landed would have been sent to the
    // models. Re-emit so the dial can light up stations we turn out to own.
    this.emit();
  }

  /** True once the on-disk index is known; until then we may over-generate. */
  get isHydrated(): boolean {
    return this.hydrated;
  }

  /**
   * Resolves once the on-disk index is loaded.
   *
   * `isHydrated` existed for exactly this guard and was read nowhere, so demand
   * fired on a fixed 480ms timer against an empty index. On reload with any real
   * archive, the station you land on was reported as unowned, regenerated, and
   * re-billed — and then persist() overwrote the stored row, so the SAME
   * spacetime came back as a DIFFERENT photograph. That breaks both of the
   * product's stated promises at once: revisits are free, and a revisit returns
   * the frame you already have.
   */
  whenHydrated(): Promise<void> {
    if (this.hydrated) return Promise.resolve();
    return this.hydration;
  }

  get storedFrameCount(): number {
    return this.persisted.keys.size;
  }

  get storedBytes(): number {
    return this.persisted.totalBytes;
  }

  setStyleOverride(suffix: string | null, template: string): void {
    this.styleOverride = suffix;
    this.template = template;
  }

  setConfig(config: EngineConfig): void {
    const keyChanged = config.apiKey !== this.config.apiKey;
    this.config = config;
    // A new key can rescue everything that failed for auth reasons.
    if (keyChanged) {
      for (const [key, scene] of this.scenes) {
        if (scene.status === 'error') this.scenes.delete(key);
      }
      this.emit();
    }
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Stable array identity for useSyncExternalStore — only changes on emit. */
  getSnapshot = (): Scene[] => this.snapshot;

  get(key: string): Scene | undefined {
    return this.scenes.get(key);
  }

  peek(coords: SceneCoords): Scene | undefined {
    return this.scenes.get(sceneKey(coords));
  }

  private emit(): void {
    this.snapshot = [...this.scenes.values()];
    for (const fn of this.listeners) fn();
  }

  private patch(key: string, next: Partial<Scene>): void {
    const current = this.scenes.get(key);
    if (!current) return;
    this.scenes.set(key, { ...current, ...next, touchedAt: Date.now() });
    this.emit();
  }

  /**
   * Ask for a scene. Returns immediately with whatever exists; generation (if
   * needed) proceeds in the background and surfaces through subscribe().
   */
  request(coords: SceneCoords, priority: 'demand' | 'prefetch' = 'demand'): Scene {
    const key = sceneKey(coords);
    const existing = this.scenes.get(key);

    if (existing) {
      existing.touchedAt = Date.now();
      // A prefetch already in flight gets promoted if the user arrives on it.
      if (priority === 'demand') {
        const queued = this.queue.find((j) => j.key === key);
        if (queued) queued.priority = 'demand';
        const running = this.active.get(key);
        if (running) running.priority = 'demand';
        this.pump();
      }
      return existing;
    }

    const scene: Scene = {
      key,
      year: coords.year,
      coordinates: coords.coordinates,
      phaseId: coords.phaseId,
      location: coords.location,
      styleId: coords.styleId,
      status: 'queued',
      wideStatus: 'none',
      touchedAt: Date.now(),
    };

    // We already own this frame — read it back instead of paying for it again.
    // This is what makes a revisit both free AND identical: the same spacetime
    // returns the same photograph rather than a fresh roll of the dice.
    if (this.persisted.keys.has(key)) {
      scene.status = 'restoring';
      this.scenes.set(key, scene);
      this.evictMemory();
      this.emit();
      void this.restore(key, priority === 'demand');
      return scene;
    }

    this.scenes.set(key, scene);
    this.queue.push({ key, coords, priority, abort: new AbortController() });
    this.evictMemory();
    this.emit();
    this.pump();
    return scene;
  }

  /** Read a stored frame back into the live cache. */
  private async restore(key: string, viewed: boolean): Promise<void> {
    const stored = await getFrame(key);
    if (!stored) {
      // Index and store disagreed — the record was evicted under us. Fall back
      // to generating rather than leaving the scene stuck in 'restoring'.
      this.persisted.keys.delete(key);
      const scene = this.scenes.get(key);
      if (!scene) return;
      this.patch(key, { status: 'queued' });
      this.queue.push({
        key,
        coords: {
          year: scene.year,
          coordinates: scene.coordinates,
          location: scene.location,
          styleId: scene.styleId,
          // Dropping this rebuilt the frame at MIDDAY and then stored it under
          // the dusk or midnight key it was queued for — a permanently wrong
          // frame in the archive, with no error and no way to tell.
          phaseId: scene.phaseId,
        },
        priority: viewed ? 'demand' : 'prefetch',
        abort: new AbortController(),
      });
      this.pump();
      return;
    }

    this.patch(key, {
      status: 'ready',
      heroUrl: stored.heroUrl,
      narrative: stored.narrative,
      atmosphere: stored.atmosphere,
      direction: stored.direction as SceneDirection | undefined,
      modelUsed: stored.modelUsed,
      restored: true,
    });
    void touchFrame(key, viewed);
  }

  /**
   * Discard a scene and generate it again.
   *
   * Without this a station that fails once is dead for the rest of the session:
   * request() returns any cached scene, including an errored one, so a transient
   * 429 or a dropped connection poisons that year permanently — scrubbing away
   * and back just returns the same error. Errors are the one cache entry that
   * must not be sticky.
   */
  retry(coords: SceneCoords): Scene {
    const key = sceneKey(coords);

    // Force-abort in-flight work rather than refusing to touch it. Refusing was
    // the wrong instinct: the scene most in need of a retry is precisely one
    // that has been stuck mid-flight, and leaving it running also holds a
    // concurrency slot. Now that the signal is actually wired through to fetch,
    // aborting genuinely frees the worker.
    const running = this.active.get(key);
    if (running) {
      running.abort.abort();
      this.active.delete(key);
    }

    this.scenes.delete(key);
    this.queue = this.queue.filter((j) => j.key !== key);

    // Explicit retry is the ONE invalidation signal. Without dropping the stored
    // record, request() would see the key on disk and restore the very frame the
    // user just asked to be redone — retry would silently become a no-op. This is
    // also the answer to "when is a persisted frame regenerated": only when asked,
    // never automatically, because every stored frame was paid for.
    const bytes = this.persisted.keys.get(key);
    if (bytes !== undefined) {
      this.persisted.keys.delete(key);
      this.persisted.totalBytes -= bytes;
      void deleteFrame(key);
    }

    return this.request(coords, 'demand');
  }

  /**
   * Abandon demand work for anywhere other than `keep`.
   *
   * maxDemand is 2, so two stations the user has already left could hold both
   * slots while the station actually on screen waited behind them. Settling
   * somewhere new supersedes the previous destination outright — there is only
   * ever one place the user is looking.
   */
  supersedeDemand(keep: SceneCoords): void {
    const keepKey = sceneKey(keep);
    let changed = false;

    this.queue = this.queue.filter((job) => {
      if (job.priority !== 'demand' || job.key === keepKey) return true;
      const scene = this.scenes.get(job.key);
      if (scene?.status === 'queued') this.scenes.delete(job.key);
      changed = true;
      return false;
    });

    /**
     * ACTIVE DEMAND WORK IS NEVER ABORTED — it is DEMOTED.
     *
     * Demand jobs exist only because the user asked: pullLever, retry, or a
     * restore that missed. Aborting one throws away a generation they have
     * already been billed for, and because run()'s catch routes an aborted job
     * to discardAborted(), the half-built scene was then DELETED — no frame, no
     * error, nothing persisted, and the station re-armed so the next pull
     * charged for it a second time. Moving the dial one station with the arrow
     * keys was enough to trigger it, and hero images take 5-33s, so the window
     * was most of the wait.
     *
     * This is the same lesson cancelPrefetch already learned (see its `keep`
     * exemption below); the more expensive path simply never got it. Demoting to
     * 'prefetch' yields the queue to wherever the user actually is, while the
     * paid work finishes and persists in the background.
     */
    for (const job of this.active.values()) {
      if (job.priority === 'demand' && job.key !== keepKey) {
        job.priority = 'prefetch';
        changed = true;
      }
    }

    if (changed) this.emit();
  }

  /**
   * Mark a 'ready' scene as broken because its frame would not decode. The
   * engine cannot detect this itself — only the <img> that tries to render the
   * URL finds out.
   */
  markFrameError(key: string, message: string): void {
    const scene = this.scenes.get(key);
    if (!scene || scene.status !== 'ready') return;
    this.patch(key, { status: 'error', error: message, heroUrl: undefined });

    // Drop the disk row too. Marking only the in-memory scene left the dial
    // advertising a station as owned — a lit dot promising an instant frame —
    // when the app had just proved that frame cannot be decoded. On the next
    // visit request() would restore it and fail again, permanently.
    const bytes = this.persisted.keys.get(key);
    if (bytes !== undefined) {
      this.persisted.keys.delete(key);
      this.persisted.totalBytes -= bytes;
      void deleteFrame(key);
    }
  }

  /**
   * Drop every queued prefetch. Called when the user moves somewhere new, so
   * we stop speculating about a neighbourhood they've left.
   */
  cancelPrefetch(keep?: SceneCoords): void {
    // The station the user has just arrived at is very often the one being
    // prefetched right now — that is the whole point of prefetching it. Aborting
    // it here threw away 5-30s of work the visitor had already been billed for,
    // on the single most common gesture in the app. It must be exempt.
    const keepKey = keep ? sceneKey(keep) : null;

    const dropped = this.queue.filter((j) => j.priority === 'prefetch' && j.key !== keepKey);
    this.queue = this.queue.filter((j) => j.priority !== 'prefetch' || j.key === keepKey);

    // Also abort prefetch work already in flight. Previously only the queue was
    // pruned, so speculation for a place the user had left kept running to
    // completion, holding a worker slot and spending an image.
    for (const job of this.active.values()) {
      if (job.priority === 'prefetch' && job.key !== keepKey) job.abort.abort();
    }

    for (const job of dropped) {
      // A queued-but-never-started scene should not linger as a permanent
      // 'queued' ghost, or the dial would show it as pending forever.
      const scene = this.scenes.get(job.key);
      if (scene?.status === 'queued') this.scenes.delete(job.key);
    }
    if (dropped.length) this.emit();
  }

  /**
   * Render this station as a short film with sound.
   *
   * Deliberately an explicit action on a scene that is ALREADY ready, not a mode
   * on the dial. Video takes 30s-5min against 5-30s for a still, so wiring it
   * into the settle path would destroy the premise that moving through time is
   * fluid — you would be committing to minutes every time you nudged the dial.
   *
   * The hero frame is handed over as the FIRST FRAME, so the clip continues from
   * the picture you are looking at rather than reinventing the scene. Some
   * providers reject data: URLs for that field, so a rejection falls back to
   * text-only rather than failing the whole render.
   */
  async filmize(key: string, seconds: number): Promise<void> {
    const scene = this.scenes.get(key);
    if (!scene || scene.status !== 'ready' || !scene.direction) return;
    if (scene.videoStatus === 'rendering' || scene.videoStatus === 'ready') return;

    // A film takes 4-6 minutes and the UI invites the user to keep exploring, so
    // ~46 further station visits will push this scene past MAX_CACHED_SCENES.
    // Evicted mid-render, the success patch became a silent no-op, a fully paid
    // clip vanished with no error, and the station re-armed for a second charge.
    this.filming.add(key);
    this.patch(key, {
      videoStatus: 'rendering',
      videoStage: 'submitting',
      videoError: undefined,
      videoStartedAt: Date.now(),
    });

    const prompt = buildCinematicPromptFromDirection(
      {
        location: scene.location,
        coordinates: scene.coordinates,
        year: scene.year,
        mode: 'cinematic',
        styleSuffix: this.styleOverride,
        phase: findPhase(scene.phaseId).prompt,
        seconds,
      },
      scene.direction,
    );

    try {
      /**
       * A film of ONE station is a sequence of one clip.
       *
       * No `last` frame is offered because nothing follows it — which is why a
       * single-station film is unpinned, and the reason lives in the input
       * rather than in this code path being the poor relation of the sweep's.
       * See film.ts. Audio is on for the same reason: one clip has no join for
       * an independently-scored soundtrack to disrupt.
       */
      const { url, continuous } = await renderClip(
        this.config.apiKey,
        {
          prompt,
          model: this.config.models.cinematic,
          seconds,
          resolution: '720p',
          first: scene.heroUrl,
          audio: audioForSequence(1),
        },
        {
          onStatus: (job) => this.patch(key, { videoStage: job.status }),
          onDegrade: (note) => this.patch(key, { videoStage: note }),
        },
      );
      this.patch(key, {
        videoStatus: 'ready',
        videoUrl: url,
        videoStage: undefined,
        videoContinuous: continuous,
      });
    } catch (err) {
      this.patch(key, {
        videoStatus: 'error',
        videoError: describe(err),
        videoStage: undefined,
      });
    } finally {
      this.filming.delete(key);
    }
  }

  /** Generate the two peripheral frames for an already-ready scene. */
  async widen(key: string): Promise<void> {
    const scene = this.scenes.get(key);
    if (!scene || !scene.direction || scene.wideStatus === 'loading' || scene.wideStatus === 'ready') return;
    this.patch(key, { wideStatus: 'loading' });
    const prompts = buildImagePromptsFromDirection(
      {
        location: scene.location,
        coordinates: scene.coordinates,
        year: scene.year,
        mode: 'wide-field',
        styleSuffix: this.styleOverride,
        phase: findPhase(scene.phaseId).prompt,
        template: this.template,
        // The portal is full-bleed, so a square or portrait frame gets cropped
        // to ribbons. Providers disagree on default aspect, so we ask in words.
        aspect: '16:9',
      },
      scene.direction,
    );
    const model = imageModelForMode('wide-field', this.config.models);
    try {
      // Left and right only — the centre frame is already the hero.
      const [left, right] = await Promise.all([
        generateImage(this.config.apiKey, prompts[0]!, model),
        generateImage(this.config.apiKey, prompts[2]!, model),
      ]);
      this.patch(key, { wideUrls: [left, right], wideStatus: 'ready' });
    } catch (err) {
      // Its own field, not the shared `error`. Writing a widen failure into
      // `error` put it somewhere the UI never renders for a 'ready' scene, so
      // pressing W and getting nothing was completely silent.
      this.patch(key, { wideStatus: 'error', wideError: describe(err) });
    }
  }

  private countActive(priority: 'demand' | 'prefetch'): number {
    let n = 0;
    for (const job of this.active.values()) if (job.priority === priority) n++;
    return n;
  }

  private pump(): void {
    if (!this.config.apiKey) return;

    while (true) {
      const demandRunning = this.countActive('demand');
      const prefetchRunning = this.countActive('prefetch');

      // Demand first, always.
      let idx = this.queue.findIndex((j) => j.priority === 'demand');
      if (idx >= 0) {
        if (demandRunning >= this.maxDemand) return;
      } else {
        // Nothing urgent — consider speculation, but only when the user's own
        // request is fully settled.
        if (demandRunning > 0 || prefetchRunning >= this.maxPrefetch) return;
        idx = this.queue.findIndex((j) => j.priority === 'prefetch');
        if (idx < 0) return;
      }

      const [job] = this.queue.splice(idx, 1);
      if (!job) return;
      this.active.set(job.key, job);
      void this.run(job);
    }
  }

  private async run(job: Job): Promise<void> {
    const { key, coords } = job;

    try {
      this.patch(key, { status: 'directing' });

      const direction = await generateSceneDirection(
        this.config.apiKey,
        coords.location,
        coords.coordinates,
        coords.year,
        'wide-field',
        this.config.models.text,
        this.styleOverride,
        {
          signal: job.abort.signal,
          phase: findPhase(coords.phaseId).prompt,
          // The dial's own neighbours, so "must not resemble" means the frame
          // one click away rather than an arithmetic guess off the era's span.
          neighbours: neighbourContrast(coords.year),
        },
      );
      if (job.abort.signal.aborted) return this.discardAborted(key);

      // Show the prose the moment we have it — this is what makes the portal
      // feel responsive while the image is still cooking.
      this.patch(key, {
        status: 'rendering',
        narrative: direction.narrative,
        atmosphere: direction.atmosphere,
        direction,
        degraded: direction.isFallback ? 'scene planning failed — generic imagery' : undefined,
      });

      const prompts = buildImagePromptsFromDirection(
        {
          location: coords.location,
          coordinates: coords.coordinates,
          year: coords.year,
          mode: 'wide-field',
          styleSuffix: this.styleOverride,
          phase: findPhase(coords.phaseId).prompt,
          template: this.template,
          // The hero fills the screen, so this matters here MORE than in widen().
          // It was originally added to widen() only, which meant the full-bleed
          // frame — the one the whole app is about — was the one getting a square
          // image cropped to ribbons.
          aspect: '16:9',
        },
        direction,
      );
      // Index 1 is the centre/focal frame — the right one for a single hero.
      // The peripheral subjects follow as moderation fallbacks: an arena scene's
      // focal subject is often the violent one, while the stonemason off to the
      // side renders fine and still belongs to the same moment.
      const candidates = [prompts[1] ?? prompts[0]!, prompts[0]!, prompts[2]!].filter(Boolean);
      const model = imageModelForMode('wide-field', this.config.models);
      /**
       * NO REFERENCE, and that is the whole difference between this and a swept
       * frame. A station reached from the dial has no predecessor to hold the
       * camera on, so it is unanchored — free to frame the place however the
       * model likes, which is what an independent photograph of a spacetime
       * should be. With `reference` omitted, renderStill makes exactly the call
       * this line has always made.
       */
      const { url: heroUrl, moderatedCount, modelUsed } = await renderStill(
        this.config.apiKey,
        { model, prompts: candidates },
        { signal: job.abort.signal },
      );
      if (job.abort.signal.aborted) return this.discardAborted(key);

      this.patch(key, {
        status: 'ready',
        heroUrl,
        prompts,
        moderatedCount: moderatedCount || undefined,
        // Surfaced so a frame that had to be rescued on another model is not
        // silently attributed to the model the user picked.
        modelUsed: modelUsed !== model ? modelUsed : undefined,
      });

      // Persist. A prefetched neighbour is stored too — it was paid for either
      // way — but flagged unviewed so it is first out under quota pressure.
      void this.persist(key, {
        heroUrl,
        narrative: direction.narrative,
        atmosphere: direction.atmosphere,
        // widen() needs the left/right subjects. Without persisting the direction
        // the widen button was a silent no-op on every frame restored from disk —
        // it bailed at the `!scene.direction` guard and did nothing at all.
        direction,
        modelUsed: modelUsed !== model ? modelUsed : undefined,
        coords,
        viewed: job.priority === 'demand',
      });
    } catch (err) {
      if (job.abort.signal.aborted) this.discardAborted(key);
      else this.patch(key, { status: 'error', ...failureOf(err) });
    } finally {
      this.active.delete(key);
      this.pump();
    }
  }

  /**
   * Retire a scene whose job was cancelled.
   *
   * Cancellation used to be treated as "nothing to report": the abort branches
   * returned without touching state, so the scene stayed in this.scenes at
   * 'directing'/'rendering' with no job anywhere. request() returns any existing
   * scene untouched, so revisiting that station handed back the corpse — the scan
   * animation ran forever, status never reached 'error' so the retry button never
   * appeared, and only a reload recovered. Deleting it means the next request()
   * re-queues honestly. An interrupted operation must land somewhere terminal.
   */
  private discardAborted(key: string): void {
    const scene = this.scenes.get(key);
    if (!scene) return;
    // A frame that already arrived is worth keeping even if a later stage was
    // cancelled; only half-built scenes are discarded.
    if (scene.status === 'ready') return;
    this.scenes.delete(key);
    this.emit();
  }

  private async persist(
    key: string,
    data: {
      heroUrl: string;
      narrative?: string;
      atmosphere?: string;
      direction?: SceneDirection;
      modelUsed?: string;
      coords: SceneCoords;
      viewed: boolean;
    },
  ): Promise<void> {
    const bytes = measure(data.heroUrl);
    const now = Date.now();
    const ok = await putFrame({
      key,
      place: placeKey(data.coords.coordinates),
      coordinates: data.coords.coordinates,
      year: data.coords.year,
      location: data.coords.location,
      styleId: data.coords.styleId,
      heroUrl: data.heroUrl,
      narrative: data.narrative,
      atmosphere: data.atmosphere,
      direction: data.direction,
      modelUsed: data.modelUsed,
      bytes,
      viewed: data.viewed,
      createdAt: now,
      lastSeenAt: now,
    });
    if (!ok) {
      // Was a bare `return`. A permanent write failure is the moment the app
      // stops keeping the frames the visitor paid for, and it happened with no
      // warning, no flag and no emit — the "N kept" counter simply stopped
      // moving and nothing said why.
      console.warn(
        `[looking-glass] could not persist a frame (${Math.round(bytes / 1024)}KB) — ` +
          `storage is full or unavailable. This session still works; frames will ` +
          `not survive a reload.`,
      );
      this.patch(key, { degraded: 'not saved — storage unavailable' });
      return;
    }

    this.persisted.keys.set(key, bytes);
    this.persisted.totalBytes += bytes;
    this.emit();

    // Keep the store under its budget in the background rather than waiting for
    // the browser to start refusing writes.
    if (this.persisted.totalBytes > FRAME_STORE_TARGET_BYTES) {
      const removed = await evict();
      if (removed > 0) this.persisted = await loadIndex();
      this.emit();
    }
  }

  /** True if this exact spacetime is already on disk. Drives the dial's marks. */
  hasStored(coords: SceneCoords): boolean {
    return this.persisted.keys.has(sceneKey(coords));
  }

  /** In-memory LRU eviction. Never evicts anything currently queued or in flight. */
  private evictMemory(): void {
    if (this.scenes.size <= MAX_CACHED_SCENES) return;
    const busy = new Set<string>([
      ...this.active.keys(),
      ...this.queue.map((j) => j.key),
      ...this.filming,
    ]);
    const candidates = [...this.scenes.values()]
      .filter((s) => !busy.has(s.key))
      .sort((a, b) => a.touchedAt - b.touchedAt);
    let over = this.scenes.size - MAX_CACHED_SCENES;
    for (const scene of candidates) {
      if (over <= 0) break;
      // A film is a blob: URL the browser holds until told otherwise; dropping
      // the scene without revoking leaks the whole clip for the session.
      if (scene.videoUrl?.startsWith('blob:')) URL.revokeObjectURL(scene.videoUrl);
      this.scenes.delete(scene.key);
      over--;
    }
  }
}

/**
 * The one-line verdict stored on the scene. Was a regex that dug the provider's
 * own `message` field out of the JSON — which turned an unreadable blob into a
 * readable blob, and still told the user nothing they could act on. The full
 * classification (why, whether retrying helps, what button to press) is carried
 * separately as `errorKind` and rendered by the UI.
 */
/** Title and classification together, so neither can be recorded without the other. */
function failureOf(err: unknown): { error: string; failure: Failure } {
  const f = explainFailure(err);
  return { error: f.title, failure: f };
}

function describe(err: unknown): string {
  return explainFailure(err).title;
}
