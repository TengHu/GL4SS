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
import { stitchClips } from '../lib/stitch';

interface Props {
  state: CoreSampleState;
  onCancel: () => void;
  onClose: () => void;
  /** Open the film consent dialog. Absent while a film is already rendering. */
  onFilm?: () => void;
}

/**
 * Two transports, because the two things being played are not the same thing.
 *
 * Stills advance on a timer, so the only meaningful number is FRAMES PER SECOND
 * — slow enough to read the year, fast enough to move. These used to be labelled
 * "1.5×/3×/6×", which reads as a multiple of a normal speed that does not exist.
 *
 * A film has a real playback rate, so there the × IS a multiplier and the values
 * are the ones a video wants rather than the ones a slideshow wants.
 */
/**
 * Labelled in WORDS, not in fps.
 *
 * It read "1.5 / 3 / 6 fps", which is accurate and useless. Sat beside the FILM
 * IT button it looked like a setting for the film — and it is not: it is how
 * fast the browser flips through pictures you already own, free, changeable as
 * often as you like, and with no bearing on any video. A unit invites the
 * reading that it configures something being generated. A word does not.
 *
 * The numbers survive as the values; only the labels changed.
 */
const STILL_PACE = [
  { value: 1.5, label: 'slow' },
  { value: 3, label: 'steady' },
  { value: 6, label: 'fast' },
] as const;

