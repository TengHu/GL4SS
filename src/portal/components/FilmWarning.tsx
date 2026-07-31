/**
 * The one-time "this is slower and pricier than a still" warning.
 *
 * Shown before the FIRST film only. "Don't show this again" is checked by
 * default deliberately: the point is to inform once, not to nag. Someone who
 * reads it and proceeds has been told, and making them opt out of future
 * interruptions would be treating a warning as a toll booth.
 */

import { useEffect, useRef, useState } from 'react';

interface Props {
  seconds: number;
  onConfirm: (dontShowAgain: boolean) => void;
  onCancel: () => void;
}

export function FilmWarning({ seconds, onConfirm, onCancel }: Props) {
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
        <h2 id="film-warn-title">Render this moment as film</h2>
        <p>
          {/* "A 8-second clip" — the article follows the SOUND, and eight is the
              one clip length in the set that starts with a vowel. */}
          {/^(8|11|18)/.test(String(seconds)) ? 'An' : 'A'} {seconds}-second clip with sound,
          continuing from the frame on screen.
        </p>
        {/* Four labelled rows rather than four paragraphs. This is a consent
            dialog standing between someone and the most expensive thing the app
            does — every extra sentence is a sentence they skim, and a skimmed
            warning has not warned anyone. Named models and measured timings were
            removed on purpose: they go stale the moment a default changes, and a
            warning that is subtly wrong is worse than a shorter one. */}
        <dl className="warn-specs">
          <dt>Time</dt>
          <dd>Minutes, not seconds. The app stays usable while it renders.</dd>

          <dt>Cost</dt>
          <dd>Far more than a still — the priciest thing here, on your key.</dd>

          <dt>Kept</dt>
          <dd>Frames are saved. Film is not: a reload loses it.</dd>

          <dt>Source</dt>
          <dd>If the provider refuses your frame, you get a fresh take of the same moment.</dd>
        </dl>
        <div className="gate-actions">
          <label className="warn-check">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            Don&apos;t show this again
          </label>
          <div>
            <button className="ghost-btn" onClick={onCancel}>
              cancel
            </button>
            <button
              className="solid-btn"
              ref={confirmRef}
              onClick={() => onConfirm(dontShowAgain)}
            >
              render film
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
