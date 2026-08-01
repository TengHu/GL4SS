/**
 * FILM — rendering clips, for one frame or for many.
 *
 * There used to be two of this. `SceneEngine.filmize()` turned a single station
 * into a clip; `CoreSampleRunner.renderFilm()` turned a sweep into a sequence of
 * them. They shared the shape of the problem — submit a video job anchored to
 * frames we already have, survive the provider refusing those frames — and
 * neither knew the other existed, so the single-frame path quietly stayed the
 * worse of the two.
 *
 * The axis that actually matters is not ONE FRAME versus MANY. It is CHAINED
 * versus UNCHAINED:
 *
 *   a clip with a first frame AND a last frame is pinned at both ends. It must
 *   arrive exactly where the next clip begins, so a run of them joins invisibly.
 *
 *   a clip with only a first frame is pinned at one end and wanders from there.
 *
 * A film of ONE frame has no next frame, so it is unpinned — not because the
 * single-frame path is worse, but because N=1 has no closing anchor to offer.
 * That is a fact about the input rather than a difference between two features,
 * and stating it this way is what lets both callers share this file.
 */

import {
  generateVideoBlocking,
  isImageInputRejection,
  isSourceFrameRejection,
} from '../../lib/openrouter';
import type { VideoFrame, VideoJob } from '../../lib/openrouter';

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
