/**
 * THE WORMHOLE.
 *
 * The waiting state used to be a conic-gradient pinwheel — CSS can rotate and
 * fade, and that is about the end of it, so every version of it looked like a
 * loading spinner wearing a costume. This is a fragment shader instead: a
 * tunnel in polar coordinates with flowing fractal noise, per-channel chromatic
 * aberration and radial streaks, running for the 5–30s a frame takes to render.
 *
 * Raw WebGL, not three.js. three is already a dependency for the globe but it is
 * ~190 kB and lazily loaded behind a keypress; a full-screen quad and one shader
 * is a few hundred lines of nothing, and the waiting state must not be the thing
 * that makes a visitor download a 3D engine.
 *
 * DIRECTION drives the sign of the depth scroll — forward flies INTO the tunnel,
 * back falls out of it — and the palette. DISTANCE drives speed, saturation and
 * aberration. So a one-station nudge is a slow amber drift and a leap into the
 * Cretaceous is a violent electric plunge, from the same twenty lines of GLSL.
 */

import { useEffect, useRef } from 'react';
import type { JumpCharacter } from '../lib/pin';

interface Props {
  jump: JumpCharacter;
}

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform float uDir;        // +1 forward, -1 back
uniform float uIntensity;  // 0.55 near .. 1.0 far
uniform vec3  uColorA;
uniform vec3  uColorB;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

/**
 * Value noise whose lattice WRAPS on x with period px.
 *
 * The angular coordinate of a tunnel is atan(y, x), which jumps from +pi to -pi
 * across the negative x-axis. Sampling ordinary noise along it puts a hard seam
 * straight out of the tunnel's left side — clearly visible as a horizontal tear
 * once the shader was finally rendering. Wrapping the integer lattice makes the
 * noise genuinely periodic around the throat, so the two sides of the cut agree.
 */
float noise(vec2 p, float px) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, px), x1 = mod(i.x + 1.0, px);
  return mix(mix(hash(vec2(x0, i.y)), hash(vec2(x1, i.y)), f.x),
             mix(hash(vec2(x0, i.y + 1.0)), hash(vec2(x1, i.y + 1.0)), f.x), f.y);
}

// Four octaves is the floor for this to read as turbulence rather than as
// wallpaper, and the ceiling for something that renders while a GPU is also
// decoding a multi-megabyte photograph. The lacunarity is exactly 2.0 rather
// than a detuned 2.03 because the wrap period has to double with it.
float fbm(vec2 p, float px) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p, px); p *= 2.0; px *= 2.0; a *= 0.5; }
  return v;
}

