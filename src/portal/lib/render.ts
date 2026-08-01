/**
 * RENDER — one still, or one clip, from the anchors we already hold.
 *
 * Two primitives, one shape. Both are asked to produce an artifact at a station
 * on the ladder; both are offered frames we already own as anchors; and both
 * have to survive the provider refusing those anchors, because providers
 * moderate INPUT FRAMES separately from prompts and our frames contain people.
 *
 * THE AXIS IS NOT ONE VERSUS MANY. IT IS ANCHORED VERSUS UNANCHORED.
 *
 *   a still handed the previous still holds the camera where it was.
 *   a still handed nothing is free to frame the place however it likes.
 *
 *   a clip with a first AND a last frame is pinned at both ends: it must arrive
 *   exactly where the next clip begins, so a run of them joins invisibly.
 *   a clip with only a first frame is pinned at one end and wanders from there.
 *
 * The single-station cases are the degenerate inputs, not lesser features. An
 * ordinary lever pull is a still with no predecessor to anchor to; a film of one
 * frame has no next frame to close on. Both fall out of N rather than being
 * separate code, which is what these two functions exist to make true — there
 * used to be a copy of each of them in SceneEngine and another in
 * CoreSampleRunner, and the single-station copies were quietly the worse ones.
 *
 * WHAT DEGRADING MEANS HERE. Every step down returns a usable artifact and says
 * which step it took. Returning something slightly worse to someone who has
 * already been billed beats returning nothing; presenting it as the intended
 * result without saying so is what would be dishonest, so `onDegrade` is not
 * optional decoration — it is how the UI knows to mark the seam.
 */

import {
  generateImageWithFallback,
  generateVideoBlocking,
  isImageInputRejection,
  isSourceFrameRejection,
} from '../../lib/openrouter';
import type { VideoFrame, VideoJob } from '../../lib/openrouter';

// ============================================================================
// STILLS
// ============================================================================

export interface StillSpec {
  model: string;
  /**
   * Candidate prompts, focal subject first. Later entries are moderation
   * fallbacks: a blocked frame degrades to a different subject in the same
   * moment rather than to nothing.
   */
  prompts: string[];
  /** A frame to hold the camera on. Absent for an ordinary single station. */
  reference?: string;
  /**
   * Prompts to use if the reference is refused.
   *
   * Required to differ, because an anchored prompt TALKS ABOUT the attached
   * image — retrying with it after the attachment has been dropped would leave
   * the model reading instructions about a picture that is no longer there.
   */
  unanchoredPrompts?: string[];
}

export interface StillResult {
  url: string;
  /** True only when a reference was offered AND accepted. */
  anchored: boolean;
  /** How many candidate prompts the provider moderated before one rendered. */
  moderatedCount: number;
  /** Set when a moderation rescue rendered on a model other than the requested one. */
  modelUsed: string;
}

/**
 * Render one still, dropping the anchor rather than failing if it is refused.
 *
 * With no reference this is exactly the call the portal has always made for a
 * single station — same candidates, same model, same moderation ladder inside
 * `generateImageWithFallback`. That path must stay byte-identical: it is the
 * app's primary action, and a refactor is not a licence to change what the
 * lever does.
 */
export async function renderStill(
  apiKey: string,
  spec: StillSpec,
  options: { signal?: AbortSignal; onDegrade?: (note: string) => void } = {},
): Promise<StillResult> {
  if (spec.reference) {
    try {
      const r = await generateImageWithFallback(apiKey, spec.prompts, spec.model, {
        signal: options.signal,
        reference: spec.reference,
      });
      return { url: r.url, anchored: true, moderatedCount: r.moderatedCount, modelUsed: r.modelUsed };
    } catch (err) {
      /**
       * Only a STRUCTURAL refusal drops the anchor. Moderation is handled
       * inside generateImageWithFallback, and treating a moderated prompt as an
       * input-image problem would silently give up continuity every time a
       * frame happened to contain a gladiator.
       */
      if (options.signal?.aborted || !isImageInputRejection(err)) throw err;
      options.onDegrade?.('the previous frame was refused — this one is unanchored');
    }
  }

  const r = await generateImageWithFallback(
    apiKey,
    spec.unanchoredPrompts ?? spec.prompts,
    spec.model,
    { signal: options.signal },
  );
  return { url: r.url, anchored: false, moderatedCount: r.moderatedCount, modelUsed: r.modelUsed };
}

