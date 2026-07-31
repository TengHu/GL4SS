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
          A {seconds}-second clip with sound, continuing from the frame you are looking at.
        </p>
        <ul className="warn-list">
          <li>
            <strong>It takes minutes, not seconds.</strong> Measured on a real Seedance
            render, a <em>4-second</em> clip took just over 4 minutes; longer clips take
            longer. A still takes 5–30s. The portal stays usable while it renders.
          </li>
          <li>
            <strong>It costs substantially more than a still</strong>, billed to your own
            OpenRouter key. Video is the most expensive thing this app can ask for.
          </li>
          <li>
            Clips are <strong>not saved between sessions</strong> — frames are, film is not.
            Reloading loses it. A 4-second clip is around 3.5&nbsp;MB.
          </li>
          <li>
            The clip normally continues from the frame on screen, but providers moderate
            that source image separately — if it is refused, you get a fresh take of the
            same moment instead, and the portal will say so.
          </li>
        </ul>
        <label className="warn-check">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
          />
          Don&apos;t show this again
        </label>
        <div className="gate-actions">
          <span />
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
