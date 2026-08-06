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

/* ------------------------------------------------------------------ *
 * THE FOLLOW-UP CUT — Golden Gate, posted a few days after the launch.
 * ------------------------------------------------------------------ */

/**
 * That capture is 3028x1604 (1.888:1) against the launch cut's 1.937:1, so it
 * gets its own bezel rather than being stretched into the other one.
 */
export const SCREEN_GG = {
  width: 1650,
  height: 874,
  left: (WIDTH - 1650) / 2,
  top: 62,
} as const;

export const GG_SCENES = {
  hook: { from: 0, durationInFrames: 78 },
  title: { from: 78, durationInFrames: 57 },
  map: { from: 135, durationInFrames: 90, speed: 4.3 },
  lever: { from: 225, durationInFrames: 42, speed: 1 },
  wormhole: {
    from: 267,
    durationInFrames: 60,
    speed: 14.7,
    elapsed: [0.3, 29.7],
  },
  frame: { from: 327, durationInFrames: 54, speed: 3.3, elapsed: [34.2, 40.2] },
  payoff: { from: 381, durationInFrames: 207 },
  end: { from: 588, durationInFrames: 114 },
} as const;

export const GG_TOTAL_FRAMES = GG_SCENES.end.from + GG_SCENES.end.durationInFrames;

/**
 * Two stations, and the film crossfades between them for about a second and a
 * quarter in the middle. The chips are timed to the holds at either end rather
 * than to the midpoint, so neither year is ever labelling a dissolve.
 */
export const GG_STATIONS = [
  { label: "1913 AD", from: 4, durationInFrames: 52 },
  { label: "2013 AD", from: 68, durationInFrames: 139 },
] as const;

/** Lever pull to the finished film playing back, for the Golden Gate run. */
export const GG_ELAPSED_TOTAL = 265;

/* ------------------------------------------------------------------ *
 * POTSDAMER PLATZ — four Berlins on one camera.
 * ------------------------------------------------------------------ */

/** That capture is 3080x1600 (1.925:1), so it gets its own bezel again. */
export const SCREEN_BL = {
  width: 1660,
  height: 862,
  left: (WIDTH - 1660) / 2,
  top: 66,
} as const;

export const BL_SCENES = {
  hook: { from: 0, durationInFrames: 75 },
  title: { from: 75, durationInFrames: 57 },
  map: { from: 132, durationInFrames: 78, speed: 4.8 },
  lever: { from: 210, durationInFrames: 39, speed: 1 },
  wormhole: {
    from: 249,
    durationInFrames: 60,
    speed: 11.3,
    elapsed: [0.2, 22.7],
  },
  payoff: { from: 309, durationInFrames: 294 },
  end: { from: 603, durationInFrames: 114 },
} as const;

export const BL_TOTAL_FRAMES =
  BL_SCENES.end.from + BL_SCENES.end.durationInFrames;

/**
 * The three stations the payoff passes through. 1928 is not here because the
 * cold open already spent it — between them the two cuts cover the whole sweep
 * without showing any of it twice.
 *
 * Each chip is timed to a stretch where that era is actually settled, never to
 * a dissolve, so no year is ever labelling a frame that is half another year.
 */
export const BL_STATIONS = [
  { label: "1946 AD", from: 4, durationInFrames: 52 },
  { label: "1972 AD", from: 134, durationInFrames: 46 },
  { label: "2022 AD", from: 224, durationInFrames: 70 },
] as const;

/** Lever pull to the finished film running clean, for the Berlin run. */
export const BL_ELAPSED_TOTAL = 485;

export const formatClock = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};
