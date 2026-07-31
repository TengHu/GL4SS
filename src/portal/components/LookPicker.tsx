/**
 * THE LOOK CONTROL.
 *
 * Replaces a row of thirteen chips strung across the header. Thirteen labels is
 * a wall of text competing with the photograph in an app whose entire thesis is
 * that the frame is the product and the chrome should get out of its way — and
 * it got worse with every style added, so the shape did not scale.
 *
 * Collapsed it is one button showing the look you are in. Opened it is a grid
 * with room for a swatch and a real name, plus the custom field inline instead of
 * buried in settings. The nine-tab-stop problem the audit found is gone for a
 * different reason than before: the trigger is one stop, and the menu is a proper
 * radiogroup with a roving tabindex once you are inside it.
 */

import { useEffect, useRef } from 'react';
import type { StylePreset } from '../../lib/styles';

interface Props {
  presets: StylePreset[];
  styleId: string;
  onStyleChange: (id: string) => void;
  customStyle: string;
  onCustomStyleChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LookPicker({
  presets,
  styleId,
  onStyleChange,
  customStyle,
  onCustomStyleChange,
  open,
  onOpenChange,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const current = presets.find((p) => p.id === styleId) ?? presets[0]!;

  // Close on an outside click or Escape, like any menu. Escape is captured so it
  // does not also fall through to the portal's global handler and clear a pin.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onOpenChange]);

  const move = (from: number, delta: number) => {
    const next = presets[(from + delta + presets.length) % presets.length]!;
    onStyleChange(next.id);
    const buttons = rootRef.current?.querySelectorAll<HTMLButtonElement>('.look-option');
    buttons?.[presets.indexOf(next)]?.focus();
  };

  return (
    <div className="look" ref={rootRef}>
      <button
        className={`look-trigger${open ? ' look-trigger--open' : ''}`}
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Change the visual style of every frame"
      >
        <span className="look-swatch" style={{ background: current.color }} aria-hidden="true" />
        <span className="look-name">{current.id === 'none' ? 'Styles' : current.label}</span>
        {/* One glyph, always. Swapping ▾ for ▴ is a text substitution — the
            character changes, the object does not. The stylesheet rotates this
            span 180° on the detent curve instead, which reads as one flag
            flipping over, and it is the only rotation permitted in the chrome.
            Rendering the glyph conditionally would fight that: the swap and the
            rotation cancel and the caret looks frozen open AND closed. Under
            prefers-reduced-motion the transition is dropped but the rotation
            still lands, so the state is never motion-only. */}
        <span className="look-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="look-menu">
          <div className="look-grid" role="radiogroup" aria-label="Visual style">
            {presets.map((preset, i) => (
              <button
                key={preset.id}
                role="radio"
                aria-checked={preset.id === styleId}
                tabIndex={preset.id === styleId ? 0 : -1}
                className={`look-option${preset.id === styleId ? ' look-option--on' : ''}`}
                onClick={() => onStyleChange(preset.id)}
                onKeyDown={(e) => {
                  const delta =
                    e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
                    : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1
                    : 0;
                  if (!delta) return;
                  e.preventDefault();
                  e.stopPropagation();
                  move(i, delta);
                }}
                title={preset.suffix ?? undefined}
              >
                <span className="look-swatch" style={{ background: preset.color }} aria-hidden="true" />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>

          {/* Inline rather than in settings: choosing "Custom" and then being sent
              to another dialog to say what custom means is a broken sentence. */}
          {current.isCustom && (
            <input
              className="look-custom"
              value={customStyle}
              onChange={(e) => onCustomStyleChange(e.target.value)}
              placeholder="describe your own look — e.g. expired Polaroid, heavy light leaks"
              aria-label="Custom style description"
              autoFocus
            />
          )}
        </div>
      )}
    </div>
  );
}