// Classic tunnel projection: depth goes as 1/r, so the centre recedes forever.
vec3 tunnel(vec2 uv, float t) {
  float r = length(uv);
  float ang = atan(uv.y, uv.x);
  float depth = 0.40 / (r + 0.06) + t;
  // x in [-0.5, 0.5] — one full turn is exactly one unit, so the wrap periods
  // below are just the integer scale factors applied to it.
  vec2 tc = vec2(ang / 6.28318531, depth);

  float n = fbm(tc * vec2(12.0, 3.0) + vec2(0.0, t * 0.6), 12.0);
  float bands = fbm(tc * vec2(28.0, 1.4) - vec2(0.0, t * 1.3), 28.0);
  float glow = pow(1.0 - clamp(r, 0.0, 1.0), 2.2);
  float energy = n * 0.65 + bands * 0.75;

  vec3 col = mix(uColorA, uColorB, clamp(energy + glow * 0.45, 0.0, 1.0));
  col *= energy * 0.95 + glow * 0.70;

  // Radial filaments running down the throat.
  float streak = pow(abs(sin(ang * 22.0 + n * 7.0)), 14.0);
  col += streak * glow * 0.95 * uColorB;
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float t = uTime * uDir * (0.30 + uIntensity * 0.85);

  // Per-channel sampling at slightly different scales — real chromatic
  // aberration rather than an overlaid colour fringe.
  float ab = 0.014 * uIntensity;
  vec3 col = vec3(
    tunnel(uv * (1.0 - ab), t).r,
    tunnel(uv, t).g,
    tunnel(uv * (1.0 + ab), t).b
  );

  float r = length(uv);
  // A RING, not a wash: clear through the middle so the frame and the prose stay
  // legible, and faded at the corners so it does not fight the UI in them either.
  col *= smoothstep(0.09, 0.42, r);
  // The bezel's mount now owns the outer falloff (portal.css .portal-glass),
  // and .portal-glass is finally painted ABOVE this canvas, so the shader no
  // longer has to fake a vignette for itself.
  col *= 1.0 - smoothstep(0.55, 1.08, r);

  // The dial spans the bottom edge and the caption now sits top-left under the
  // wordmark — both are things a visitor reads WHILE waiting, so the tunnel
  // yields to them rather than the other way round. The bottom yield goes to
  // zero because the dial is opaque chrome; the top only takes the edge off,
  // since the caption is narrow, left-aligned and already carries both the
  // reading scrim and --readable-shadow. Killing the top outright would leave
  // the tunnel as a band across the middle.
  float sy = gl_FragCoord.y / uRes.y;
  col *= smoothstep(0.0, 0.30, sy);
  col *= 1.0 - 0.55 * smoothstep(0.72, 1.0, sy);
  col *= uIntensity;

  // Alpha tracks luminance, so the tunnel carries its own soft edge and the dark
  // gaps between filaments stay genuinely transparent rather than becoming grey.
  float lum = max(col.r, max(col.g, col.b));
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), clamp(lum, 0.0, 1.0) * 0.62);
}
`;

const PALETTE: Record<'forward' | 'back', [number[], number[]]> = {
  // Electric, cold, ionised — the future arriving.
  forward: [[0.05, 0.32, 0.85], [0.55, 0.95, 1.0]],
  // Warm, dusty, sedimentary — falling back through it.
  back: [[0.55, 0.14, 0.02], [1.0, 0.78, 0.35]],
};

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('[looking-glass] warp shader failed:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function Warp({ jump }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const jumpRef = useRef(jump);
  jumpRef.current = jump;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    // No WebGL is not an error worth surfacing — the era colour field underneath
    // is still there, and the CSS fallback still runs. But the canvas must not be
    // left in the tree: a canvas with no live drawing buffer does not composite as
    // "transparent", it composites as UNDEFINED, which in practice means opaque
    // white over the whole viewport.
    if (!gl || gl.isContextLost()) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    // Only now is there a pipeline that can actually paint. Everything downstream
    // — the canvas being visible at all, and the CSS fallback standing down — keys
    // off this flag rather than off the element merely existing.
    canvas.dataset.live = 'true';

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uDir = gl.getUniformLocation(prog, 'uDir');
    const uIntensity = gl.getUniformLocation(prog, 'uIntensity');
    const uColorA = gl.getUniformLocation(prog, 'uColorA');
    const uColorB = gl.getUniformLocation(prog, 'uColorB');

    /**
     * NO GL BLENDING. This draws one opaque-coverage full-screen triangle into a
     * fresh buffer every frame, so there is nothing to blend against — and
     * enabling it here was actively catastrophic. SRC_ALPHA/ONE_MINUS_SRC_ALPHA
     * over a cleared buffer stores rgb = col*a and alpha = a*a; the compositor
     * then un-premultiplies (because the context is declared non-premultiplied)
     * by dividing col*a / a*a = col/a, which diverges to white everywhere the
     * effect is FAINT. The corners — masked to zero in the shader — came out the
     * brightest thing on screen. Transparency here is the compositor's job, and
     * the fragment's alpha is already the correct instruction for it.
     */
    gl.disable(gl.BLEND);

    /**
     * Rendered at 55% and stretched by CSS. The effect is turbulence and glow —
     * there is no detail to lose — and it buys back roughly two-thirds of the
     * fill cost at the exact moment the GPU is also decoding a multi-megabyte
     * photograph. Paying full resolution for something deliberately blurry, to
     * make a *waiting* state prettier, would be the wrong trade.
     */
    const SCALE = 0.55;
    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth * SCALE));
      const h = Math.max(1, Math.floor(canvas.clientHeight * SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const started = performance.now();
    let frame = 0;
    const tick = (nowMs: number) => {
      frame = requestAnimationFrame(tick);
      const { direction, reach } = jumpRef.current;
      const [a, b] = PALETTE[direction];
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (nowMs - started) / 1000);
      gl.uniform1f(uDir, direction === 'forward' ? 1 : -1);
      gl.uniform1f(uIntensity, reach === 'far' ? 1.0 : 0.58);
      gl.uniform3f(uColorA, a[0]!, a[1]!, a[2]!);
      gl.uniform3f(uColorB, b[0]!, b[1]!, b[2]!);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      delete canvas.dataset.live;
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);

      /**
       * WebGL contexts are a finite per-page resource and this component mounts on
       * every single generation, so a real unmount should hand its context back
       * rather than wait for GC — otherwise the browser starts evicting the oldest
       * contexts and eventually takes the globe down with it.
       *
       * But ONLY on a real unmount. React StrictMode runs this cleanup and then
       * re-runs the effect against the SAME canvas element; losing the context
       * there leaves that canvas permanently dead, and a dead canvas composites as
       * an undefined buffer — an opaque white sheet over the entire app. That is
       * exactly what it did, through three rounds of "the shader is too bright"
       * tuning on a shader that had never executed a single frame.
       *
       * isConnected distinguishes the two: passive-effect cleanup runs after the
       * mutation phase, so on a genuine unmount the node is already detached,
       * while StrictMode's simulated unmount leaves it in the document.
       */
      if (!canvas.isConnected) {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    };
  }, []);

  return <canvas className="warp-gl" ref={canvasRef} aria-hidden="true" />;
}
