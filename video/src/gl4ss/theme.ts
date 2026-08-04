import { loadFont as loadDisplay } from "@remotion/google-fonts/ChakraPetch";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const display = loadDisplay();
const mono = loadMono();

/** Lifted from the portal's own CSS variables so the cut matches the app. */
export const theme = {
  bg: "#04050a",
  ink: "#f2f5f8",
  inkDim: "#c2cdd8",
  inkFaint: "#93a1ae",
  accent: "#ffd166",
  fontDisplay: display.fontFamily,
  fontMono: mono.fontFamily,
} as const;

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** The browser window, letterboxed inside the 16:9 frame. */
export const SCREEN = {
  width: 1728,
  height: 892,
  left: (WIDTH - 1728) / 2,
  top: 70,
} as const;

/**
 * Where each scene sits on the 30 s timeline, and the wall-clock elapsed time
 * (seconds since the lever was pulled) that its footage actually covers.
 * The clock readout is driven off `elapsed`, so the counter on screen is the
 * real runtime rather than a decoration.
 */
export const SCENES = {
  hook: { from: 0, durationInFrames: 69 },
  title: { from: 69, durationInFrames: 45 },
  map: { from: 114, durationInFrames: 112, speed: 4.2 },
  lever: { from: 226, durationInFrames: 42, speed: 1 },
  wormhole: {
    from: 268,
    durationInFrames: 60,
    speed: 10,
    elapsed: [1.7, 22.7],
  },
  year: { from: 328, durationInFrames: 90, speed: 2.1, elapsed: [35.7, 42.3] },
  strip: {
    from: 418,
    durationInFrames: 108,
    speed: 36,
    elapsed: [42.2, 174.2],
  },
  render: {
    from: 526,
    durationInFrames: 54,
    speed: 75,
    elapsed: [178.7, 314.7],
  },
  payoff: { from: 580, durationInFrames: 228 },
  end: { from: 808, durationInFrames: 120 },
} as const;

export const TOTAL_FRAMES = SCENES.end.from + SCENES.end.durationInFrames;

/** Total real time from pulling the lever to the finished film playing back. */
export const ELAPSED_TOTAL = 327;

/**
 * The instrument's actual reach, from src/lib/format.ts — MIN_YEAR is
 * -252,000,000 (the Great Dying) and MAX_YEAR is 3050. The run in this video
 * is one arbitrary sample inside that, not the edge of it, which is why the
 * end card labels its own numbers "this run".
 */
export const REACH = "252 million years ago → 3050 AD";

/** The four temporal stations the core sample actually landed on. */
export const STATIONS = [
  { label: "1700 AD", from: 0 },
  { label: "1810 AD", from: 30 },
  { label: "1915 AD", from: 105 },
  { label: "2015 AD", from: 150 },
] as const;

export const formatClock = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};
