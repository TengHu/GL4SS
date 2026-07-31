/**
 * THE FILM CONTROL.
 *
 * Film was a plain text CTA sitting at the same visual weight as "widen the
 * view", with three unlabelled length pills beside it. That badly misrepresents
 * what it is: widen costs two images and seconds, film costs minutes and is the
 * most expensive thing the app can ask for. A control should look like what it
 * costs.
 *
 * So it gets its own bordered block, the length choice reads as a segmented
 * control with an honest wait estimate attached, and — because the wait is
 * genuinely minutes — the rendering state counts elapsed time and names the
 * provider's stage instead of showing a static string that looks frozen.
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

export function FilmControl({ scene, seconds, onSecondsChange, onRender, lengths }: Props) {
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

  if (status === 'ready') {
    return (
      <div className="film film--done">
        <span className="film-dot film-dot--done" aria-hidden="true" />
        <span className="film-title">Film playing</span>
        <span className="film-meta">{seconds}s with sound</span>
      </div>
    );
  }

  return (
    <div className={`film${rendering ? ' film--busy' : ''}`}>
      <div className="film-head">
        <span className="film-dot" aria-hidden="true" />
        <span className="film-title">{rendering ? 'Rendering film' : 'Render as film'}</span>
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
          <button className="film-go" onClick={onRender}>
            {status === 'error' ? 'try again' : 'render'}
            <span aria-hidden="true"> ▶</span>
          </button>
        </div>
      )}
    </div>
  );
}
