/**
 * CUT THE SEED DOWN TO WHAT SURVIVES, then let the drawing model refill it.
 *
 * A sweep frame is the same view in a different year, and the seed photograph is
 * the only real evidence of that view we will ever have. Two things have to
 * happen to it at once and they pull opposite ways: the camera and whatever
 * genuinely persisted must come through pixel-for-pixel, and the people, the
 * weather and everything built since must be gone. One conditioning channel
 * cannot do both — it applies the same policy to the whole frame.
 *
 * So the policy is applied HERE, per region, before the picture is sent.
 *
 *   ask a vision model what does not belong in the target year
 *   erase those regions, blur the ones merely changed, keep the rest
 *   paint the perspective grid into the holes so they still state the camera
 *
 * WHY THIS ORDER MATTERS. Erasing is what makes a fresh crowd possible: with no
 * bodies in the reference there are no poses to copy, which is what defeated
 * every earlier attempt — a 1987 crowd reached 1900 with only their clothes
 * repainted, white trainers and all. And keeping everything else is what holds
 * the vantage, which words could not: measured across one sweep, prose fixed the
 * focal length and let the camera climb 1.6 m and level out by 6 degrees.
 *
 * MEASURED, NOT ASSUMED. Probed 2026-08-02 against the live API on two seeds:
 *
 *   Colosseum 2020 -> 1600   the 1806 and 1820s buttresses correctly removed,
 *                            ground level raised, vantage held, no grid visible
 *   Washington DC 2020 -> 1900  Federal Triangle replaced by the brick quarter
 *                            that stood there, the B&P railway back across the
 *                            Mall, obelisk unmoved, on a frame ~60% erased
 *
 * Both cost about $0.003 to segment and ran in six seconds.
 *
 * BOXES, NOT MASKS, AND THAT IS A CHOICE. Gemini will return per-pixel masks,
 * but they are base64 PNGs: one large mask ate 30k output tokens, and a full
 * request cost $0.10 and 146 seconds to return one and a half objects. Boxes
 * cost a thousandth of that. They are also, for this job, usually the better
 * shape — the failure modes are asymmetric. Erase too much and the model
 * reinvents some background, which it does well; erase too little and a fragment
 * of the anachronism survives, and inpainting BRIDGES it back. A 95%-accurate
 * mask leaves 5% of a fence, which is a seed for the fence. A box three times
 * too big just costs some wall.
 *
 * The one case boxes genuinely lose is a thin thing lying on content that must
 * survive exactly — a handrail across a facade, whose box is mostly facade.
 * That is a real limitation and it is not worked around here.
 */

import { postChat } from '../../lib/openrouter';
import type { StandpointCamera } from '../../lib/openrouter';
import { cameraIsUsable, paintCameraGrid } from './cameraSkeleton';

/** One thing the vision model says does not belong in the target year. */
export interface Anachronism {
  /** [y0, x0, y1, x1], normalised 0-1000, as the model returns it. */
  box: [number, number, number, number];
  label: string;
  /** 'absent' erases the region; 'altered' blurs it. */
  change: 'absent' | 'altered';
}

const SEG_TIMEOUT_MS = 90_000;

/**
 * Ask what is in this photograph that was not there in `year`.
 *
 * OPEN VOCABULARY, NO CATEGORIES. Nothing here knows what a person is, or a
 * building, or a railing — the model names whatever it finds, so the same call
 * serves a crowd, a monument, a glacier and a burnt-out street. Every earlier
 * design in this repo tried to classify objects and then decide policy per
 * class; each one turned into a lookup table that generalised to nothing.
 *
 * MERGING IS REQUESTED EXPLICITLY. Left alone it returns each sign and each
 * railing separately — one probe came back with 168 boxes, 63 of them the word
 * "sign" — which is both unusable and a token budget spent on nothing.
 */
