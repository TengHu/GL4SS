/**
 * THE JOURNEY GALLERY — the front door.
 *
 * The portal will not show you anything until you have chosen a point on Earth,
 * a year and an hour. That is a good control surface and a bad first screen: the
 * answer to "where should I go" is not a map, it is a suggestion. This is a page
 * of them, and picking one sets place, coordinates, year and time of day
 * together and drops you there.
 *
 * Grouped by era band, in ladder order, using the same colours the dial uses —
 * so the gallery and the timeline agree about what "Renaissance" looks like, and
 * scrolling this page is the same journey as dragging the dial.
 *
 * It deliberately does NOT generate anything. Picking a journey tunes the
 * instrument and closes; the lever still has to be thrown. Browsing is free, and
 * a gallery that spent money on every click would be a trap.
 */

import { useEffect, useRef } from 'react';
import { groupedJourneys } from '../lib/journeys';
import type { Journey } from '../lib/journeys';
import { findPhase } from '../lib/daylight';
import { formatYear } from '../../lib/format';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  onClose: () => void;
  onPick: (journey: Journey) => void;
  /** The station currently tuned, so the gallery can mark where you already are. */
  currentYear: number;
  currentLocation: string;
}

export function JourneyGallery({ onClose, onPick, currentYear, currentLocation }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const groups = groupedJourneys();
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  // Focus moves into the dialog on open, so the first Tab is inside it and
  // Escape has somewhere to return from.
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      if (returnTo && document.contains(returnTo)) returnTo.focus();
    };
  }, []);

  /**
   * A REAL FOCUS TRAP, at document capture level.
   *
   * The panel is an opaque full-screen sheet, but nothing stopped Tab leaving
   * it: Shift+Tab from the close button landed on the app behind — including the
   * TimeLever, which stays enabled and spends money. A user could then press
   * Enter on a control they could not see. React's onKeyDown could not fix this
   * either, because focus was by then outside the panel's subtree and the event
   * never reached it — which is also why Escape stopped working once focus
   * escaped.
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="gallery"
      role="dialog"
      aria-modal="true"
      aria-label="Journeys"
      ref={panelRef}
    >
      <div className="gallery-head">
        <div className="gallery-title">
          <span className="gallery-name">JOURNEYS</span>
          <span className="gallery-count">{total} destinations</span>
        </div>
        <button ref={closeRef} className="ghost-btn" onClick={onClose}>
          close <kbd>esc</kbd>
        </button>
      </div>

      <div className="gallery-scroll">
        {groups.map((group) => (
          <section className="gallery-band" key={group.band}>
            <h2 className="gallery-band-head" style={{ ['--band' as string]: group.color }}>
              <span className="gallery-band-rule" aria-hidden="true" />
              {group.label}
            </h2>
            <div className="gallery-grid">
              {group.items.map((j) => {
                const phase = findPhase(j.phaseId);
                const here = j.year === currentYear && j.location === currentLocation;
                return (
                  <button
                    key={j.id}
                    className={`journey${here ? ' journey--here' : ''}`}
                    style={{ ['--band' as string]: group.color }}
                    onClick={() => onPick(j)}
                    // The visible title is short; the full destination belongs in
                    // the accessible name or a screen reader gets "Alexandria"
                    // with no year and no hour.
                    aria-label={`${j.title} — ${j.location}, ${formatYear(j.year)}, ${phase.label}`}
                  >
                    <span className="journey-year">{formatYear(j.year)}</span>
                    <span className="journey-title">{j.title}</span>
                    <span className="journey-blurb">{j.blurb}</span>
                    <span className="journey-foot">
                      <span className="journey-place">{j.location}</span>
                      <span
                        className={`journey-phase${phase.daylight ? '' : ' journey-phase--dark'}`}
                        style={{ ['--tint' as string]: phase.tint }}
                      >
                        <span className="journey-phase-body" aria-hidden="true" />
                        {phase.label}
                      </span>
                    </span>
                    {here && <span className="journey-here">you are here</span>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
