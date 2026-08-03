/**
 * THE CAMERA, DRAWN — a perspective skeleton attached to every frame of a sweep.
 *
 * The product sends observers to one fixed position in many different years.
 * Words turned out to fix the lens and not the tripod: measured off two frames
 * of the same Colosseum sweep, the focal length held (74° against 72°, inside
 * the error of the estimate) while the camera climbed 1.6 m and levelled out by
 * 6.2°, moving the horizon 13.4% of the frame height. In the seed the
 * photographer stands in the crowd and the horizon runs through their eyes; in
 * the 1900 frame nobody's head reaches it, because the photographer is a storey
 * up.
 *
 * Height and tilt are exactly what a horizon line states, and they are the two
 * that drifted. So this draws them.
 *
 * WHY NOT A GENERATED PLATE. The obvious alternative is to have a model turn the
 * seed into line art and condition on that. It carries more — the actual
 * building — but it can be WRONG, and a plate with the wrong arcade count pins a
 * wrong Colosseum into every frame of the run. This image is computed from six
 * numbers and contains no claim about the scene at all: a horizon, a vanishing
 * point, and a ground grid. It cannot hallucinate because it depicts nothing.
 *
 * It is also free. No API call, no model, no cache, no failure mode beyond
 * numbers out of range — which is checked, not hoped for.
 *
 * NOT A DEPTH MAP. OpenRouter exposes no structural conditioning on any of its
 * 38 image models — probed 2026-08-02, the complete parameter set is
 * aspect_ratio, background, input_references, n, output_compression,
 * output_format, quality, resolution, seed. There is no ControlNet to feed, so
 * this goes in as an ordinary reference image and relies on the model reading it
 * as a diagram. That is the part experiment has to settle; the geometry below is
 * arithmetic and settles itself.
 */

/**
 * Defined where it is PARSED, not where it is drawn. One definition, so the
 * field the parser fills and the field the drawing reads cannot drift apart.
 */
import type { StandpointCamera } from '../../lib/openrouter';

export type { StandpointCamera };

/**
 * Ranges outside which the numbers are not worth drawing.
 *
 * A planner that answers 200° or 400 m has misread the photograph, and a
 * skeleton built from that would confidently pin the wrong camera into every
 * frame — worse than no skeleton, because it would be obeyed. Out of range means
 * fall back to prose, which is the behaviour that shipped before this file.
 */
const LIMITS: Record<string, [number, number]> = {
  // 120 assumed anything higher was a misread photograph. An elevated seed is
  // not a misread one: a terrace over Rome is ~150m and an aerial is several
  // hundred, and BOTH were silently refused — no grid painted, and no drift
  // measured, for exactly the seeds whose vantage is hardest to hold. The
  // ceiling is still a sanity gate, just one set above real viewpoints.
  eyeHeightM: [0.3, 4000],
  tiltDeg: [-60, 60],
  hfovDeg: [10, 140],
  nearestM: [0.15, 2000],
};

export function cameraIsUsable(cam: Partial<StandpointCamera> | undefined): cam is StandpointCamera {
  if (!cam) return false;
  for (const [key, [lo, hi]] of Object.entries(LIMITS)) {
    const v = (cam as Record<string, unknown>)[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) {
      /**
       * OUT OF RANGE USED TO BE SILENT, and silence is what made it expensive.
       * A single field over its limit disables the grid AND the drift check for
       * every frame of the run, and the log printed the numbers as though they
       * had been used — so a sweep with its camera machinery entirely switched
       * off looked exactly like one without.
       */
      console.warn(
        `[looking-glass] camera numbers rejected: ${key}=${String(v)} outside [${lo}, ${hi}] — ` +
          `no perspective grid and no drift check on this run.`,
      );
      return false;
    }
  }
  return true;
}

/**
 * Where the horizon falls, as a fraction of frame height from the top.
 *
 * Split out from the drawing because it is the whole claim and it is testable
 * without a canvas. Level tilt puts it at exactly 0.5 — that identity is the
 * check on the sign convention, and it is asserted in the test.
 */
export function horizonFraction(hfovDeg: number, tiltDeg: number, aspect: number): number {
  const tanV2 = Math.tan((hfovDeg * Math.PI) / 360) / aspect;
  const f = 0.5 / tanV2; // focal length in units of frame height
  return 0.5 - f * Math.tan((tiltDeg * Math.PI) / 180);
}

/** Lateral offsets, in LATTICE UNITS. Multiples of 4 draw heavier — a cadence. */
const RAILS = [-24, -16, -12, -8, -6, -4, -3, -2, -1, 0, 1, 2, 3, 4, 6, 8, 12, 16, 24];
/** Forward distances, in LATTICE UNITS. */
const TIES = [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96];

