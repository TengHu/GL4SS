/**
 * The portal itself: a full-bleed view with the generated frame behind glass.
 *
 * Crossfading is done with two stacked layers rather than swapping one `src`,
 * because swapping a src shows a blank frame for however long decode takes.
 * We hold the outgoing frame on screen until the incoming one has actually
 * decoded, so a scrub between two cached stations never flashes black.
 */

import { useEffect, useRef, useState } from 'react';
import type { Scene } from '../lib/engine';
import { eraFieldCss } from '../lib/eraField';
import { clampSeam } from '../lib/pin';
import { Warp } from './Warp';
import type { JumpCharacter } from '../lib/pin';

interface Props {
  year: number;
  scene: Scene | undefined;
  /**
   * The frame to keep on screen when the tuned station has none of its own.
   * Tuning is free and reversible; emptying the viewport every time the dial
   * moves would make browsing feel destructive. See Portal.tsx `displayed`.
   */
  holdover?: Scene | null;
  /** Suppress the ken-burns drift while the user is actively dragging. */
  scrubbing: boolean;
  /** Raised when a frame the engine called 'ready' cannot actually be decoded. */
  onFrameError?: (key: string, message: string) => void;
  /** The held frame, when a pin is active and applies here. */
  pinned?: Scene;
  pinnedSideValue?: 'left' | 'right';
  pinnedAccent?: string;
  pinnedLabel?: string;
  /** Signed year distance, shown only during a seam drag. */
  deltaLabel?: string;
  /** Current seam position 0..1; owned by Portal so it survives remounts. */
  seam?: number;
  onSeamChange?: (fraction: number) => void;
  /** Hard-cut blink: show the held frame full screen while held. */
  peeking?: boolean;
  /** Direction and distance of the move that led here, for the waiting state. */
  jump?: JumpCharacter | null;
  /** A rendered film for this station, played in place of the still. */
  videoUrl?: string;
  /** Peripheral frames [left, right]; with the hero they form a panorama. */
  wideUrls?: string[];
}

interface Layer {
  url: string;
  id: number;
}

