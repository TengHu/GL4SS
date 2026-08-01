/**
 * BRING YOUR OWN PHOTOGRAPH.
 *
 * Belongs to the SEED, not to either path — a seed is a (time, picture) pair,
 * and every seed so far has been generated from its time. This is the
 * orthogonal move: supply the picture side instead. Both paths then consume the
 * seed without being able to tell the difference, which is why this control sits
 * above them rather than inside one of them.
 *
 * What it actually does is narrower than "upload" suggests, and the copy says so
 * because the word implies a server and this app does not have one: the file is
 * read in the browser, downscaled, and attached to the drawing request. It never
 * reaches anything but OpenRouter, on the visitor's own key, and a reload loses
 * it.
 *
 * It is a REFERENCE, not a replacement. The picture that comes back is still
 * generated for the year on the dial — your photograph only fixes where the
 * camera stands. Saying "replace" would promise the wrong thing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SeedImage } from '../lib/seedImage';
import { readSeedImage } from '../lib/seedImage';

interface Props {
  photo: SeedImage | null;
  onChange: (photo: SeedImage | null) => void;
}

export function SeedPhoto({ photo, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const take = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setBusy(true);
      setError(null);
      try {
        onChange(await readSeedImage(file));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'could not read that file');
      } finally {
        setBusy(false);
        // Clearing lets the same file be chosen twice running — otherwise the
        // input reports no change and nothing happens, which reads as a dead
        // button.
        if (input.current) input.current.value = '';
      }
    },
    [onChange],
  );

  /**
   * PASTE, ANYWHERE.
   *
   * On the document rather than on this element, because the natural gesture is
   * to copy an image and press paste — not to find a target first, click it, and
   * then paste. The control is the only thing on the page that wants an image
   * from the clipboard, so it can claim the event globally without competing
   * with anything.
   *
   * Except inside a text field. The key dialog, the year box and the custom
   * style box all take pasted text, and stealing paste from them to look for an
   * image nobody copied would break the one gesture those fields exist for.
   */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return;
      }
      const item = Array.from(e.clipboardData?.items ?? []).find(
        (i) => i.kind === 'file' && i.type.startsWith('image/'),
      );
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      void take(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [take]);

  /** Dropping is the same gesture with a mouse, and the same handler. */
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void take(e.dataTransfer.files?.[0]);
  };

  const dragProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop,
  };

  if (photo) {
    return (
      <div className={`seedphoto seedphoto--set${dragging ? ' seedphoto--over' : ''}`} {...dragProps}>
        <img className="seedphoto-thumb" src={photo.url} alt="" />
        <div className="seedphoto-body">
          <span className="seedphoto-title">Your photograph anchors the camera</span>
          <span className="seedphoto-meta">
            {error ?? `${photo.name} · ${photo.width}×${photo.height} · paste or drop another to replace`}
          </span>
        </div>
        <button className="ghost-btn seedphoto-clear" onClick={() => onChange(null)}>
          remove
        </button>
      </div>
    );
  }

  return (
    <div className={`seedphoto${dragging ? ' seedphoto--over' : ''}`} {...dragProps}>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void take(e.target.files?.[0])}
      />
      <button
        className="ghost-btn seedphoto-pick"
        onClick={() => input.current?.click()}
        disabled={busy}
      >
        {busy ? 'reading…' : 'use my own photo'}
      </button>
      <span className="seedphoto-meta">
        {error ?? 'or paste · or drop one here · frames this spot from your camera position'}
      </span>
    </div>
  );
}