export async function segmentAnachronisms(
  apiKey: string,
  seedImage: string,
  seedYear: number,
  targetYear: number,
  location: string,
  model: string,
  options: { signal?: AbortSignal; limit?: number } = {},
): Promise<Anachronism[]> {
  const limit = options.limit ?? 30;
  const prompt = [
    `This photograph of ${JSON.stringify(location)} was taken in ${seedYear}. I want to render the SAME VIEW as it was in the year ${targetYear}.`,
    ``,
    `List everything visible that would NOT be present, unchanged, at this spot in ${targetYear}.`,
    `Think about DATES. Buildings, structures, monuments, roads, landscaping, fittings and street furniture all have construction dates; anything completed after ${targetYear}, or demolished before it, must be listed as absent. Every person, animal and vehicle is transient and must be listed. Anything that existed in ${targetYear} but was laid out, weathered, buried, overgrown or otherwise materially different then must be listed as altered.`,
    `Do NOT list things that were already there in ${targetYear} and looked much the same.`,
    ``,
    `Return ONLY a compact JSON array, no prose, no markdown. Each entry exactly:`,
    `{"b":[y0,x0,y1,x1],"l":"short label","c":"absent"|"altered"}`,
    `Coordinates normalised 0-1000. MERGE contiguous runs of the same thing into ONE entry covering the whole run. Return at most ${limit} entries, largest-area and most significant first.`,
  ].join('\n');

  try {
    const data = await postChat(
      apiKey,
      {
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: seedImage } },
            ],
          },
        ],
        max_tokens: 5000,
      },
      { signal: options.signal, timeoutMs: SEG_TIMEOUT_MS },
    );
    const raw = (data.choices?.[0]?.message?.content ?? '') as unknown;
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
    return parseAnachronisms(text);
  } catch (err) {
    if (options.signal?.aborted) return [];
    console.warn(
      `[looking-glass] anachronism pass failed for ${targetYear} — this frame keeps the whole ` +
        `seed photograph, so anything modern in it may survive. ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/**
 * TOLERANT ON PURPOSE — regex, not JSON.parse.
 *
 * Observed on the live API: a response that ends with a valid `]` but contains
 * one entry missing its opening brace. JSON.parse throws and the whole answer is
 * lost over one character. Every well-formed entry is recoverable independently,
 * and a partial list is worth far more than none: the frame still gets most of
 * its anachronisms erased.
 */
export function parseAnachronisms(raw: string): Anachronism[] {
  const re =
    /"b"\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]\s*,\s*"l"\s*:\s*"([^"]*)"\s*,\s*"c"\s*:\s*"([^"]*)"/g;
  const out: Anachronism[] = [];
  for (const m of raw.matchAll(re)) {
    const box: [number, number, number, number] = [+m[1]!, +m[2]!, +m[3]!, +m[4]!];
    // A box that covers essentially the whole frame is not information, it is
    // the model giving up — honouring it would erase the picture entirely.
    const area = ((box[2] - box[0]) * (box[3] - box[1])) / 1e6;
    if (area > 0.9) continue;
    if (box[2] <= box[0] || box[3] <= box[1]) continue;
    const change = m[6] === 'altered' ? 'altered' : 'absent';
    /**
     * A BIG 'ALTERED' BOX DESTROYS MORE THAN IT SAYS.
     *
     * Blur is a good answer for a walkway, a kiosk, a re-laid surface: the thing
     * survives, the detail is freed, and it costs no extra call. It is a
     * catastrophic answer for the landmark. Asked for 1987 from 2010 the pass
     * marked the Colosseum `altered` — correct in itself, the stone was dirtier
     * before the 1990s cleaning — and the composite blurred the entire
     * amphitheatre into a smear. The one structure that must be identical in
     * every frame of the sweep became the one structure the model could not see,
     * so it rebuilt it from the prose instead, in the place the prose put it,
     * while the smear rebuilt as a second one.
     *
     * The change itself is not lost by dropping the box: 'altered' means "still
     * there, looked different", and how it looked different is a sentence, which
     * the planner has already written into `standing` — "the stone significantly
     * darker and more stained by smog". Words carry a colour change perfectly
     * and pixels carry a viewpoint perfectly. Trading the second for the first
     * is the wrong way round.
     *
     * Absent is untouched. Erasing is what the mechanism is FOR, and an absent
     * region is one the model is supposed to author.
     */
    if (change === 'altered' && area > 0.05) continue;
    out.push({ box, label: m[5]!, change });
  }
  return out;
}

/**
 * Build the picture that actually gets sent: the seed, cut down to what survives.
 *
 * Returns a data URL, or null if there is nothing to do — no anachronisms means
 * the seed is already the right picture for this year and should go as-is.
 */
export async function compositeCutout(
  seedImage: string,
  items: Anachronism[],
  camera: StandpointCamera | undefined,
): Promise<string | null> {
  if (!items.length) return null;

  const img = await loadImage(seedImage);
  const W = img.naturalWidth || 1024;
  const H = img.naturalHeight || 576;

  /**
   * THE ATTACHMENT AND THE REQUEST MUST AGREE ABOUT SHAPE.
   *
   * The image call hardcodes aspect_ratio 16:9 while this cut-out keeps whatever
   * shape the seed had, and the prompt then asks for "the same framing" — three
   * claims that cannot all hold if they differ. In practice they do not: the
   * seed is always a frame this app generated, and every frame is asked for at
   * 16:9. So this is a guard against a future where a seed arrives from
   * somewhere else — a Street View capture is sized to the viewport box, an
   * upload is whatever it is — and it says so rather than producing a frame that
   * is quietly cropped against its own reference.
   */
  const ASPECT = 16 / 9;
  if (Math.abs(W / H - ASPECT) > 0.08) {
    console.warn(
      `[looking-glass] the seed is ${W}x${H} (${(W / H).toFixed(2)}:1) but the drawing ` +
        `request asks for 16:9 — the frame will not line up with its own reference.`,
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const toRect = (a: Anachronism, grow: number) => {
    const [y0, x0, y1, x1] = a.box;
    return {
      x: (x0 / 1000) * W - grow,
      y: (y0 / 1000) * H - grow,
      w: ((x1 - x0) / 1000) * W + 2 * grow,
      h: ((y1 - y0) / 1000) * H + 2 * grow,
    };
  };

  ctx.drawImage(img, 0, 0, W, H);

  /**
   * ALTERED FIRST, so a region that is both merely changed and partly absent
   * ends up erased rather than blurred. Absent is the stronger verdict.
   *
   * Blur is what carries weathering, ivy, a risen ground level, a re-laid road:
   * the structure survives the blur and the detail is freed, which is a third
   * policy between keeping and erasing and costs no extra call to express.
   */
  const softened = items.filter((a) => a.change === 'altered');
  if (softened.length) {
    ctx.save();
    ctx.beginPath();
    for (const a of softened) {
      const r = toRect(a, 0);
      ctx.rect(r.x, r.y, r.w, r.h);
    }
    ctx.clip();
    ctx.filter = `blur(${Math.max(4, Math.round(Math.min(W, H) / 90))}px)`;
    ctx.drawImage(img, 0, 0, W, H);
    ctx.restore();
    ctx.filter = 'none';
  }

  /**
   * GROWN, because under-erasing is the expensive mistake.
   *
   * A surviving sliver of a fence is a seed the model will bridge back across
   * the hole; surplus erased wall is simply reinvented, which it does well.
   */
  const gone = items.filter((a) => a.change === 'absent');
  const grow = Math.max(4, Math.round(Math.min(W, H) / 160));
  if (gone.length) {
    ctx.save();
    ctx.beginPath();
    for (const a of gone) {
      const r = toRect(a, grow);
      ctx.rect(r.x, r.y, r.w, r.h);
    }
    ctx.clip();
    ctx.fillStyle = '#8c8c8c';
    ctx.fillRect(0, 0, W, H);
    /**
     * The grid goes INSIDE the erased regions and nowhere else. Where pixels
     * survive they state the camera themselves; where they are gone this is the
     * only thing left saying where the ground lies.
     */
    if (cameraIsUsable(camera)) paintCameraGrid(ctx, camera, W, H);
    ctx.restore();
  }

  return canvas.toDataURL('image/png');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Provider CDNs serve frames cross-origin; without this the canvas is
    // tainted and toDataURL throws a SecurityError instead of returning bytes.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load the seed for masking'));
    img.src = src;
  });
}