export function PortalView({
  year,
  scene,
  holdover = null,
  scrubbing,
  onFrameError,
  pinned,
  pinnedSideValue = 'left',
  pinnedAccent = '#ffd166',
  pinnedLabel = '',
  deltaLabel = '',
  seam = 0.5,
  onSeamChange,
  peeking = false,
  jump = null,
  videoUrl,
  wideUrls,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [current, setCurrent] = useState<Layer | null>(null);
  const [previous, setPrevious] = useState<Layer | null>(null);
  const [dragging, setDragging] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const layerId = useRef(0);
  const comparing = Boolean(pinned?.heroUrl);

  /**
   * What is actually on the glass: this station's frame once it has one, and
   * until then whatever we were last looking at.
   *
   * EXCEPT while comparing, where the holdover is suppressed. A wipe is a claim
   * that the two sides of the seam are the held frame and the frame you are
   * standing in; letting a holdover fill the live side would silently compare the
   * pin against some THIRD station the user browsed past. With it suppressed the
   * pinned photograph fills the screen and the new era develops into the wedge as
   * it lands, which is the behaviour the seam was designed around.
   */
  const shown = scene?.status === 'ready' ? scene : comparing ? undefined : holdover ?? undefined;
  const heroUrl = shown?.heroUrl;

  // Peek is a HARD CUT, not a crossfade: a blink comparator only works if the
  // two images land on the same retinal position with nothing in between. The
  // seam jumps to fully-pinned and back with no transition at all.
  const effectiveSeam = peeking ? (pinnedSideValue === 'left' ? 1 : 0) : seam;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    el.style.setProperty('--seam', `${(effectiveSeam * 100).toFixed(3)}%`);
  }, [effectiveSeam]);

  // The photograph IS the drag surface — no handle, no grip. Handlers are
  // attached only while comparing, so the gesture does not exist in normal use
  // and cannot be mis-fired.
  // Tracked in a ref as well as state: state drives the delta label, but a move
  // arriving before React has re-rendered would be dropped if the guard read
  // state, losing the first frames of a fast drag.
  const draggingRef = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!comparing || e.button !== 0 || !onSeamChange) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragging(true);
    onSeamChange(clampSeam(e.clientX / window.innerWidth));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !onSeamChange) return;
    onSeamChange(clampSeam(e.clientX / window.innerWidth));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  // Preload, then promote. `cancelled` guards against a fast scrub resolving
  // out of order and leaving a stale frame on top.
  useEffect(() => {
    if (!heroUrl) return;
    if (current?.url === heroUrl) return;

    let cancelled = false;
    const img = new Image();
    img.decoding = 'async';
    img.src = heroUrl;

    const promote = () => {
      if (cancelled) return;
      const next = { url: heroUrl, id: ++layerId.current };
      setPrevious(current);
      setCurrent(next);
    };

    if (img.complete) {
      promote();
    } else {
      img.onload = promote;
      // A frame the engine called 'ready' but that will not decode — an expired
      // provider URL, a truncated data URL, a 404 — used to be swallowed by an
      // empty handler. The scene stayed 'ready', so the caption and dial claimed
      // success while the PREVIOUS station's photograph sat underneath it: the
      // user is told they are in 1890 and shown 120 AD. Reporting it lets the
      // scene become a retryable error instead of a silent lie.
      // Keyed to `shown`, not to the tuned station: with a holdover on screen
      // those are routinely different scenes, and blaming a decode failure on
      // whichever station the dial happens to be pointing at would mark a
      // perfectly good frame as broken while leaving the broken one 'ready'.
      img.onerror = () => {
        if (cancelled || !shown) return;
        onFrameError?.(shown.key, 'the frame arrived but could not be decoded');
      };
    }
    return () => {
      cancelled = true;
    };
  }, [heroUrl, current, shown, onFrameError]);

  /**
   * Whether the layer we're holding is now describing nothing at all.
   *
   * This used to fire whenever the tuned station had no frame, which cleared the
   * viewport on every scrub. That was the wrong half of the problem to solve: the
   * danger was never "an old photograph is visible", it was "an old photograph is
   * visible while the UI claims it is a different year". The caption now names
   * `shown`, not the dial, so the picture is free to stay — and this guard is
   * back to its literal meaning of having genuinely nothing to display.
   */
  const currentIsStale = Boolean(current) && !heroUrl;

  // Retire the outgoing layer once its fade has finished.
  useEffect(() => {
    if (!previous) return;
    const t = setTimeout(() => setPrevious(null), 900);
    return () => clearTimeout(t);
  }, [previous]);

  const status = scene?.status;
  const focusing = status === 'queued' || status === 'directing' || status === 'rendering';
  const arrival: JumpCharacter = jump ?? { direction: 'forward', reach: 'near', distance: 0 };

  /**
   * THE WORMHOLE'S DEPARTURE.
   *
   * `{focusing && ...}` cut the tunnel out of the DOM mid-frame, so the most
   * expensive visual moment in the app ended on a hard unmount. It now leaves
   * under its own power, and the direction of that exit carries the outcome:
   * expanding PAST the viewer means the frame arrived, collapsing inward means
   * it did not. Which is why the departure has to be captured at the transition
   * — once `scene` moves on, the reason the tunnel closed is gone.
   */
  const [warpOut, setWarpOut] = useState<'closing' | 'failing' | null>(null);
  const [wasFocusing, setWasFocusing] = useState(focusing);

  // The departure is a transition, so it is computed at the transition, during
  // render. Seeded with the CURRENT value so a mount with the tunnel already
  // shut does not read as one that just closed and play an arrival that never
  // happened. An effect ran a commit later, which put the closing animation a
  // frame behind the frame it was supposed to be revealing.
  if (focusing !== wasFocusing) {
    setWasFocusing(focusing);
    // A new render restarts the tunnel; any departure in flight is void.
    setWarpOut(!focusing ? (status === 'error' ? 'failing' : 'closing') : null);
  }

  /**
   * Retire the departing tunnel once its animation has finished — the same
   * idiom as the outgoing frame layer above, and keyed on `warpOut` ALONE for
   * the same reason it matters there: a timer hung off the [focusing, status]
   * effect is cleared by React on any status change that lands inside the
   * 440ms — a scrub to another station, an error settling — and the wrapper
   * would then never unmount. `forwards` would hide the stuck layer for most
   * people, but prefers-reduced-motion disables the departure animation
   * outright, so for those users it would be a permanent wash over every
   * photograph. 440ms clears the longer of the two exits (420ms) with a frame
   * to spare.
   */
  useEffect(() => {
    if (!warpOut) return;
    const t = setTimeout(() => setWarpOut(null), 440);
    return () => clearTimeout(t);
  }, [warpOut]);

  return (
    <div
      ref={hostRef}
      // BOTH OPT-OUTS ARE LOAD-BEARING. --seam is a registered custom property
      // and .portal-view transitions it, which is what keeps the pinned frame's
      // clip-path, the scan's clip-path and the seam's `left` from ever falling
      // out of step. But an eased seam is wrong in exactly two states: under the
      // finger it lags the pointer by most of half a second, and during the
      // Space blink it turns the hard cut built at lines 96-99 into the wipe
      // that comparator was written to escape. These two flags are how the
      // stylesheet switches the transition off; drop either and the regression
      // is silent, because the seam still moves — just late.
      className={`portal-view${comparing ? ' portal-view--comparing' : ''}${
        dragging ? ' portal-view--dragging' : ''
      }`}
      data-peek={peeking ? 'on' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* Latent era light — always present, sits under any frame. */}
      <div
        className="portal-field"
        style={{ background: eraFieldCss(year) }}
        aria-hidden="true"
      />

      {/* WIDENED: the three frames as an actual panorama.
          "Widen the view" previously produced two thumbnails in the corner, which
          is not what the words say and not what anyone expects — the view did not
          get wider, it got two footnotes. Rendered side by side, the peripheral
          subjects do what they were generated for: extend the scene past the
          edges of the hero. */}
      {wideUrls?.length === 2 && current && (
        <div className="pano" aria-label="Widened panorama">
          <span style={{ backgroundImage: `url("${wideUrls[0]}")` }} />
          <span style={{ backgroundImage: `url("${current.url}")` }} />
          <span style={{ backgroundImage: `url("${wideUrls[1]}")` }} />
        </div>
      )}

      {previous && (
        <div
          key={previous.id}
          className="portal-frame portal-frame--out"
          style={{ backgroundImage: `url("${previous.url}")` }}
          aria-hidden="true"
        />
      )}
      {current && (
        <div
          key={current.id}
          // Drift is disabled while comparing: two ken-burns animations running
          // out of phase would slide the two eras against each other, destroying
          // the registration that is the entire point of a wipe.
          className={
            currentIsStale
              ? 'portal-frame portal-frame--out'
              : `portal-frame portal-frame--in${scrubbing || comparing ? '' : ' portal-frame--drift'}`
          }
          style={{ backgroundImage: `url("${current.url}")` }}
          role="img"
          aria-label={shown?.narrative ?? 'Generated temporal view'}
        />
      )}

      {/* The held frame, clipped to its side of the seam. Mounted ABOVE the live
          layer, so when the live station has no picture yet the pinned
          photograph simply fills the screen and the new era develops into the
          wedge as it lands — the app's worst wait becomes its best frame. */}
      {pinned?.heroUrl && (
        <div
          className="portal-frame portal-pinned"
          style={{
            backgroundImage: `url("${pinned.heroUrl}")`,
            clipPath:
              pinnedSideValue === 'left'
                ? 'inset(0 calc(100% - var(--seam)) 0 0)'
                : 'inset(0 0 0 var(--seam))',
          }}
          role="img"
          aria-label={pinned.narrative ?? 'Held frame'}
        />
      )}

      {/* The film, when one exists. Sits above the still so the still remains
          the thing underneath — a failed or ended clip reveals a picture rather
          than a black rectangle. Starts muted because browsers refuse audible
          autoplay, with an explicit control to turn the sound on. */}
      {videoUrl && (
        <>
          <video
            ref={videoRef}
            className="portal-video"
            src={videoUrl}
            autoPlay
            loop
            playsInline
            muted={muted}
          />
          <button
            className="portal-sound"
            onClick={() => {
              const next = !muted;
              setMuted(next);
              const el = videoRef.current;
              if (el && !next) void el.play().catch(() => setMuted(true));
            }}
            aria-pressed={!muted}
          >
            {/* No emoji. Two of them were the most `app` thing on screen, on the
                one control that lives INSIDE the frame — the chip is machined
                metal and the state is already carried by aria-pressed and by
                the era colour the stylesheet puts in the type. */}
            {muted ? 'sound off' : 'sound on'}
          </button>
        </>
      )}

      {/* Glass: vignette + a faint chromatic rim so it reads as a lens. */}
      <div className="portal-glass" aria-hidden="true" />
      {/* Time travel, expressed while the frame renders. Direction decides which
          way the streaks fly; distance decides how hard. */}
      {/* Always shown while a frame renders. Gating this on `jump` meant the
          FIRST generation of a session had no effect at all — the jump character
          only exists once the index has changed, and on a fresh load or a lever
          pull without moving it is null. Arriving somewhere is a forward move
          of no particular distance, so that is the default. */}
      {(focusing || warpOut) && (
        <div
          className={`warp warp--${arrival.direction} warp--${arrival.reach}${
            warpOut ? ` warp--${warpOut}` : ''
          }`}
          aria-hidden="true"
        >
          {/* The shader is the real effect. The gradient layers stay as the
              fallback for no-WebGL and for prefers-reduced-motion, where CSS can
              simply stop them and a canvas cannot.
              GATED ON `focusing`, NOT on the wrapper: the canvas goes at t=0 so
              the GPU is handed back the instant the render lands, which is
              exactly when a multi-megabyte photograph needs to decode. The CSS
              layers below it are what actually plays the departure, and they
              cost nothing — .warp--closing/--failing stop their loops and
              animate opacity and transform only. */}
          {focusing && <Warp jump={arrival} />}
          <span className="warp-streaks" />
          <span className="warp-wash" />
        </div>
      )}

      <div
        className={`portal-scan${focusing ? ' portal-scan--active' : ''}`}
        style={
          pinned?.heroUrl
            ? {
                // Confine the "developing" sweep to the live side so it does not
                // wash across a finished photograph.
                clipPath:
                  pinnedSideValue === 'left'
                    ? 'inset(0 0 0 var(--seam))'
                    : 'inset(0 calc(100% - var(--seam)) 0 0)',
              }
            : undefined
        }
        aria-hidden="true"
      />

      {pinned?.heroUrl && (
        <div
          className={`seam${dragging ? ' seam--dragging' : ''}`}
          style={{ left: 'var(--seam)', ['--seam-accent' as string]: pinnedAccent }}
          aria-hidden="true"
        >
          <span className="seam-tick" />
          <span className="seam-label">{pinnedLabel}</span>
          {dragging && <span className="seam-delta">{deltaLabel}</span>}
        </div>
      )}
    </div>
  );
}
