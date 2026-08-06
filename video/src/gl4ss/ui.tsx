import React from "react";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { SCREEN, theme } from "./theme";

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * Where the recording sits on the 1920x1080 canvas.
 *
 * A context rather than a constant because each screen capture has its own
 * aspect: the launch cut's window is 1.937:1 and the Golden Gate one is 1.888:1,
 * and forcing both into one bezel would stretch one of them. Everything that
 * hangs off the screen — the caption under it, the badge and clock above it —
 * reads its geometry from here, so a composition sets the shape once.
 */
export const ScreenContext = React.createContext<{
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
}>(SCREEN);

const useScreen = () => React.useContext(ScreenContext);

/** Fades a scene-local overlay in at the head and out at the tail. */
const useHold = (inFrames = 7, outFrames = 7) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return interpolate(
    frame,
    [0, inFrames, durationInFrames - outFrames, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE },
  );
};

/** Near-black backdrop with the portal's amber glow bleeding up from behind. */
export const Backdrop: React.FC = () => (
  <AbsoluteFill
    name="Backdrop"
    style={{
      backgroundColor: theme.bg,
      backgroundImage:
        "radial-gradient(120% 80% at 50% 8%, rgba(255,209,102,0.10) 0%, rgba(255,209,102,0.03) 38%, rgba(4,5,10,0) 70%)",
    }}
  />
);

/** The browser recording, seated in a bezel so it reads as a screen. */
export const ScreenFrame: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const screen = useScreen();

  return (
  <AbsoluteFill
    name="ScreenFrame"
    style={{
      left: screen.left,
      top: screen.top,
      width: screen.width,
      height: screen.height,
      borderRadius: 14,
      overflow: "hidden",
      border: "1px solid rgba(255,209,102,0.16)",
      boxShadow:
        "0 40px 90px -30px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.03), 0 0 120px -40px rgba(255,209,102,0.25)",
    }}
  >
    {children}
  </AbsoluteFill>
  );
};

/** One line of on-screen narration, sitting under the screen. */
export const Caption: React.FC<{ text: string; sub?: string }> = ({
  text,
  sub,
}) => {
  const frame = useCurrentFrame();
  const opacity = useHold();
  const screen = useScreen();

  return (
    <Interactive.Div
      name="Caption"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: screen.top + screen.height + 14,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        opacity,
        translate: interpolate(frame, [0, 14], ["0px 10px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE,
        }),
      }}
    >
      <div
        style={{
          fontFamily: theme.fontDisplay,
          fontSize: 44,
          fontWeight: 600,
          letterSpacing: "0.01em",
          color: theme.ink,
          lineHeight: 1,
        }}
      >
        {text}
      </div>
      {sub ? (
        <div
          style={{
            fontFamily: theme.fontMono,
            fontSize: 20,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: theme.inkFaint,
          }}
        >
          {sub}
        </div>
      ) : null}
    </Interactive.Div>
  );
};

/**
 * The rate the footage is running at. Shown on every scene so a compressed
 * wait reads as compressed rather than as something quietly removed.
 */
export const SpeedBadge: React.FC<{ speed: number }> = ({ speed }) => {
  const opacity = useHold();
  const screen = useScreen();
  const realTime = speed === 1;
  const label = realTime
    ? "REAL TIME"
    : `×${speed >= 10 ? Math.round(speed) : speed.toFixed(1)}`;

  return (
    <Interactive.Div
      name="SpeedBadge"
      style={{
        position: "absolute",
        right: screen.left,
        top: 18,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 14px",
        borderRadius: 999,
        border: `1px solid ${realTime ? "rgba(146,255,214,0.35)" : "rgba(255,209,102,0.4)"}`,
        backgroundColor: realTime
          ? "rgba(98,230,201,0.10)"
          : "rgba(255,209,102,0.10)",
        fontFamily: theme.fontMono,
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: realTime ? "0.16em" : "0.02em",
        color: realTime ? "#62e6c9" : theme.accent,
        opacity,
      }}
    >
      {label}
    </Interactive.Div>
  );
};

/** Wall-clock time since the lever was pulled, ticking through the cuts. */
export const Clock: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => {
  const opacity = useHold();
  const screen = useScreen();

  return (
    <Interactive.Div
      name="Clock"
      style={{
        position: "absolute",
        left: screen.left,
        top: 18,
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        fontFamily: theme.fontMono,
        opacity,
      }}
    >
      <span
        style={{
          fontSize: 17,
          letterSpacing: "0.24em",
          color: theme.inkFaint,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: theme.inkDim,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </Interactive.Div>
  );
};

/** The year the film is passing through, over the full-bleed payoff. */
export const StationChip: React.FC<{ label: string }> = ({ label }) => {
  const frame = useCurrentFrame();

  return (
    <Interactive.Div
      name="StationChip"
      style={{
        position: "absolute",
        left: 76,
        bottom: 66,
        display: "flex",
        alignItems: "center",
        gap: 16,
        opacity: interpolate(frame, [0, 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE,
        }),
        translate: interpolate(frame, [0, 12], ["-14px 0px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE,
        }),
      }}
    >
      <div
        style={{
          width: 4,
          height: 46,
          borderRadius: 2,
          backgroundColor: theme.accent,
          boxShadow: `0 0 22px ${theme.accent}`,
        }}
      />
      <div
        style={{
          fontFamily: theme.fontMono,
          fontSize: 52,
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: "#fff",
          textShadow: "0 3px 26px rgba(0,0,0,0.85)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {label}
      </div>
    </Interactive.Div>
  );
};
