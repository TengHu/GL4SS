/**
 * THE LEVER.
 *
 * Scrubbing the dial used to fire a generation 480ms after you stopped moving.
 * That made the app spend the visitor's money on a TIMEOUT — you paused to think,
 * and it billed you. The lever makes committing an explicit physical act: browse
 * the dial as freely as you like, and nothing is generated until you throw it.
 *
 * It appears only when it has something to do. A station you already own restores
 * instantly and for free, exactly as before — so the lever surfaces precisely
 * when you have gone somewhere genuinely new, which is also exactly when a charge
 * would have been incurred silently.
 *
 * Pull it down or click it; both work, because a drag-only control is a trap for
 * keyboards and touch alike.
 */

import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Armed: a station is selected that we do not have. */
  armed: boolean;
  /** Busy: a generation is already running for it. */
  busy: boolean;
  onPull: () => void;
  accent: string;
  label: string;
  /** Armed because the station FAILED, not because it is new. Swaps the lamp. */
  retry?: boolean;
  /** Overrides the accessible name when the lever is dead for some other reason. */
  blockedReason?: string;
}

/** Travel of the handle, in px, and the fraction of it that counts as a throw. */
const TRAVEL = 54;

/**
 * The throw is a half turn TOWARDS THE VIEWER.
 *
 * Three things had to be true at once, and each earlier attempt got one or two:
 *
 *   1. The thrown state is the resting state MIRRORED — head at the top pointing
 *      up becomes head at the bottom pointing down.
 *   2. The motion is DOWNWARD, not across.
 *   3. The shard comes towards you on the way, the way a real lever falls out of
 *      the panel towards the hand pulling it.
 *
 * rotate() satisfied 1 and 2 but swung the head sideways through the plane of
 * the screen. rotateX about the shard's own centre comes towards the viewer but
 * flips in place and never travels. rotateX about the PLATE'S MIDLINE does all
 * three: the axis is horizontal so the shard tips out towards you, and because
 * that axis sits below the shard, tipping through 180 lands it at the bottom of
 * the plate, inverted — the mirror.
 *
 * Negative, because positive rotateX tips the top AWAY into the screen. Towards
 * the viewer is the negative direction.
 */
const THROW_DEG = -180;

/** Degrees for a given position along the throw. */
const angleFor = (px: number) => (px / TRAVEL) * THROW_DEG;
const THROW_AT = 0.55;

export function TimeLever({ armed, busy, onPull, accent, label, retry = false, blockedReason }: Props) {
  const [offset, setOffset] = useState(0);
  const [engaged, setEngaged] = useState(false);
  // Mirrors dragRef as STATE, because the stylesheet needs to know a hand is on
  // the lever and a ref cannot re-render. The ref still guards the move handler,
  // which can fire before React has committed.
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(false);
  const startY = useRef(0);
  const pulled = useRef(false);

  // Recoil: after a throw the handle springs back on its own — UNLESS a render
  // picked the throw up, in which case `held` below keeps it down and this
  // timer stops mattering.
  useEffect(() => {
    if (!engaged) return;
    const t = setTimeout(() => setEngaged(false), 420);
    return () => clearTimeout(t);
  }, [engaged]);

  /**
   * THE HANDLE STAYS DOWN FOR THE WHOLE RENDER.
   *
   * It used to spring back after 420ms and then sit there, idle and identical
   * to its resting state, through five to thirty seconds of paid work. The one
   * control that spends money went quiet at the exact moment the money was
   * being spent, and the only thing left saying so was a caption.
   *
   * Now the throw and the wait are one gesture: thrown at the pull, held while
   * the frame develops, released when it lands. `busy` already means "a
   * generation is running for this station", so no new state is needed — the
   * lever simply reads the state the engine was already publishing.
   */
  const held = engaged || busy;

  const fire = () => {
    if (!armed || busy || pulled.current) return;
    pulled.current = true;
    setDragging(false);
    setEngaged(true);
    setOffset(0);
    onPull();
    // One throw per arming; re-arming happens when the station changes.
    setTimeout(() => {
      pulled.current = false;
    }, 600);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!armed || busy) return;
    dragRef.current = true;
    setDragging(true);
    startY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    const raw = Math.max(0, Math.min(TRAVEL, e.clientY - startY.current));
    /**
     * OVER-CENTRE RESISTANCE. Tracking the finger 1:1 for all 46px is a slider.
     * A stiffening gain makes the handle fall further behind the harder you
     * push, so you feel the spring loading up — while the trip test stays on RAW
     * finger travel, so at the detent the mechanism still has ~25px to cover and
     * covers it itself. That gap between hand and handle is the whole feeling.
     */
    const t = raw / TRAVEL;
    setOffset(TRAVEL * t * (1 - 0.3 * t));
    if (raw >= TRAVEL * THROW_AT) {
      dragRef.current = false;
      setDragging(false);
      fire();
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    dragRef.current = false;
    setDragging(false);
    setOffset(0);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const state = busy ? 'busy' : armed ? 'armed' : 'idle';

  return (
    <div
      className={`lever lever--${state}${engaged ? ' lever--engaged' : ''}${dragging ? ' lever--dragging' : ''}`}
      data-retry={retry ? '' : undefined}
      style={{ ['--lever-accent' as string]: accent }}
    >
      <span className="lever-track">
        <span className="lever-rail" aria-hidden="true" />
        <button
          className="lever-handle"
          style={{ transform: `rotateX(${angleFor(held ? TRAVEL : offset)}deg)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={fire}
          disabled={!armed || busy}
          /* "already generated" is the usual reason the lever is dead, but not
             the only one — when the place panel covers it the frame may not
             exist at all, and announcing that it does is simply false. */
          aria-label={
            blockedReason ?? (armed ? `Generate ${label}` : `${label} is already generated`)
          }
        >
          <span className="lever-grip" aria-hidden="true" />
        </button>
      </span>
      <span className="lever-label">
        {busy ? 'generating' : armed ? 'pull to jump' : 'already here'}
      </span>
    </div>
  );
}
