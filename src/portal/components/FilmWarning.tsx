/**
 * The consent dialog for filming — one frame or a whole sweep.
 *
 * There were two of these. One asked about turning a single station into a clip;
 * the other asked about turning a sample into a sequence of them. They were the
 * same question at two lengths, and keeping them apart meant the two answers
 * could drift — as they had, on audio and on which model would be used.
 *
 * So this takes a CLIP COUNT. Everything that reads differently between the two
 * cases reads differently because the count differs, not because a separate
 * component made a separate decision:
 *
 *   one clip     no closing frame to pin to, so no seamlessness to promise,
 *                and it keeps its sound because there is no join to disrupt
 *   many clips   pinned end to end, silent, and priced per clip
 *
 * "Don't show again" is offered ONLY for a single clip. A one-clip film is a
 * fixed purchase, so informing once is enough and nagging afterwards would be
 * treating a warning as a toll booth. A sequence's price is chosen at the moment
 * of asking — how many frames, across what span — so the number has to be in
 * front of the user every time, and a checkbox that hides it would be a checkbox
 * that hides the price.
 */

import { useEffect, useRef, useState } from 'react';
import type { FilmModelChoice } from '../lib/coreSample';

interface Props {
  /** How many clips will be rendered. 1 = a single station's film. */
  clips: number;
  seconds: number;
  resolution?: string;
  /** Which model, and whether it had to be substituted. Absent for single clips. */
  choice?: FilmModelChoice;
  /** Dollars per second for the chosen model, when known. */
  pricePerSecond?: number;
  onConfirm: (dontShowAgain: boolean) => void;
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

export function FilmWarning({
  clips,
  seconds,
  resolution,
  choice,
  pricePerSecond,
  onConfirm,
  onCancel,
}: Props) {
  const single = clips <= 1;
  const [dontShowAgain, setDontShowAgain] = useState(true);
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
      aria-labelledby="film-warn-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="gate-card">
        <h2 id="film-warn-title">{single ? 'Render this moment as film' : 'Film the core sample'}</h2>
        <p>
          {single ? (
            <>
              {/* "A 8-second clip" — the article follows the SOUND, and eight is
                  the one clip length in the set that starts with a vowel. */}
              {/^(8|11|18)/.test(String(seconds)) ? 'An' : 'A'} {seconds}-second clip with sound,
              continuing from the frame on screen.
            </>
          ) : (
            <>
              {clips} clips of {seconds}s — one for each gap between frames — joined into{' '}
              {totalSeconds} seconds of continuous film{resolution ? ` at ${resolution}` : ''}.
            </>
          )}
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
                <strong>{single ? 'Far more than a still' : `${totalSeconds} seconds of video`}</strong>
                {single ? ' — the priciest thing here, on your key.' : ', on your key, billed by the second.'}
              </>
            )}
            {!single && ' Far more than the stills cost.'}
          </dd>

          <dt>Time</dt>
          <dd>Minutes, not seconds. The app stays usable while it renders.</dd>

          {choice && !single && (
            <>
              <dt>Model</dt>
              <dd>
                {choice.reason === 'substituted' ? (
                  <>
                    <strong>{shortModel(choice.model)}</strong>, not your selected{' '}
                    {shortModel(choice.displaced ?? '')} — that one cannot pin a closing frame, so
                    every join would be a visible cut.
                  </>
                ) : choice.reason === 'unknown' ? (
                  <>
                    <strong>{shortModel(choice.model)}</strong>. The capability list could not be
                    reached, so whether it can pin a closing frame is unverified — clips may come
                    back with visible joins.
                  </>
                ) : (
                  <>
                    <strong>{shortModel(choice.model)}</strong>, your selection. It pins both ends.
                  </>
                )}
              </dd>
            </>
          )}

          {!single && (
            <>
              <dt>Seamless</dt>
              <dd>
                Each clip starts on one still and ends on the next, so consecutive clips meet on the
                same image and the joins are invisible. Any clip whose closing frame is refused is
                marked on the strip — that one join will be a cut.
              </dd>

              <dt>Silent</dt>
              <dd>
                No audio. Scored per clip it would be a different soundtrack every {seconds} seconds,
                which would undo the continuity this is for.
              </dd>
            </>
          )}

          <dt>Kept</dt>
          <dd>Frames are saved. Film is not: a reload loses it.</dd>

          {single ? (
            <>
              <dt>Source</dt>
              <dd>If the provider refuses your frame, you get a fresh take of the same moment.</dd>
            </>
          ) : (
            <>
              <dt>Stop</dt>
              <dd>Cancel any time. Clips already rendered stay; nothing further is spent.</dd>
            </>
          )}
        </dl>
        <div className="gate-actions">
          {single ? (
            <label className="warn-check">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
              />
              Don&apos;t show this again
            </label>
          ) : (
            <span className="warn-check" aria-hidden="true" />
          )}
          <div>
            <button className="ghost-btn" onClick={onCancel}>
              cancel
            </button>
            <button
              className="solid-btn"
              ref={confirmRef}
              onClick={() => onConfirm(single ? dontShowAgain : false)}
            >
              {single ? 'render film' : `render ${clips} clips`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
