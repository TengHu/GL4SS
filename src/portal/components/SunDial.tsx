/**
 * THE SUNDIAL — the second hand of the instrument.
 *
 * The year dial says WHEN in history. This says when in the DAY, which is the
 * other half of what a photograph of a place actually looks like: the same street
 * at midday and at sunset are not the same picture, and until this existed the
 * planner chose the hour on the user's behalf and never said so.
 *
 * THE BODY RIDES THE OUTSIDE of the dial and you drag it round, rather than a
 * marker sliding inside a disc. A sun orbiting a face is a thing you can reach
 * for; a dot inside a circle is a graphic. It also frees the whole interior for
 * the sky itself, which is what carries day and night.
 *
 * Midday at the top and midnight at the bottom — the astronomer's convention is
 * the reverse, but a sun that is highest when it is brightest is the thing
 * everyone already knows. Cross into the lower half and the sun becomes a moon,
 * which then walks a real lunar progression across the three night stops:
 * waxing at dusk, full at midnight, waning before dawn. That is a legibility
 * device rather than an ephemeris (see daylight.ts) — it makes the dark stops
 * tell each other apart, and it makes the sweep read as a cycle.
 */

import { useRef, useState } from 'react';
import {
  DAY_PHASES,
  bearingFromCentre,
  findPhase,
  phaseAngle,
  phaseAtAngle,
} from '../lib/daylight';

interface Props {
  phaseId: string;
  onChange: (phaseId: string) => void;
  /** Era accent, so the lit sky belongs to the year you are standing in. */
  accent: string;
}

/** Distance from centre to the body's centre. Outside the 44px face. */
const ORBIT = 30;
/**
 * Below this radius a pointer is not aiming at anything: near the centre a
 * one-pixel wobble swings the bearing through 180 degrees, so a click there would
 * pick a phase essentially at random.
 */
const DEAD_ZONE = 9;

export function SunDial({ phaseId, onChange, accent }: Props) {
  const phase = findPhase(phaseId);
  const angle = phaseAngle(phase.id);
  const index = DAY_PHASES.findIndex((p) => p.id === phase.id);
  const faceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  /** Resolve a pointer to a phase and commit it, if it actually changed. */
  const aim = (clientX: number, clientY: number) => {
    const el = faceRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < DEAD_ZONE) return;
    const next = phaseAtAngle(bearingFromCentre(dx, dy));
    // Guarded because a drag fires this every pointermove, and every change is a
    // new cache key and a re-render of the whole portal.
    if (next.id !== phase.id) onChange(next.id);
  };

  const step = (delta: number) => {
    // Wraps, because a day does.
    const next = (index + delta + DAY_PHASES.length) % DAY_PHASES.length;
    onChange(DAY_PHASES[next]!.id);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragRef.current = true;
    setDragging(true);
    aim(e.clientX, e.clientY);
    /**
     * Capture LAST, and guarded. setPointerCapture throws NotFoundError when the
     * pointer is no longer active — a real race if the button is released between
     * the browser queueing the event and React handling it. Called first and
     * unguarded, as it was, that throw aborts the whole handler and the press
     * does nothing at all. Ordered after the aim, a failure degrades to "the
     * press registers but the drag stops tracking once you leave the control",
     * which is a far better failure than an inert dial.
     */
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* No capture; the drag simply ends when the pointer leaves. */
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    aim(e.clientX, e.clientY);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = false;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  /**
   * role="slider": one value on a quantised continuum, the same contract the year
   * dial uses, so the whole control is one tab stop and the arrows do the obvious
   * thing. Home/End are deliberately absent — a cycle has no start or end.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
    };
    const delta = moves[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    // The portal's global handler also listens for arrows and would retune the
    // YEAR at the same time.
    e.stopPropagation();
    step(delta);
  };

  return (
    <div className={`sundial${phase.daylight ? '' : ' sundial--dark'}${dragging ? ' sundial--dragging' : ''}`}>
      <div
        ref={faceRef}
        className="sundial-orbit"
        role="slider"
        tabIndex={0}
        aria-label="Time of day"
        aria-valuemin={0}
        aria-valuemax={DAY_PHASES.length - 1}
        aria-valuenow={index}
        aria-valuetext={phase.label}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={(e) => {
          if (Math.abs(e.deltaY) < 2) return;
          step(e.deltaY > 0 ? 1 : -1);
        }}
        style={{ ['--sun-accent' as string]: accent, ['--tint' as string]: phase.tint }}
        title={`${phase.label} — drag the sun around, or scroll`}
      >
        {/* The sky. Lit above the horizon, dark below it — which is what makes
            "midday at the top" read without a legend. */}
        <span className="sundial-face" aria-hidden="true" />
        <span className="sundial-horizon" aria-hidden="true" />

        {/* One graduation per stop, on the orbit the body travels. */}
        {DAY_PHASES.map((p) => (
          <span
            key={p.id}
            className={`sundial-mark${p.id === phase.id ? ' sundial-mark--on' : ''}`}
            aria-hidden="true"
            style={{ transform: `rotate(${phaseAngle(p.id)}deg) translateY(-${ORBIT}px)` }}
          />
        ))}

        <span
          className="sundial-arm"
          aria-hidden="true"
          style={{ transform: `rotate(${angle}deg) translateY(-${ORBIT}px)` }}
        >
          {/*
            Counter-rotated so the body itself never spins — only its position on
            the orbit changes. Without this the moon's crescent would rotate with
            the arm and point the wrong way at every stop.

            --tint is published on the ORBIT, not here, so the sky inside the
            dial can take the hour's colour as well as the body.
          */}
          <span
            className="sundial-body"
            style={{
              transform: `rotate(${-angle}deg)`,
              // Low sun is bigger and redder, high sun small and hard — the actual
              // difference between a dawn photograph and a midday one.
              ['--elev' as string]: String(phase.elevation),
              ['--lunar' as string]: String(phase.lunar),
            }}
          />
        </span>
      </div>
      <span className="sundial-label">{phase.label}</span>
    </div>
  );
}
