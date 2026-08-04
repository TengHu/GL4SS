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
   * ONE CLIP THAT IS ALREADY MP4 IS ALREADY THE FILM. Hand back its bytes: no
   * canvas, no encoder, no re-encode, no real-time wait.
   *
   * Only when it is already MP4. Anything else falls through to the encoder, so
   * the answer to "what do I get" is MP4 whatever the clip count and whatever
   * the provider sent.
   */
  if (urls.length === 1) {
    const only = await (await fetch(urls[0]!)).blob();
    // Passthrough ONLY if it is already MP4. Anything else goes through the
    // encoder below, so the answer to "what do I get" is one word regardless of
    // clip count or what the provider happened to send.
    if (only.type.includes('mp4')) return only;
  }
  /**
   * ENCODED WITH WebCodecs AND MUXED TO MP4, not recorded.
   *
   * MediaRecorder was the wrong tool. Whether it can write MP4 at all is up to
   * the browser, so the container came out WebM on some machines and MP4 on
   * others for the same code — and a .webm is a file half the world's players
   * and every phone gallery will refuse.
   *
   * VideoEncoder takes frames and returns H.264 chunks, mp4-muxer puts them in
   * an MP4 box structure, and neither asks the browser's permission about the
   * container. The output is MP4 on anything with WebCodecs, which is every
   * browser this app already requires for the rest of what it does.
   */
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

  const first = await loadVideo(urls[0]!);
  // Even dimensions: H.264 encodes in 16x16 macroblocks and an odd width or
  // height is rejected outright by some encoders.
  const width = (first.videoWidth || 1280) & ~1;
  const height = (first.videoHeight || 720) & ~1;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('could not open a canvas to encode from');

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    fastStart: 'in-memory',
  });

  /**
   * THE CODEC STRING IS A CEILING, NOT A LABEL.
   *
   * This was hardcoded `avc1.42001f` — Baseline level 3.1, which tops out at
   * 1280x720. Handed anything larger the encoder errors, CLOSES ITSELF, and the
   * next call fails with "cannot call flush on a closed codec": a message about
   * the corpse rather than the cause, which is what you get for guessing a level
   * instead of asking.
   *
   * So ask. isConfigSupported answers for this browser at this size, and the
   * list runs high-profile-first down to the baseline that was there before.
   */
  const candidates = ['avc1.640034', 'avc1.4d0034', 'avc1.42E034', 'avc1.640028', 'avc1.42001f'];
  let config: VideoEncoderConfig | null = null;
  for (const codec of candidates) {
    const attempt: VideoEncoderConfig = { codec, width, height, bitrate: 6_000_000, framerate: FPS };
    if ((await VideoEncoder.isConfigSupported(attempt)).supported) {
      config = attempt;
      break;
    }
  }
  if (!config) {
    throw new Error(`no H.264 encoder here accepts ${width}x${height}`);
  }

  /**
   * The encoder reports failures HERE, asynchronously, and closes itself. Held
   * so the throw at the end can name what actually went wrong.
   */
  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError ??= e instanceof Error ? e : new Error(String(e));
      console.warn('[looking-glass] encoder —', e);
    },
  });
  encoder.configure(config);

  let drawn = 0;
  let lastKeyframe = -Infinity;
  const startedAt = performance.now();
  /**
   * TIMESTAMPS COME FROM THE CLOCK, not from a frame counter.
   *
   * They were `drawn / 30`, which assumes exactly thirty frames are captured per
   * second. Frames are captured on requestAnimationFrame, which runs at the
   * DISPLAY's rate — 120Hz on a ProMotion screen — so four seconds of clip
   * produced 480 frames, stamped as sixteen seconds. Three four-second clips
   * came out as a 48-second file in quarter-speed slow motion, and the same
   * build on a 60Hz monitor would have produced half-speed. The output rate
   * cannot depend on the monitor.
   *
   * Elapsed real time since the join began is right for both reasons: it tracks
   * playback exactly whatever the refresh rate, and it keeps running ACROSS
   * clips, so clip two follows clip one instead of sitting on top of it — which
   * is what the counter was there for.
   */
  const encode = () => {
    const at = (performance.now() - startedAt) * 1000;
    const frame = new VideoFrame(canvas, { timestamp: at, duration: 1e6 / FPS });
    // Keyframe every second: a film with no keyframes cannot be seeked.
    // Dropped rather than queued without limit: frames arrive on the display
    // clock and the encoder drains on its own, and an unbounded queue is how a
    // long film runs the tab out of memory.
    if (encoder.encodeQueueSize < 30) {
      // One keyframe a second of REAL time, for the same reason.
      const key = at - lastKeyframe >= 1e6;
      if (key) lastKeyframe = at;
      encoder.encode(frame, { keyFrame: key });
      drawn++;
    }
    frame.close();
  };

  try {
    for (let i = 0; i < urls.length; i++) {
      if (options.signal?.aborted) break;
      options.onProgress?.({ clip: i + 1, clips: urls.length });
      const el = i === 0 ? first : await loadVideo(urls[i]!).catch(() => null);
      if (!el) continue;
      await playInto(el, ctx, width, height, encode, options.signal);
      el.remove();
    }
  } finally {
    first.remove();
  }

  // Never flush a codec that has already died — that throws over the top of the
  // real error and hides it.
  if (encoder.state === 'configured') await encoder.flush();
  if (encoder.state !== 'closed') encoder.close();
  muxer.finalize();

  if (encoderError) throw encoderError;
  if (!drawn) throw new Error('the clips would not play, so nothing was encoded');
  const buffer = (muxer.target as InstanceType<typeof ArrayBufferTarget>).buffer;
  if (!buffer || buffer.byteLength < 1024) {
    throw new Error(`${drawn} frames encoded but the muxer wrote nothing`);
  }
  return new Blob([buffer], { type: 'video/mp4' });
}

/**
 * What MediaRecorder will accept, preferring MP4.
 *
 * No longer used to JOIN anything — that goes through WebCodecs now, which does
 * not leave the container up to the browser. It survives for the local test,
 * whose stand-in clips have to be recorded somehow and should match what a
 * provider sends.
 *
 * Exported so the local test records its stand-in clips the same way, and so a
 * caller can ask what this browser is actually capable of rather than assume.
 */
export function pickMime(): string {
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
