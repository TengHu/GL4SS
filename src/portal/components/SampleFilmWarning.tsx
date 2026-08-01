/**
 * The consent dialog for filming a core sample.
 *
 * The most expensive thing this app can be asked to do, by a wide margin: one
 * video clip per gap between frames, and video is priced per second. So the
 * dialog quotes clips, seconds and dollars, and it is shown every time.
 *
 * It also has to explain a substitution. The default cinematic model is
 * first_frame only, which cannot pin the closing frame and therefore cannot
 * produce the seamless result this whole feature exists for — so a capable
 * model is chosen instead, and that is stated rather than done quietly.
 */

import { useEffect, useRef } from 'react';
import type { FilmModelChoice } from '../lib/coreSample';

interface Props {
  /** Number of clips: one per gap between ready frames. */
  clips: number;
  seconds: number;
  resolution: string;
  choice: FilmModelChoice;
  /** Dollars per second for the chosen model, when known. */
  pricePerSecond?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Just the family name — the full id is noise in a sentence. */
function shortModel(id: string): string {
  return id.split('/')[1] ?? id;
}

/**
 * A rate the reader can compare. toFixed(2) alone renders $0.40 correctly but
 * turns Seedance's $0.06726 into $0.07, and a two-cent rounding on a per-second
 * price is a 4% error on the total — so sub-dime rates keep three places.
 */
function rate(value: number): string {
  return value < 0.1 ? value.toFixed(3) : value.toFixed(2);
}

export function SampleFilmWarning({
  clips,
  seconds,
  resolution,
  choice,
  pricePerSecond,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    const restore = returnTo.current;
    return () => {
      if (restore && document.contains(restore)) restore.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const totalSeconds = clips * seconds;
  // Bound to the price rather than recomputed at the call site, so the total and
  // the rate quoted beside it can never be derived from different numbers.
  const priced =
    pricePerSecond !== undefined
      ? { total: totalSeconds * pricePerSecond, perSecond: pricePerSecond }
      : null;

  return (
    <div
      className="gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sample-film-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="gate-card">
        <h2 id="sample-film-title">Film the core sample</h2>
        <p>
          {clips} clips of {seconds}s — one for each gap between frames — joined into{' '}
          {totalSeconds} seconds of continuous film at {resolution}.
        </p>
        <dl className="warn-specs">
          <dt>Cost</dt>
          <dd>
            {priced ? (
              <>
                <strong>about ${priced.total.toFixed(2)}</strong>, on your key — video is billed by
                the second, so {totalSeconds}s at ${rate(priced.perSecond)}/s.
              </>
            ) : (
              <>
                <strong>{totalSeconds} seconds of video</strong>, on your key. Billed by the second
                at whatever this model charges.
              </>
            )}{' '}
            Far more than the stills cost.
          </dd>

          <dt>Model</dt>
          <dd>
            {choice.reason === 'substituted' ? (
              <>
                <strong>{shortModel(choice.model)}</strong>, not your selected{' '}
                {shortModel(choice.displaced ?? '')} — that one cannot pin a closing frame, so every
                join would be a visible cut.
              </>
            ) : choice.reason === 'unknown' ? (
              <>
                <strong>{shortModel(choice.model)}</strong>. The capability list could not be
                reached, so whether it can pin a closing frame is unverified — clips may come back
                with visible joins.
              </>
            ) : (
              <>
                <strong>{shortModel(choice.model)}</strong>, your selection. It pins both ends.
              </>
            )}
          </dd>

          <dt>Seamless</dt>
          <dd>
            Each clip starts on one still and ends on the next, so consecutive clips meet on the same
            image and the joins are invisible. Any clip whose closing frame is refused is marked on
            the strip — that one join will be a cut.
          </dd>

          <dt>Silent</dt>
          <dd>
            No audio. Scored per clip it would be a different soundtrack every {seconds} seconds,
            which would undo the continuity this is for.
          </dd>

          <dt>Kept</dt>
          <dd>Not saved. Like the frames, the film lasts until you reload.</dd>
        </dl>
        <div className="gate-actions">
          <span className="warn-check" aria-hidden="true" />
          <div>
            <button className="ghost-btn" onClick={onCancel}>
              cancel
            </button>
            <button className="solid-btn" ref={confirmRef} onClick={onConfirm}>
              render {clips} clips
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
