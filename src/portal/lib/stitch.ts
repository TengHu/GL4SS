/**
 * SAVE THE CLIPS AS THEY ARE.
 *
 * Every clip is already an MP4, sitting in memory as a blob URL, and it is the
 * exact file the player is playing. Saving it is a fetch and an anchor: same
 * frame rate, same resolution, same encoding, same bytes.
 *
 * WHAT THIS REPLACED, because the mistake is worth recording. Asked for "one
 * video", this file grew a canvas recorder, then a WebCodecs encoder, then an
 * MP4 muxer — a complete re-encoding pipeline — and shipped broken seven times:
 * an audio track that stalled the muxer, an autoplay rejection read as success,
 * a hardcoded extension, a frame counter that made the output four times too
 * slow on a 120Hz display, a codec level too low for the clips, and a finalize()
 * that threw over the top of every one of those and hid it.
 *
 * All of it to avoid saving files that were already correct. The one genuinely
 * hard part was joining several into one container, and that was the only part
 * that was ever asked for — everything else was already done.
 *
 * If joining is wanted again it should be a REMUX: demux each MP4 and write the
 * existing frames into one container. Lossless, correct frame rate by
 * construction, and it never touches a pixel. Re-encoding was the wrong shape
 * from the first line.
 */

/** The extension the bytes deserve, rather than one assumed in advance. */
export function extensionFor(blob: Blob): string {
  if (blob.type.includes('mp4')) return 'mp4';
  if (blob.type.includes('webm')) return 'webm';
  if (blob.type.includes('quicktime')) return 'mov';
  return 'mp4';
}

export interface SaveProgress {
  clip: number;
  clips: number;
}

/**
 * Save every clip, in order, untouched.
 *
 * One file each. A clip that will not load is skipped rather than fatal: the
 * others were paid for too, and a gap beats an error.
 */
export async function saveClips(
  urls: string[],
  baseName: string,
  options: { onProgress?: (p: SaveProgress) => void } = {},
): Promise<number> {
  let saved = 0;
  for (let i = 0; i < urls.length; i++) {
    options.onProgress?.({ clip: i + 1, clips: urls.length });
    let blob: Blob;
    try {
      blob = await (await fetch(urls[i]!)).blob();
    } catch {
      continue;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Numbered only when there is more than one, so the ordinary case is a file
    // named after the place rather than after its position in a list of one.
    const part = urls.length > 1 ? ` ${String(i + 1).padStart(2, '0')}` : '';
    a.download = `${baseName}${part}.${extensionFor(blob)}`;
    a.click();
    // Revoked late: Safari drops the download if the url dies in the same tick.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    saved++;
    // Browsers rate-limit consecutive programmatic downloads; a beat between
    // them is the difference between four files and one.
    if (i < urls.length - 1) await new Promise((r) => setTimeout(r, 350));
  }
  if (!saved) throw new Error('none of the clips could be read');
  return saved;
}
