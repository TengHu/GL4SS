/**
 * READING A PHOTOGRAPH THE VISITOR BRINGS.
 *
 * The file never leaves the browser except as an attachment on the drawing
 * request, to OpenRouter, on the visitor's own key — the same journey a
 * generated frame already makes in the other direction. There is no upload in
 * the sense the word usually means: nothing is stored anywhere but memory, and a
 * reload loses it.
 *
 * DOWNSCALED ON THE WAY IN, and that is not an optimisation. A phone photograph
 * is twelve megapixels; a generated frame is about one. The reference is carried
 * as a data URL inside every drawing request that uses it, so an untouched
 * original would put several megabytes on the wire per picture and, in a sweep,
 * once per station. Matching the size the models return costs nothing visible
 * and keeps the request the same order of magnitude it already was.
 */

/** Long edge, in pixels. Close to what the image models hand back. */
const MAX_EDGE = 1280;

/** Above this, JPEG. Below it, the file is small enough to keep whatever it is. */
const JPEG_QUALITY = 0.86;

export interface SeedImage {
  /** Data URL, downscaled. What gets attached to the drawing request. */
  url: string;
  /** For the cache key — see styleKey in Portal. */
  fingerprint: string;
  width: number;
  height: number;
  /** Original file name, purely so the control can name what it is holding. */
  name: string;
}

/**
 * Cheap, stable, and only ever compared with itself.
 *
 * This is not a checksum: it exists so that a frame drawn from THIS photograph
 * gets a different cache key from one drawn without it, or from one drawn with a
 * different photograph. Collisions would mean two references sharing an archive
 * entry, which is a nuisance rather than a corruption — the same shape of
 * trade-off the template hash already makes.
 */
function fingerprint(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).slice(0, 8);
}

export async function readSeedImage(file: File): Promise<SeedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name} is not an image`);
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('could not read the image — no canvas context');
    ctx.drawImage(bitmap, 0, 0, width, height);

    // JPEG regardless of the source: PNG screenshots of photographs are several
    // times larger for no visible gain, and this is going on the wire.
    const url = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    return { url, fingerprint: fingerprint(url), width, height, name: file.name };
  } finally {
    bitmap.close();
  }
}
