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
 * VIDEO ONLY. There was an audio path and it was the bug: the clips were routed
 * through an AudioContext into the canvas stream, the context sits suspended
 * under autoplay policy, playback has to be muted for `play()` to be allowed at
 * all — so no samples ever reached the destination, and MediaRecorder given a
 * track that never delivers stalls the muxer and writes a header with nothing
 * after it. A valid file containing no video, which is the worst shape a bug can
 * take.
 *
 * Nothing is lost by removing it. A film of more than one clip is GENERATED
 * silent on purpose — see audioForSequence — and a film of exactly one is handed
 * back untouched below, sound and all.
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

  /**
   * ONE CLIP IS ALREADY THE FILM. Hand back its bytes.
   *
   * The OUTPUT is the same either way — one video file, MP4 — and only the route
   * differs, because there is nothing here to join. No canvas, no recorder, no
   * re-encode and no real-time wait. The provider sends MP4 and MediaRecorder is
   * asked for MP4, so the two paths agree on what comes out; the caller should
   * not be able to tell which ran, and the button no longer says.
   */
  if (urls.length === 1) {
    return await (await fetch(urls[0]!)).blob();
  }
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
   * Counted, because an empty recording still produces a valid file.
   *
   * The first version shipped a 110-byte WebM — a header and no frames — and
   * downloaded it without complaint. A silent bad output is worse than an error:
   * the visitor has a file, believes it worked, and finds out later.
   */
  let drawn = 0;

  const mime = pickMime();
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime || 'video/webm' }));
  });

  // Chunked, so a long film is not held whole in one buffer until it stops.
  recorder.start(1000);

  try {
    for (let i = 0; i < urls.length; i++) {
      if (options.signal?.aborted) break;
      options.onProgress?.({ clip: i + 1, clips: urls.length });
      const el = i === 0 ? first : await loadVideo(urls[i]!).catch(() => null);
      if (!el) continue;
      await playInto(el, ctx, width, height, () => { drawn++; }, options.signal);
      el.remove();
    }
  } finally {
    // Already inactive if it never started; stop() throws on that.
    if (recorder.state !== 'inactive') recorder.stop();
    first.remove();
  }

  const blob = await done;
  if (!drawn) {
    throw new Error('the clips would not play, so nothing was recorded');
  }
  if (blob.size < 1024) {
    throw new Error(`${drawn} frames drawn but the recorder wrote ${blob.size} bytes`);
  }
  return blob;
}

/**
 * MP4 IF THE BROWSER WILL, WebM IF IT WILL NOT.
 *
 * MediaRecorder produced WebM only for years, which is why this used to ask for
 * nothing else — and a .webm is a file half the world's players and every phone
 * gallery will refuse. Current Chrome and Safari will mux H.264 into MP4 from a
 * canvas stream, so that is asked for first and the WebM path is left as the
 * fallback rather than the assumption.
 */
function pickMime(): string {
  for (const m of [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

/** The extension the bytes actually deserve — see the .webm that held MP4. */
export function extensionFor(blob: Blob): string {
  if (blob.type.includes('mp4')) return 'mp4';
  if (blob.type.includes('webm')) return 'webm';
  if (blob.type.includes('quicktime')) return 'mov';
  return 'mp4';
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('video');
    // Provider CDNs serve clips cross-origin; without this the canvas is tainted
    // and the recording produces nothing readable.
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    /**
     * MUTED, ALWAYS. Two reasons and both are load-bearing.
     *
     * A muted video is always allowed to autoplay; an unmuted one is not, and
     * the click that started this has been through several awaits by the time
     * playback begins, so its user-activation has expired. That rejection is
     * what produced an empty recording once already.
     *
     * And the elements are IN the document now, so an unmuted join would play
     * every clip out loud through the speakers while it recorded. There is no
     * audio in the output either way — see the header.
     */
    el.muted = true;
    el.playsInline = true;
    /**
     * IN THE DOCUMENT, off to one side. A detached video element plays in some
     * browsers and not others, and this is a button whose failure mode is a file
     * that looks fine and contains nothing.
     */
    el.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0';
    document.body.appendChild(el);
    el.onloadeddata = () => resolve(el);
    el.onerror = () => {
      el.remove();
      reject(new Error(`could not load ${src.slice(0, 40)}`));
    };
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
  onFrame: () => void,
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
      onFrame();
      raf = requestAnimationFrame(tick);
    };
    el.onended = stop;
    void el.play().then(tick).catch(stop);
  });
}