/** Playback rate of a rendered film, where × genuinely IS a multiplier. */
const FILM_RATES = [0.5, 1, 2] as const;

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function SamplePlayer({ state, onCancel, onClose, onFilm }: Props) {
  const running = state.status === 'running';
  const filming = state.filmStatus === 'rendering';
  const ready = useMemo(
    () => state.frames.filter((f) => f.status === 'ready' && f.url),
    [state.frames],
  );

  /**
   * The clips, in order, once they exist.
   *
   * Only clips that RENDERED are playable, but a gap matters here in a way it
   * does not for stills: skipping a failed clip means jumping straight from one
   * still to another, which is exactly the cut this feature exists to remove.
   * So the gap is skipped and marked rather than hidden.
   */
  const clips = useMemo(
    () => state.clips.filter((c) => c.status === 'ready' && c.url),
    [state.clips],
  );
  const hasFilm = clips.length > 0;

  /**
   * SAVE THE FILM AS ONE FILE.
   *
   * The clips are generated one per adjacent pair and play seamlessly in here,
   * but saved they are N files and the thing the visitor made is the sequence.
   * See stitch.ts for why this is a canvas recording rather than a concatenation
   * — and for why it takes as long as the film lasts.
   */
  const [joining, setJoining] = useState<{ clip: number; clips: number } | null>(null);
  /** Said on the button, not only in the console — see the 110-byte download. */
  const [joinError, setJoinError] = useState<string | null>(null);
  const saveFilm = async () => {
    if (joining || !hasFilm) return;
    setJoinError(null);
    setJoining({ clip: 0, clips: clips.length });
    try {
      const blob = await stitchClips(
        clips.map((c) => c.url!),
        { onProgress: setJoining },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const years = state.frames.filter((f) => f.status === 'ready').map((f) => f.year);
      a.download = `${state.location || 'sweep'} ${formatYear(years[0] ?? 0)}-${formatYear(years[years.length - 1] ?? 0)}.webm`
        .replace(/[/\\:*?"<>|]/g, '-');
      a.click();
      // Revoked late: Safari drops the download if the url dies in the same tick.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      console.warn('[looking-glass] could not join the clips —', why);
      setJoinError(why);
    } finally {
      setJoining(null);
    }
  };
  const [clipIndex, setClipIndex] = useState(0);

  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(3);
  const [filmRate, setFilmRate] = useState<number>(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [follow, setFollow] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const hostRef = useRef<HTMLDivElement>(null);

  // Ticks only while there is an elapsed counter on screen.
  useEffect(() => {
    if (!running && !filming) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, filming]);

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
    // Never while a film is playing: the cursor would advance under a stage
    // that is showing video, and pressing pause would stop a timer nobody can
    // see instead of the picture that is actually moving.
    if (hasFilm || !playing || ready.length < 2) return;
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
  }, [hasFilm, playing, speed, ready.length]);

  useEffect(() => {
    hostRef.current?.focus();
  }, []);

  // The rate is a property of the ELEMENT, not of React state, and a new clip
  // mounts a new element — so it has to be reapplied per clip rather than set
  // once. Without this, changing the rate held only until the next join.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = filmRate;
  }, [filmRate, clipIndex, hasFilm]);

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
    if (hasFilm) {
      const el = videoRef.current;
      if (!el) return;
      if (el.paused) void el.play();
      else el.pause();
      return;
    }
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
  /**
   * MEASURED, not guessed — see measureDrift in coreSample.
   *
   * `unanchored` says the provider refused the attachment. This says the frame came
   * back from a different camera position than the seed, which is the defect a
   * viewer would otherwise have to spot by eye and could not name.
   */
  const drifted = ready.filter((f) => f.drift).length;

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
        {/* THE FILM, when there is one. Clips play back to back off a single
            element: each was rendered to END on the still the next one BEGINS
            on, so consecutive clips meet on the same image and the handover is
            invisible. Muted and autoplaying, because it is silent by design and
            an autoplay policy will refuse an unmuted one anyway. */}
        {hasFilm && (
          <video
            ref={videoRef}
            key={clips[Math.min(clipIndex, clips.length - 1)]?.url}
            className="sampler-film"
            src={clips[Math.min(clipIndex, clips.length - 1)]?.url}
            autoPlay
            muted
            playsInline
            controls={false}
            /* Play state is read back OFF the element rather than assumed. An
               autoplay policy, a stall or the end of the last clip can all stop
               it without anything here being told, and a pause button that lies
               about what is happening is worse than no button. */
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setClipIndex((i) => (i + 1 < clips.length ? i + 1 : 0))}
          />
        )}

        {!hasFilm && ready.map((f, i) => (
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

        {!ready.length && !hasFilm && (
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
          {/* PACE BELONGS TO THE PLAY BUTTON. It used to sit on the far right,
              immediately beside FILM IT, where a free viewing control read as a
              setting for the paid render next to it. Grouped with the transport
              it governs, that reading is not available. */}
          {hasFilm ? (
            <div className="seg" role="radiogroup" aria-label="Playback rate">
              {FILM_RATES.map((r) => (
                <button
                  key={r}
                  role="radio"
                  aria-checked={filmRate === r}
                  tabIndex={filmRate === r ? 0 : -1}
                  className={`seg-option${filmRate === r ? ' seg-option--on' : ''}`}
                  onClick={() => setFilmRate(r)}
                >
                  {r}×
                </button>
              ))}
            </div>
          ) : (
            <div className="seg" role="radiogroup" aria-label="How fast to flip through the pictures">
              {STILL_PACE.map((p) => (
                <button
                  key={p.value}
                  role="radio"
                  aria-checked={speed === p.value}
                  tabIndex={speed === p.value ? 0 : -1}
                  className={`seg-option${speed === p.value ? ' seg-option--on' : ''}`}
                  onClick={() => setSpeed(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {hasFilm && (
            <span className="sampler-mode">
              film · clip {Math.min(clipIndex + 1, clips.length)}/{clips.length}
            </span>
          )}

          {/* Last, and pushed to the far end by margin-left:auto. The only
              control here that spends money, kept away from the ones that do
              not. Offered only on a finished sweep: mid-sweep the set of ready
              frames is still growing, so the clip count — and the price the
              dialog quotes — would be wrong the moment it was shown. */}
          {onFilm && !running && !filming && !hasFilm && ready.length >= 2 && (
            <button className="film-go sampler-film-go" onClick={onFilm}>
              film it
              <span aria-hidden="true"> ▶</span>
            </button>
          )}
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
                  (f.chained === false && !f.restored ? ' sampler-cell--break' : '') +
                  (f.drift ? ' sampler-cell--drift' : '')
                }
                /* QUOTED. Frames arrive as `data:image/png;base64,…`, and the
                   comma after the mime type makes an unquoted url() a CSS
                   syntax error — every thumbnail in the strip silently drew as
                   an empty cell. */
                style={f.url ? { backgroundImage: `url("${f.url}")` } : undefined}
                title={
                  `${formatYear(f.year)}` +
                  (f.error ? ` — ${f.error}` : '') +
                  // The measurement, in the tooltip, because "drifted" in the
                  // status line says THAT it moved and this says by how much.
                  (f.drift ? ` — ${f.drift}` : '')
                }
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
          {filming ? (
            <>
              <span className="film-dot" aria-hidden="true" />
              rendering {state.clips.filter((c) => c.status === 'ready').length} of{' '}
              {state.clips.length} clips
              {state.filmStartedAt ? ` · ${formatElapsed(Math.max(0, now - state.filmStartedAt))}` : ''}
              {(() => {
                const active = state.clips.find((c) => c.status === 'rendering' && c.stage);
                return active?.stage ? ` · ${active.stage}` : '';
              })()}
              <button className="ghost-btn sampler-cancel" onClick={onCancel}>
                stop
              </button>
            </>
          ) : running ? (
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
              {drifted ? ` · ${drifted} drifted` : ''}
              {state.status === 'cancelled' ? ' · stopped' : ''}
              {/* The film's own defects, named separately from the sweep's. */}
              {hasFilm ? ` · ${clips.length} clips` : ''}
              {hasFilm && (
                <button
                  className="ghost-btn sampler-save-film"
                  onClick={() => void saveFilm()}
                  disabled={Boolean(joining)}
                  /* Said before it is pressed, not after: the recording runs in
                     real time and stalls if the tab is hidden, and neither is
                     guessable from a button that says "save". */
                  title={
                    clips.length === 1
                      ? 'Saves the clip as it is.'
                      : `Plays the ${clips.length} clips through once to record them into a single file. Video only, and it takes as long as the film lasts — keep this tab in front.`
                  }
                >
                  {joining
                    ? `joining ${joining.clip}/${joining.clips}…`
                    : clips.length === 1
                      ? 'save the clip'
                      : 'save as one video'}
                </button>
              )}
              {joinError && <span className="sampler-join-error"> · {joinError}</span>}
              {(() => {
                const cut = state.clips.filter((c) => c.status === 'ready' && c.pinned === false).length;
                const lost = state.clips.filter((c) => c.status === 'error').length;
                return `${cut ? ` · ${cut} joins cut` : ''}${lost ? ` · ${lost} clips failed` : ''}`;
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
