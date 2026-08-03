/**
 * JOIN THE CLIPS INTO ONE FILE, in the browser, with no dependency.
 *
 * A sweep films as N separate clips because that is how they are generated —
 * one per adjacent pair of stills, each pinned at both ends so clip N finishes
 * on the image clip N+1 opens on. Played in the app they run seamlessly. Saved,
 * they are N files, and the thing the visitor actually made is the sequence.
 *
 * NO MUXER, AND THAT IS THE CONSTRAINT. Concatenating MP4 bytes does not produce
 * a playable MP4 — the container carries an index that would have to be rebuilt
 * — and a real muxer is a dependency measured in hundreds of kilobytes for a
 * button. So this plays the clips into a canvas and records the canvas, which is
 * the one route the platform already provides.
 *
 * WHAT THAT COSTS, and it is not hidden from the caller:
 *
 *   - it runs in REAL TIME. Twenty-three four-second clips take ninety seconds,
 *     because the frames only exist as they are played.
 *   - it re-encodes. The output is WebM at the canvas resolution, one generation
 *     lossier than the clips it came from.
 *   - the tab must stay visible. Backgrounded, requestAnimationFrame stops and
 *     the recording stalls — hence `onProgress`, so the UI can say so.
 *
 * Audio comes along when it exists. A sweep of two frames films to a single clip
 * and keeps its sound; anything longer is generated silent on purpose, because
 * each clip would otherwise be scored independently and cut to an unrelated
 * soundtrack at every join. See audioForSequence.
 */

/** Frames per second the canvas is sampled at. */
const FPS = 30;

export interface StitchProgress {
  /** Which clip is playing, 1-based. */
  clip: number;
  clips: number;
}

/**
 * Play every url in order into one recording and resolve with the result.
 *
 * Rejects only if the browser cannot record at all. A clip that fails to load is
 * SKIPPED rather than fatal: the visitor has already paid for the others, and a
 * film with a gap is worth more than an error.
 */
export async function stitchClips(
  urls: string[],
  options: { signal?: AbortSignal; onProgress?: (p: StitchProgress) => void } = {},
): Promise<Blob> {
  if (!urls.length) throw new Error('nothing to join');
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('this browser cannot record video');
  }

  /**
   * The first clip decides the canvas size and every later one is drawn to fit
   * it. They are all asked for at the same aspect, so this is a guard rather
   * than a resize — but a provider returning an odd size must not shear the
   * rest of the film.
   */
  const first = await loadVideo(urls[0]!);
  const width = first.videoWidth || 1280;
  const height = first.videoHeight || 720;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('could not open a canvas to record into');

  const stream = canvas.captureStream(FPS);

  /**
   * Audio is routed through one destination for the whole recording, so a clip
   * that has sound and a clip that does not can sit in the same file. Created
   * lazily: a silent film should not need an AudioContext at all, and some
   * browsers count an unused one against autoplay policy.
   */
  type Audio = { ctx: AudioContext; dest: MediaStreamAudioDestinationNode };
  // A holder rather than a `let`: the only assignment happens inside the closure
  // below, and control-flow analysis then narrows the outer binding to null for
  // the cleanup in `finally`.
  const audio: { current: Audio | null } = { current: null };
  const attachAudio = (el: HTMLVideoElement) => {
    try {
      if (!audio.current) {
        const c = new AudioContext();
        const d = c.createMediaStreamDestination();
        d.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
        audio.current = { ctx: c, dest: d };
      }
      audio.current.ctx.createMediaElementSource(el).connect(audio.current.dest);
    } catch {
      // No sound rather than no film. A cross-origin clip cannot be routed, and
      // that is a silent output, not a failure.
    }
  };

  const mime = pickMime();
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime || 'video/webm' }));
  });

  recorder.start();

  try {
    for (let i = 0; i < urls.length; i++) {
      if (options.signal?.aborted) break;
      options.onProgress?.({ clip: i + 1, clips: urls.length });
      const el = i === 0 ? first : await loadVideo(urls[i]!).catch(() => null);
      if (!el) continue;
      attachAudio(el);
      await playInto(el, ctx, width, height, options.signal);
      el.remove();
    }
  } finally {
    recorder.stop();
    void audio.current?.ctx.close();
  }

  return done;
}

/** WebM is what MediaRecorder actually produces; the codec preference is best-effort. */
function pickMime(): string {
  for (const m of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('video');
    // Provider CDNs serve clips cross-origin; without this the canvas is tainted
    // and the recording produces nothing readable.
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.muted = false;
    el.playsInline = true;
    el.onloadeddata = () => resolve(el);
    el.onerror = () => reject(new Error(`could not load ${src.slice(0, 40)}`));
    el.src = src;
  });
}

/**
 * Draw one clip to the canvas until it ends, at the rate it plays.
 *
 * requestAnimationFrame rather than a timer, so the canvas is sampled on the
 * same clock the browser composites on and the recording does not tear. It also
 * means a backgrounded tab stops producing frames — the reason the caller is
 * told to keep it visible.
 */
function playInto(
  el: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    let raf = 0;
    const stop = () => {
      cancelAnimationFrame(raf);
      el.pause();
      resolve();
    };
    const tick = () => {
      if (signal?.aborted || el.ended) return stop();
      ctx.drawImage(el, 0, 0, width, height);
      raf = requestAnimationFrame(tick);
    };
    el.onended = stop;
    void el.play().then(tick).catch(stop);
  });
}