// ============================================================================
// CLIPS
// ============================================================================

export interface ClipSpec {
  prompt: string;
  model: string;
  seconds: number;
  resolution: '720p' | '1080p';
  /** The opening frame. Omitted only when the caller has none to offer. */
  first?: string;
  /** The closing frame. Present only when something follows this clip. */
  last?: string;
  /**
   * Native audio.
   *
   * True for a lone clip, false across a sequence — and that is a rule about
   * JOINS, not a preference. Every capable model scores each clip independently,
   * so a filmed sweep with audio on would cut to an unrelated soundtrack every
   * few seconds and undo the continuity the pinning exists to create. One clip
   * has no join to disrupt, so it keeps its sound.
   */
  audio: boolean;
}

export interface ClipResult {
  url: string;
  /** False when the closing frame was refused: this clip will not land on the next. */
  pinned: boolean;
  /** False when even the opening frame was refused, so the clip is a fresh scene. */
  continuous: boolean;
}

/** True when a sequence of this many clips should carry sound. See ClipSpec.audio. */
export function audioForSequence(clipCount: number): boolean {
  return clipCount <= 1;
}

/**
 * Render one clip, degrading rather than failing when frames are refused.
 *
 * Providers moderate INPUT FRAMES separately from the prompt, and our frames
 * contain people, so refusal is the common path rather than an edge case. There
 * are two things to lose and they are worth losing in this order:
 *
 *   1. the closing frame — costs seamlessness at one join
 *   2. the opening frame — costs continuity with the picture on screen
 *
 * Losing both still returns a clip of the right moment, which beats returning
 * nothing to someone who has already been billed for the attempt. Each step down
 * is reported back so the UI can say which one happened instead of presenting a
 * degraded clip as the intended one.
 */
export async function renderClip(
  apiKey: string,
  spec: ClipSpec,
  options: {
    signal?: AbortSignal;
    onStatus?: (job: VideoJob) => void;
    onDegrade?: (note: string) => void;
  } = {},
): Promise<ClipResult> {
  const base = {
    model: spec.model,
    prompt: spec.prompt,
    duration: spec.seconds,
    resolution: spec.resolution,
    aspect_ratio: '16:9' as const,
    generate_audio: spec.audio,
  };

  const run = (frames: VideoFrame[]) =>
    generateVideoBlocking(
      apiKey,
      { ...base, ...(frames.length ? { frames } : {}) },
      {
        onStatus: options.onStatus,
        /**
         * Comfortably above what any UI promises. Measured basis: a 4s clip
         * took ~4 minutes.
         */
        maxWaitMs: Math.max(10, spec.seconds * 2) * 60 * 1000,
      },
    );

  const refused = (err: unknown) => isSourceFrameRejection(err) || isImageInputRejection(err);

  // Both ends, when there is a next frame to arrive at.
  if (spec.first && spec.last) {
    try {
      const url = await run([
        { url: spec.first, frame_type: 'first_frame' },
        { url: spec.last, frame_type: 'last_frame' },
      ]);
      return { url, pinned: true, continuous: true };
    } catch (err) {
      if (options.signal?.aborted || !refused(err)) throw err;
      options.onDegrade?.('closing frame refused — this join will be a cut');
    }
  }

  // Opening frame only: the clip continues from the picture on screen.
  if (spec.first) {
    try {
      const url = await run([{ url: spec.first, frame_type: 'first_frame' }]);
      return { url, pinned: false, continuous: true };
    } catch (err) {
      if (options.signal?.aborted || !refused(err)) throw err;
      options.onDegrade?.('the still was refused as a source — rendering fresh');
    }
  }

  const url = await run([]);
  return { url, pinned: false, continuous: false };
}
