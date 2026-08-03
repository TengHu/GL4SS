/**
 * TEST THE DOWNLOAD WITHOUT GENERATING ANYTHING.
 *
 * The save button touches no API — it works on clips already paid for — but
 * every check of it so far has cost a sweep and a film pass, because the only
 * way to get clips was to buy them. Three broken versions shipped that way. This
 * makes fake ones locally, in the browser, for nothing.
 *
 * They are REAL videos, not stand-ins: a canvas recorded through MediaRecorder,
 * producing blob: URLs of exactly the kind renderClip hands back. So the path
 * under test is the shipping path — same stitchClips, same extension logic, same
 * download — and the only thing simulated is where the pixels came from.
 *
 *     await window.__testSave(1)   // the passthrough — one clip, no recorder
 *     await window.__testSave(3)   // the joiner — three clips, real-time
 *
 * Dev only. Not reachable from the built bundle.
 */
import { extensionFor, stitchClips } from './stitch';

/** A short clip of a numbered colour field, as a blob: URL. */
async function fakeClip(index: number, seconds = 2): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d')!;
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const done = new Promise<Blob>((r) => {
    recorder.onstop = () => r(new Blob(chunks, { type: recorder.mimeType }));
  });
  recorder.start();

  const started = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - started) / 1000;
      if (t >= seconds) return resolve();
      // Something that visibly MOVES, so a recording of nothing is obvious.
      ctx.fillStyle = `hsl(${index * 90}, 60%, ${25 + 20 * Math.sin(t * 4)}%)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = '96px monospace';
      ctx.fillText(`${index + 1}`, 40, 140);
      ctx.fillRect(40, 200, (t / seconds) * 560, 12);
      requestAnimationFrame(tick);
    };
    tick();
  });

  recorder.stop();
  return URL.createObjectURL(await done);
}

export async function testSave(count = 2): Promise<void> {
  console.info(`[stitch-test] making ${count} clip(s) locally — no API calls, nothing spent`);
  const urls: string[] = [];
  for (let i = 0; i < count; i++) urls.push(await fakeClip(i));

  const blob = await stitchClips(urls, {
    onProgress: (p) => console.info(`[stitch-test] joining ${p.clip}/${p.clips}`),
  });
  const ext = extensionFor(blob);
  console.info(
    `[stitch-test] result: ${(blob.size / 1024).toFixed(0)}KB, type "${blob.type}", saving as .${ext}`,
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stitch-test-${count}-clip.${ext}`;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    urls.forEach((u) => URL.revokeObjectURL(u));
  }, 60_000);
}
