/**
 * THE BROWSER SURFACE THE APP'S OWN MODULES NEED, and nothing beyond it.
 *
 * The point of this directory is to run the SHIPPING code, not a copy of it —
 * compositeCutout, buildSweepPrompts, renderStill, planStandpoint, all imported
 * straight out of ../src. Four of them reach for a canvas or a window, so those
 * four things are provided here and nothing else is.
 *
 * The canvas is a real one. @napi-rs/canvas is Skia, the engine Chrome draws
 * with, so the grey rectangles, the Gaussian blur and the perspective grid come
 * out as they do in the browser rather than approximately.
 */
import { createCanvas, loadImage, Image as SkiaImage } from '@napi-rs/canvas';

type G = typeof globalThis & Record<string, unknown>;
const g = globalThis as G;

g.window ??= g;

/**
 * commonHeaders() sends HTTP-Referer from window.location.origin, guarded only
 * by `typeof window !== 'undefined'` — which the line above makes true. So the
 * origin has to exist, and it is the same string the guard falls back to.
 */
g.location ??= { origin: 'https://lookingglass.local', href: 'https://lookingglass.local/' };

g.document ??= {
  createElement(tag: string) {
    if (tag !== 'canvas') throw new Error(`the shim only makes canvases, not <${tag}>`);
    // Size is set by the caller straight after; Skia reallocates on assignment.
    return createCanvas(1, 1) as unknown as HTMLCanvasElement;
  },
};

/**
 * timeMask.loadImage() constructs one of these, sets crossOrigin and src, and
 * waits on onload — so the shim is a class with settable handlers rather than a
 * promise-returning function.
 *
 * IT HOLDS A SKIA IMAGE RATHER THAN BEING ONE, and that is forced. Skia's own
 * `src` setter takes bytes and reports the right dimensions, but the decoded
 * pixels never arrive: draw one and the canvas comes back black, which cost an
 * hour to find because everything about it looks like it worked. Only
 * `loadImage()` returns something with pixels in it, and it is async and returns
 * an object of its own, so this cannot inherit from it or become it in place.
 *
 * Which leaves drawImage, below, to unwrap it.
 */
class ShimImage {
  crossOrigin = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  /** The real one. Read by the drawImage patch. */
  __skia: SkiaImage | null = null;
  #src = '';

  get naturalWidth() { return this.__skia?.width ?? 0; }
  get naturalHeight() { return this.__skia?.height ?? 0; }
  get width() { return this.__skia?.width ?? 0; }
  get height() { return this.__skia?.height ?? 0; }

  set src(value: string) {
    this.#src = value;
    const comma = value.indexOf(',');
    if (!value.startsWith('data:') || comma < 0) {
      queueMicrotask(() => this.onerror?.());
      return;
    }
    void loadImage(Buffer.from(value.slice(comma + 1), 'base64'))
      .then((img) => {
        this.__skia = img;
        this.onload?.();
      })
      .catch(() => this.onerror?.());
  }
  get src() { return this.#src; }
}

g.Image ??= ShimImage as unknown as typeof HTMLImageElement;

/**
 * Substitute the real image on the way into Skia.
 *
 * The alternative was to make ShimImage inherit from Skia's Image so no
 * unwrapping was needed. That path decodes dimensions and draws nothing — see
 * above — so the wrapper is not a shortcut, it is the only shape that works.
 * Patched once, on the prototype, and it touches nothing but the first argument.
 */
{
  const ctx = createCanvas(1, 1).getContext('2d');
  const proto = Object.getPrototypeOf(ctx) as { drawImage: (...a: unknown[]) => unknown };
  const native = proto.drawImage;
  proto.drawImage = function (this: unknown, src: unknown, ...rest: unknown[]) {
    const real = (src as { __skia?: unknown })?.__skia ?? src;
    return native.call(this, real, ...rest);
  };
}
