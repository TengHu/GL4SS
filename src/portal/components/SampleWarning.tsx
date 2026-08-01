/**
 * The consent dialog for a core sample.
 *
 * Modelled on FilmWarning, and shown EVERY time rather than once. That is the
 * one deliberate difference: a film is a fixed, single purchase, so informing
 * once is enough. A sample's price is chosen at the moment of asking — eight
 * frames or twenty-four, across a span the user just picked — so the number has
 * to be in front of them on every run. A "don't show again" checkbox here would
 * be a checkbox that hides the price.
 *
 * The app's contract is that browsing is free and only the lever spends. This is
 * the most expensive control in the app by a wide margin, and it must never be
 * reachable without this dialog.
 */

import { useEffect, useRef } from 'react';
import { formatYear } from '../../lib/format';

interface Props {
  /** The stations that will be rendered, ascending. */
  years: number[];
  /** True when the first frame is already owned and will not be re-rendered. */
  anchorOwned: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SampleWarning({ years, anchorOwned, onConfirm, onCancel }: Props) {
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

  // The anchor is free when it is already on disk, so the count that matters is
  // the count that will actually be billed — not the length of the sweep.
  const billed = anchorOwned ? years.length - 1 : years.length;
  const first = years[0];
  const last = years[years.length - 1];

  return (
    <div
      className="gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sample-warn-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="gate-card">
        <h2 id="sample-warn-title">Take a core sample</h2>
        {/* The years ARE the span, so the span's own blurb is not repeated here:
            "from 3,000 BC to 2030 AD — 3000 bc to now" says one thing twice and
            gets the capitalisation of the second one wrong. */}
        <p>
          {years.length} frames of this exact spot
          {first !== undefined && last !== undefined ? (
            <>
              , from {formatYear(first)} to {formatYear(last)}
            </>
          ) : null}
          .
        </p>
        <dl className="warn-specs">
          <dt>Cost</dt>
          <dd>
            <strong>{billed} images</strong>, on your key
            {anchorOwned ? ' — the first station is already yours, so it is free.' : '.'} This is the
            most expensive control here: a sweep costs what {billed} lever pulls cost.
          </dd>

          <dt>Time</dt>
          <dd>
            Minutes. Frames must render one after another — each is drawn from the one before it, which
            is what holds the camera still.
          </dd>

          <dt>Kept</dt>
          <dd>
            Not saved. Like film, a sample lives until you reload — chained frames belong to this sweep
            rather than to the archive.
          </dd>

          <dt>Stop</dt>
          <dd>Cancel any time. Frames already rendered stay on screen; nothing further is spent.</dd>
        </dl>
        <div className="gate-actions">
          <span className="warn-check" aria-hidden="true" />
          <div>
            <button className="ghost-btn" onClick={onCancel}>
              cancel
            </button>
            <button className="solid-btn" ref={confirmRef} onClick={onConfirm}>
              render {billed} frames
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
