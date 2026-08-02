/**
 * STREET VIEW AS A SEED — look around, then keep what you are looking at.
 *
 * A third way for a photograph to reach the seed, alongside the file picker and
 * paste. From the moment it produces a `SeedImage` nothing downstream can tell
 * the difference, which is the whole reason it is a small component: the
 * reference flow already exists and this only has to arrive at it.
 *
 * It sits with the map because the thing it needs — a point on Earth — is what
 * the map is for. Clicking the map already moves the pin; this reports whether
 * a real photograph exists at the new pin, and offers to open it.
 *
 * BOTH BILLED CALLS ARE NAMED BEFORE THEY HAPPEN. Opening a sphere is $0.014,
 * a capture is $0.007. The app's standing promise is that browsing is free and
 * you are told before anything is spent; Google's meter does not care that this
 * is a map panel rather than the lever.
 */

import { useEffect, useRef, useState } from 'react';
import type { Coordinates } from '../../types';
import type { SeedImage } from '../lib/seedImage';
import { readSeedImage } from '../lib/seedImage';
import type { Panorama, StreetViewHere } from '../lib/streetView';
import { bearing, captureView, captureYear, lookupStreetView, openPanorama } from '../lib/streetView';

interface Props {
  apiKey: string;
  /** The pin — where the visitor pointed, not where the camera stands. */
  coordinates: Coordinates;
  /** Hands over a finished reference, and the year the picture was taken. */
  onCaptured: (photo: SeedImage, year: number | null) => void;
}

export function StreetViewSeed({ apiKey, coordinates, onCaptured }: Props) {
  const [here, setHere] = useState<StreetViewHere | null>(null);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const pano = useRef<Panorama | null>(null);

  /**
   * Ask what is here whenever the pin moves. Free, so it can be automatic —
   * the visitor should not have to press something to find out whether the
   * option exists at all.
   */
  useEffect(() => {
    if (!apiKey) return;
    const abort = new AbortController();
    setHere(null);
    setLooking(false);
    setError(null);
    pano.current = null;
    lookupStreetView(apiKey, coordinates, 60, abort.signal)
      .then(setHere)
      .catch((err: unknown) => {
        if (abort.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'street view lookup failed');
      });
    return () => abort.abort();
  }, [apiKey, coordinates]);

  /** Open the sphere, aimed back at the point the visitor actually clicked. */
  const look = async () => {
    if (!here || !host.current) return;
    setBusy('opening');
    setError(null);
    setLooking(true);
    try {
      pano.current = await openPanorama(
        apiKey,
        host.current,
        here.panoId,
        bearing(here.at, coordinates),
      );
    } catch (err) {
      setLooking(false);
      setError(err instanceof Error ? err.message : 'could not open the panorama');
    } finally {
      setBusy(null);
    }
  };

  const keep = async () => {
    if (!pano.current || !host.current) return;
    setBusy('capturing');
    setError(null);
    try {
      const box = host.current.getBoundingClientRect();
      const shot = await captureView(apiKey, pano.current, {
        width: box.width,
        height: box.height,
      });
      // A File, so it walks the identical path a pasted picture does.
      const file = new File([shot.blob], `street-view-${shot.panoId.slice(0, 8)}.jpg`, {
        type: shot.blob.type || 'image/jpeg',
      });
      onCaptured(await readSeedImage(file), captureYear(here?.date ?? null));
      setLooking(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'capture failed');
    } finally {
      setBusy(null);
    }
  };

  if (!apiKey) return null;

  return (
    <div className="sv">
      {!looking && (
        <div className="sv-row">
          <span className={`sv-dot${here ? ' sv-dot--on' : ''}`} aria-hidden="true" />
          <span className="sv-meta">
            {error
              ? error
              : here
                ? `street view here${here.date ? ` · ${here.date}` : ''}`
                : 'no street view here'}
          </span>
          {here && (
            <button className="ghost-btn sv-go" onClick={() => void look()} disabled={Boolean(busy)}>
              {busy === 'opening' ? 'opening…' : 'look around'}
              <span className="sv-price">$0.014</span>
            </button>
          )}
        </div>
      )}

      {/* Kept mounted once opened: the sphere is a live SDK object bound to this
          element, and unmounting it would throw away a panorama already paid
          for. Hidden rather than removed. */}
      <div className="sv-stage" style={looking ? undefined : { display: 'none' }}>
        <div className="sv-pano" ref={host} />
        <div className="sv-bar">
          <span className="sv-meta">
            {error ?? 'drag to aim · zoom is a lens, not a crop · arrows walk the street'}
          </span>
          <button className="ghost-btn" onClick={() => setLooking(false)} disabled={Boolean(busy)}>
            back
          </button>
          <button className="film-go sv-keep" onClick={() => void keep()} disabled={Boolean(busy)}>
            {busy === 'capturing' ? 'capturing…' : 'use this view'}
            <span className="sv-price">$0.007</span>
          </button>
        </div>
      </div>
    </div>
  );
}
