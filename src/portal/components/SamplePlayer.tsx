/**
 * THE CORE SAMPLE PLAYER.
 *
 * A finished sample is a sequence of stills, not a video file, so playback is
 * done here rather than by a <video> element: every ready frame is mounted and
 * only one is opaque at a time. That costs memory and buys two things worth
 * having — a hard-cut or crossfade with no decode stall between frames, and a
 * filmstrip that can be scrubbed instantly because nothing has to be re-fetched.
 *
 * WHILE THE SWEEP IS STILL RUNNING the player follows the newest frame, so the
 * wait is spent watching the place assemble itself rather than watching a
 * progress bar. The first interaction with the transport stops it following:
 * once someone has taken hold of the strip, yanking them back to the front of it
 * every fifteen seconds is hostile.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CoreSampleState } from '../lib/coreSample';
import { formatYear, getEraBand } from '../../lib/format';

interface Props {
  state: CoreSampleState;
  onCancel: () => void;
  onClose: () => void;
}

/** Frames per second of playback. Slow enough to read the year, fast enough to move. */
const SPEEDS = [1.5, 3, 6] as const;

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function SamplePlayer({ state, onCancel, onClose }: Props) {
  const running = state.status === 'running';
  const ready = useMemo(
    () => state.frames.filter((f) => f.status === 'ready' && f.url),
    [state.frames],
  );

  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(3);
  const [follow, setFollow] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const hostRef = useRef<HTMLDivElement>(null);

  // Ticks only while there is an elapsed counter on screen.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  /**
   * What is actually on the glass.
   *
   * DERIVED, not synced. Following the build by writing the newest index into
   * `cursor` from an effect would be a setState cascade on every frame that
   * lands — and `cursor` would then hold two meanings at once (where the user
   * put it, and where the sweep has got to) with nothing to say which. Here
   * `follow` is the claim and `cursor` is only ever the user's own position.
   */
  const last = Math.max(0, ready.length - 1);
  const shownIndex = follow ? last : Math.min(cursor, last);

  // Autoplay. Stops at the end rather than looping: a core sample has a
  // direction, and dumping the viewer back in the Triassic without warning
  // reads as a glitch rather than as a loop.
  useEffect(() => {
    if (!playing || ready.length < 2) return;
    const id = setInterval(() => {
      setCursor((c) => {
        if (c >= ready.length - 1) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [playing, speed, ready.length]);

  useEffect(() => {
    hostRef.current?.focus();
  }, []);

  /**
   * Hand control to the user.
   *
   * Seeds `cursor` from wherever the picture actually is before running the
   * gesture, so the first arrow press after watching the build steps from the
   * frame on screen rather than from wherever `cursor` was last left — which,
   * while following, is 0.
   */
  const take = (next: (from: number) => number | void) => {
    setFollow(false);
    const to = next(shownIndex);
    if (typeof to === 'number') setCursor(Math.max(0, Math.min(last, to)));
    else setCursor(shownIndex);
  };

  /**
   * Play/pause. Pressing play while parked on the LAST frame restarts from the
   * beginning rather than doing nothing — which is where the transport always
   * is after watching a sweep build itself, and therefore the single most
   * likely moment for someone to press it.
   */
  const togglePlay = () => {
    setFollow(false);
    if (playing) {
      setCursor(shownIndex);
      setPlaying(false);
      return;
    }
    setCursor(shownIndex >= last ? 0 : shownIndex);
    setPlaying(true);
  };

  const frame = ready[shownIndex];
  const errored = state.frames.filter((f) => f.status === 'error').length;
  const unchained = ready.filter((f) => f.chained === false && !f.restored).length;

  return (
    <div
      className="sampler"
      role="dialog"
      aria-modal="true"
      aria-label="Core sample"
      ref={hostRef}
      tabIndex={-1}
      /* The player owns the keyboard while it is open. Portal's global handler
         is still listening on window for arrows and Enter, and without this the
         same keys would scrub the strip AND retune the dial underneath. */
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
          return;
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          const d = e.key === 'ArrowRight' ? 1 : -1;
          setPlaying(false);
          take((from) => from + d);
          return;
        }
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          togglePlay();
        }
      }}
    >
      <div className="sampler-stage">
        {ready.map((f, i) => (
          // All ready frames stay mounted; only one is visible. This is what
          // makes scrubbing instant and playback free of decode flicker.
          <img
            key={`${f.year}-${i}`}
            src={f.url}
            alt=""
            className={`sampler-frame${i === shownIndex ? ' sampler-frame--on' : ''}`}
            draggable={false}
          />
        ))}

        {!ready.length && (
          <div className="sampler-empty">
            {running ? 'developing the first frame…' : 'nothing rendered'}
          </div>
        )}

        <div className="sampler-readout">
          <span className="sampler-place">{state.location}</span>
          {frame && (
            <>
              <span className="sampler-year">{formatYear(frame.year)}</span>
              <span className="sampler-era">{getEraBand(frame.year).label}</span>
            </>
          )}
        </div>

        <button className="sampler-close" onClick={onClose} aria-label="Close core sample">
          ✕
        </button>
      </div>

      <div className="sampler-bar">
        <div className="sampler-transport">
          <button
            className="sampler-play"
            onClick={togglePlay}
            disabled={ready.length < 2}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <div className="seg" role="radiogroup" aria-label="Playback speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={speed === s}
                tabIndex={speed === s ? 0 : -1}
                className={`seg-option${speed === s ? ' seg-option--on' : ''}`}
                onClick={() => setSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>

        {/* The strip is the sample. One cell per station in ladder order, so the
            gaps left by failed frames stay visible instead of being closed up —
            a sweep with a hole in it should look like one. */}
        <div className="sampler-strip" role="list">
          {state.frames.map((f, i) => {
            const readyIndex = ready.indexOf(f);
            const active = readyIndex >= 0 && readyIndex === shownIndex;
            return (
              <button
                key={`${f.year}-${i}`}
                role="listitem"
                className={
                  `sampler-cell sampler-cell--${f.status}` +
                  (active ? ' sampler-cell--on' : '') +
                  (f.chained === false && !f.restored ? ' sampler-cell--break' : '')
                }
                /* QUOTED. Frames arrive as `data:image/png;base64,…`, and the
                   comma after the mime type makes an unquoted url() a CSS
                   syntax error — every thumbnail in the strip silently drew as
                   an empty cell. */
                style={f.url ? { backgroundImage: `url("${f.url}")` } : undefined}
                title={`${formatYear(f.year)}${f.error ? ` — ${f.error}` : ''}`}
                onClick={() => {
                  if (readyIndex < 0) return;
                  setPlaying(false);
                  take(() => readyIndex);
                }}
                disabled={readyIndex < 0}
              >
                <span className="sampler-cell-year">{formatYear(f.year)}</span>
              </button>
            );
          })}
        </div>

        <div className="sampler-status" aria-live="polite">
          {running ? (
            <>
              <span className="film-dot" aria-hidden="true" />
              rendering {Math.min(state.cursor + 1, state.frames.length)} of {state.frames.length}
              {state.startedAt ? ` · ${formatElapsed(Math.max(0, now - state.startedAt))}` : ''}
              <button className="ghost-btn sampler-cancel" onClick={onCancel}>
                stop
              </button>
            </>
          ) : (
            <>
              {state.done} of {state.frames.length} frames
              {errored ? ` · ${errored} failed` : ''}
              {/* Named, because it is the visible defect: an unchained frame is
                  exactly where the camera jumps, and the viewer deserves to know
                  the seam is the provider's doing rather than the model's. */}
              {unchained ? ` · ${unchained} unanchored` : ''}
              {state.status === 'cancelled' ? ' · stopped' : ''}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