/**
 * Draw the skeleton and return it as a data URL, or null if the numbers are not
 * worth drawing.
 *
 * 16:9 because that is the aspect every sweep frame asks for, and a diagram at a
 * different shape would state a horizon fraction the output cannot honour.
 */
export function drawCameraSkeleton(
  cam: Partial<StandpointCamera> | undefined,
  opts: { width?: number; height?: number } = {},
): string | null {
  if (!cameraIsUsable(cam)) return null;
  const W = opts.width ?? 1024;
  const H = opts.height ?? 576;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  paintCameraGrid(ctx, cam, W, H);
  return canvas.toDataURL('image/png');
}

/**
 * Paint the grid onto an existing context — no fill, no clear.
 *
 * Exists so the cut-out compositor can draw it directly into the regions it has
 * erased, rather than attaching a second reference image beside the photograph.
 * One attachment is better than two: the model has to be told what each picture
 * IS, and every extra convention is another instruction that can be misread.
 *
 * The lattice scales with eye height. A one-metre grid is right standing at a
 * parapet and meaningless from 200 m up in a helicopter, where it would render
 * as flat grey noise — so the spacing is derived from the altitude rather than
 * fixed, and the same code serves a street corner and an aerial.
 */
export function paintCameraGrid(
  ctx: CanvasRenderingContext2D,
  cam: StandpointCamera,
  W: number,
  H: number,
): void {
  {
  const aspect = W / H;
  const tanV2 = Math.tan((cam.hfovDeg * Math.PI) / 360) / aspect;
  const f = H / 2 / tanV2;
  const th = (cam.tiltDeg * Math.PI) / 180;
  const cx = W / 2;
  const cy = H / 2;
  const eye = cam.eyeHeightM;
  const horizon = cy - f * Math.tan(th);

  /**
   * A point on the ground plane at the photographer's feet: lateral x, forward
   * d, both in metres. The plane is a reference, not the terrain — at the
   * Colosseum most of it is hidden behind a parapet and a pit. It is here to
   * state horizon height, tilt and convergence, which is all it is asked to do.
   */
  const proj = (x: number, d: number): [number, number] | null => {
    const z = d * Math.cos(th) + eye * Math.sin(th);
    if (z <= 0.02) return null; // behind the lens
    const y = eye * Math.cos(th) - d * Math.sin(th);
    return [cx + (f * x) / z, cy + (f * y) / z];
  };

  const stroke = (pts: ([number, number] | null)[], width: number, alpha: number) => {
    ctx.beginPath();
    ctx.lineWidth = width;
    ctx.strokeStyle = `rgba(17,17,17,${alpha})`;
    let down = false;
    for (const p of pts) {
      if (!p) { down = false; continue; }
      if (!down) { ctx.moveTo(p[0], p[1]); down = true; } else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
  };

  ctx.lineCap = 'round';

  // The lattice, in metres, sized to the altitude. See paintCameraGrid.
  const S = Math.max(0.5, eye * 0.5);
  const near = Math.max(cam.nearestM, S * 0.2);
  for (const k of RAILS) {
    const x = k * S;
    const pts: ([number, number] | null)[] = [];
    for (let i = 0; i < 900; i++) pts.push(proj(x, near + i * S * 0.08));
    const major = k % 4 === 0;
    stroke(pts, major ? 1.4 : 0.8, major ? 0.85 : 0.45);
  }
  for (const t of TIES) {
    const d = S * t;
    if (d < near) continue;
    const pts: ([number, number] | null)[] = [];
    for (let i = 0; i <= 96; i++) pts.push(proj((-24 + i * 0.5) * S, d));
    stroke(pts, 0.8, 0.55);
  }

  /**
   * The horizon, and the vanishing point sitting on it.
   *
   * Deliberately monochrome. A coloured line would be easier to name in the
   * prompt and risks bleeding into the render as a coloured object, which is a
   * bad trade — the clause identifies it structurally instead, as the horizontal
   * line the converging lines all meet at. That description is unique in this
   * drawing whatever the tilt.
   */
  ctx.beginPath();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = 'rgba(17,17,17,0.95)';
  ctx.moveTo(0, horizon);
  ctx.lineTo(W, horizon);
  ctx.stroke();

  ctx.beginPath();
  ctx.lineWidth = 1.8;
  ctx.arc(cx, horizon, 5, 0, Math.PI * 2);
  ctx.stroke();
  }
}
