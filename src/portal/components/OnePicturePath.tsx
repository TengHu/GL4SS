/**
 * PATH A — ONE PICTURE, and the video made from it.
 *
 * The app has two independent paths to a video:
 *
 *   A   one picture   → a clip of that picture      (this file)
 *   B   many pictures → a clip across them          (ManyPicturesPath)
 *
 * Each has its own picture step and its own video step, and they do not meet.
 * The caption used to show path B's picture step stacked on path A's video step,
 * joined by the word "then" — which claimed the lower block continued from the
 * upper one. It does not: pressing render there produces a clip of the SINGLE
 * frame on screen, whatever years happen to be queued above it. The word was
 * added to fix an ordering problem and introduced a worse one, because a label
 * that is merely noisy is better than a label that is wrong.
 *
 * So each box is now one whole path, and "then" appears inside a box, where it
 * is true.
 *
 * This block was formerly FilmControl, and keeps its reasons: film costs minutes
 * and is the most expensive thing the app can ask for, so it gets a bordered
 * block rather than a text CTA, the length choice carries an honest wait
 * estimate, and the rendering state counts elapsed time and names the provider's
 * stage instead of showing a static string that looks frozen.
 */

import { useEffect, useState } from 'react';
import type { Scene } from '../lib/engine';

interface Props {
  scene: Scene;
  seconds: number;
  onSecondsChange: (seconds: number) => void;
  onRender: () => void;
  lengths: readonly number[];
}

/** Measured: a 4s clip took ~4 minutes. Scale from there, honestly and roughly. */
function estimateMinutes(seconds: number): string {
  const mins = Math.max(3, Math.round((seconds / 4) * 4));
  return `~${mins} min`;
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function OnePicturePath({ scene, seconds, onSecondsChange, onRender, lengths }: Props) {
  const status = scene.videoStatus ?? 'none';
  const rendering = status === 'rendering';
  const [now, setNow] = useState(() => Date.now());

  // A multi-minute wait with no moving number reads as a hang, so this ticks once
  // a second. The START time lives on the scene rather than here: it is a fact
  // about the render, not about this component, and deriving it that way means
  // the effect never has to write state synchronously.
  useEffect(() => {
    if (!rendering) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [rendering]);

  const startedAt = scene.videoStartedAt ?? now;

  /** The path's head and its first step, shared by every state below. */
  const head = (
    <>
      <div className="film-head">
        <span className="film-dot" aria-hidden="true" />
        <span className="film-title">One picture</span>
        <span className="film-meta">this station, this hour</span>
      </div>
      {/* The lever is not moved here — it is the app's signature object and
          belongs where it is — but it IS this path's first step, so the path
          names it. It used to be printed inside the many-pictures block, which
          crossed the two paths at the one point they should never touch. */}
      <div className="path-step">
        make it
        <span className="path-rule" aria-hidden="true" />
        <span className="path-target">pull the lever ⟶</span>
      </div>
    </>
  );

  if (status === 'ready') {
    return (
      <div className="film">
        {head}
        <div className="path-then">
          <span className="film-dot film-dot--done" aria-hidden="true" />
          <span className="path-then-title">Film playing</span>
          <span className="film-meta">{seconds}s with sound</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`film${rendering ? ' film--busy' : ''}`}>
      {head}
      <div className="path-then">
        <span className="path-then-title">
          {rendering ? 'Rendering film' : 'then turn it into video'}
        </span>
        <span className="film-meta">
          {rendering
            ? `${formatElapsed(Math.max(0, now - startedAt))} elapsed${scene.videoStage ? ` · ${scene.videoStage}` : ''}`
            : `with sound · ${estimateMinutes(seconds)}`}
        </span>
      </div>

      {rendering ? (
        // Indeterminate on purpose: the provider reports coarse states, not a
        // percentage, and a fake progress bar that stalls at 90% is a lie.
        <div className="film-bar" role="progressbar" aria-label="Rendering film">
          <span />
        </div>
      ) : (
        <div className="film-actions">
          <div className="seg" role="radiogroup" aria-label="Clip length">
            {lengths.map((n, i) => (
              <button
                key={n}
                role="radio"
                aria-checked={seconds === n}
                tabIndex={seconds === n ? 0 : -1}
                className={`seg-option${seconds === n ? ' seg-option--on' : ''}`}
                onClick={() => onSecondsChange(n)}
                /**
                 * A radiogroup is driven by arrows, and Portal's global handler
                 * listens for arrows on `window` to step the YEAR — so without
                 * stopPropagation here the keys never selected a length, they
                 * retuned time instead, and 4s and 12s were unreachable by
                 * keyboard entirely. stopPropagation is the load-bearing call.
                 */
                onKeyDown={(e) => {
                  const delta =
                    e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
                    : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1
                    : 0;
                  if (!delta) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const next = lengths[(i + delta + lengths.length) % lengths.length]!;
                  onSecondsChange(next);
                  const group = e.currentTarget.parentElement;
                  const target = group?.children[lengths.indexOf(next)] as HTMLElement | undefined;
                  target?.focus();
                }}
              >
                {n}s
              </button>
            ))}
          </div>
          {/* Quiet, because this is derived work. It used to wear the same lit
              actuator as the picture button beside it, which made the optional
              second stage look exactly as primary as the thing it depends on. */}
          <button className="film-go film-go--quiet" onClick={onRender}>
            {status === 'error' ? 'try again' : 'render'}
            <span aria-hidden="true"> ▶</span>
          </button>
        </div>
      )}
    </div>
  );
}
