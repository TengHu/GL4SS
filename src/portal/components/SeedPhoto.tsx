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

import { useRef, useState } from 'react';
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

  const take = async (file: File | undefined) => {
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
  };

  if (photo) {
    return (
      <div className="seedphoto seedphoto--set">
        <img className="seedphoto-thumb" src={photo.url} alt="" />
        <div className="seedphoto-body">
          <span className="seedphoto-title">Your photograph anchors the camera</span>
          <span className="seedphoto-meta">
            {photo.name} · {photo.width}×{photo.height} · new pictures are framed like it
          </span>
        </div>
        <button className="ghost-btn seedphoto-clear" onClick={() => onChange(null)}>
          remove
        </button>
      </div>
    );
  }

  return (
    <div className="seedphoto">
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
        {error ?? 'frames this spot from your camera position · stays in your browser'}
      </span>
    </div>
  );
}
