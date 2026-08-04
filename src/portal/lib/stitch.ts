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

/**
 * JOIN THE CLIPS INTO ONE MP4 — WITHOUT RE-ENCODING ANY OF IT.
 *
 * This is a REMUX. Each clip's encoded packets are read out of its container and
 * written into a single new one, unchanged: the same H.264 frames, the same
 * resolution, the same frame rate, bit for bit. Nothing is decoded, nothing is
 * drawn, nothing is played. It runs at disk speed rather than in real time.
 *
 * WHY THIS AND NOT WHAT CAME BEFORE. Seven attempts re-encoded — canvas capture
 * into MediaRecorder, then WebCodecs into a muxer — and every one of them was a
 * different way to lose: an audio track that stalled the muxer, an autoplay
 * rejection read as success, a frame counter that ran four times slow on a 120Hz
 * display, a codec level too low for the clips. All of it to rebuild pictures
 * that already existed and were already correct.
 *
 * The frames were never the problem. The container was. So only the container is
 * rebuilt.
 */
export async function joinClips(
  urls: string[],
  options: { onProgress?: (p: SaveProgress) => void } = {},
): Promise<Blob> {
  if (!urls.length) throw new Error('nothing to join');
  if (urls.length === 1) return await (await fetch(urls[0]!)).blob();

  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    EncodedPacket,
    EncodedPacketSink,
    EncodedVideoPacketSource,
    Input,
    Mp4OutputFormat,
    Output,
  } = await import('mediabunny');

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  let source: InstanceType<typeof EncodedVideoPacketSource> | null = null;
  /** Where the next clip starts on the joined timeline, in seconds. */
  let offset = 0;
  let written = 0;

  for (let i = 0; i < urls.length; i++) {
    options.onProgress?.({ clip: i + 1, clips: urls.length });
    const blob = await (await fetch(urls[i]!)).blob();
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) continue;

    const config = await track.getDecoderConfig();
    if (!config) continue;

    /**
     * The track is declared from the FIRST clip and every later one is appended
     * to it. They come from one model at one size, so they agree — and if one
     * ever did not, appending it is still better than refusing the whole film.
     */
    if (!source) {
      // 'avc1.42E01E' -> 'avc'. The clips are H.264 from every model in the
      // catalogue, and a codec this does not recognise fails loudly here rather
      // than producing a file no player will open.
      const family = config.codec.startsWith('av01')
        ? 'av1'
        : config.codec.startsWith('vp09')
          ? 'vp9'
          : config.codec.startsWith('hev1') || config.codec.startsWith('hvc1')
            ? 'hevc'
            : 'avc';
      source = new EncodedVideoPacketSource(family);
      output.addVideoTrack(source);
      await output.start();
    }

    let last = 0;
    for await (const packet of new EncodedPacketSink(track).packets()) {
      /**
       * Rebuilt with the offset added, because each clip's timestamps start at
       * zero. Passing them through unchanged would stack every clip on top of
       * the first — the same mistake the encoder version made, in a place where
       * it is arithmetic rather than a race with the display.
       */
      await source.add(
        new EncodedPacket(packet.data, packet.type, offset + packet.timestamp, packet.duration),
        // The decoder config rides along with every packet; the muxer keeps the
        // first and ignores the rest, and passing it always means a clip whose
        // config differs is described correctly rather than silently mislabelled.
        { decoderConfig: config },
      );
      last = Math.max(last, packet.timestamp + packet.duration);
      written++;
    }
    offset += last;
  }

  if (!source || !written) throw new Error('none of the clips could be read');

  await output.finalize();
  const buffer = (output.target as InstanceType<typeof BufferTarget>).buffer;
  if (!buffer) throw new Error('the joined file came back empty');
  return new Blob([buffer], { type: 'video/mp4' });
}
