import React from "react";
import { Video } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Img,
  Interactive,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  ELAPSED_TOTAL,
  formatClock,
  REACH,
  SCENES,
  STATIONS,
  theme,
} from "./theme";
import {
  Backdrop,
  Caption,
  Clock,
  ScreenFrame,
  SpeedBadge,
  StationChip,
} from "./ui";

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** Black held over the cut points, so scene changes land rather than blink. */
const Dip: React.FC<{ fadeIn?: number; fadeOut?: number }> = ({
  fadeIn = 0,
  fadeOut = 0,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill
      name="Dip"
      style={{
        backgroundColor: "#000",
        pointerEvents: "none",
        opacity: Math.max(
          fadeIn
            ? interpolate(frame, [0, fadeIn], [1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE,
              })
            : 0,
          fadeOut
            ? interpolate(
                frame,
                [durationInFrames - fadeOut, durationInFrames],
                [0, 1],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: EASE,
                },
              )
            : 0,
        ),
      }}
    />
  );
};

/**
 * A step of the workflow: the recording in its bezel, the rate it is running
 * at, and the wall clock if this stretch of footage was compressed.
 */
const WorkflowScene: React.FC<{
  clip: string;
  speed: number;
  caption: string;
  sub?: string;
  elapsed?: readonly [number, number];
}> = ({ clip, speed, caption, sub, elapsed }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill name="WorkflowScene">
      <Backdrop />
      <ScreenFrame>
        <Video
          src={staticFile(clip)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </ScreenFrame>
      {elapsed ? (
        <Clock
          label="ELAPSED"
          value={formatClock(
            interpolate(frame, [0, durationInFrames], elapsed, {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          )}
        />
      ) : null}
      <SpeedBadge speed={speed} />
      <Caption text={caption} sub={sub} />
    </AbsoluteFill>
  );
};

/**
 * Cold open: the finished film, with no explanation attached to it yet.
 * Deliberately no fade from black — frame 0 is the poster frame on an
 * autoplaying timeline, and black reads as a video that failed to load.
 */
const Hook: React.FC = () => (
  <AbsoluteFill name="Hook">
    <Video
      src={staticFile("s0_hook.mp4")}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  </AbsoluteFill>
);

/** The claim, over the frame the cold open just left on screen. */
const Title: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Title">
      <Img
        src={staticFile("title_bg.png")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "blur(14px) saturate(0.6)",
          scale: 1.06,
        }}
      />
      <AbsoluteFill style={{ backgroundColor: "rgba(4,5,10,0.82)" }} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          gap: 22,
        }}
      >
        <Interactive.Div
          name="TitleLine"
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 96,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: theme.ink,
            opacity: interpolate(frame, [0, 9], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
            }),
            translate: interpolate(frame, [0, 16], ["0px 14px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
            }),
          }}
        >
          one pin. one year.
        </Interactive.Div>
        <Interactive.Div
          name="TitleSub"
          style={{
            fontFamily: theme.fontMono,
            fontSize: 28,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: theme.accent,
            opacity: interpolate(frame, [7, 18], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
            }),
          }}
        >
          nobody writes a prompt
        </Interactive.Div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * The pitch, over the film rather than on a card of its own. It lands while
 * the eras are still morphing — the one moment in thirty seconds where the
 * picture is doing the arguing — and it costs no extra runtime.
 */
const VisionLine: React.FC = () => {
  const frame = useCurrentFrame();

  const reveal = (delay: number) => ({
    opacity: interpolate(
      frame,
      [delay, delay + 14, 118, 132],
      [0, 1, 1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE },
    ),
    translate: interpolate(frame, [delay, delay + 20], ["0px 16px", "0px 0px"], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE,
    }),
  });

  return (
    <AbsoluteFill
      name="VisionLine"
      style={{ alignItems: "center", paddingTop: 84 }}
    >
      <Interactive.Div
        name="VisionA"
        style={{
          ...reveal(0),
          fontFamily: theme.fontDisplay,
          fontSize: 62,
          fontWeight: 700,
          letterSpacing: "-0.005em",
          color: "#fff",
          textShadow: "0 4px 34px rgba(0,0,0,0.9)",
        }}
      >
        time travel to any neighborhood on Earth
      </Interactive.Div>
      <Interactive.Div
        name="VisionB"
        style={{
          ...reveal(16),
          marginTop: 12,
          fontFamily: theme.fontDisplay,
          fontSize: 62,
          fontWeight: 700,
          letterSpacing: "-0.005em",
          color: theme.accent,
          textShadow: "0 4px 34px rgba(0,0,0,0.9)",
        }}
      >
        watch history pass before your eyes
      </Interactive.Div>
    </AbsoluteFill>
  );
};

/** The payoff: one uncut pass of the finished film, full bleed. */
const Payoff: React.FC = () => (
  <AbsoluteFill name="Payoff">
    <Video
      src={staticFile("s8_payoff.mp4")}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
    <AbsoluteFill
      style={{
        backgroundImage:
          // The top scrim carries the vision line, which lands over open sky on
          // the earliest stations — the lowest-contrast moment in the cut.
          "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 26%), linear-gradient(to bottom, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.28) 18%, rgba(0,0,0,0) 34%)",
      }}
    />
    <VisionLine />
    {STATIONS.map((station, i) => (
      <Sequence
        key={station.label}
        name={station.label}
        from={station.from}
        durationInFrames={
          (STATIONS[i + 1]?.from ?? SCENES.payoff.durationInFrames) - station.from
        }
        layout="none"
      >
        <StationChip label={station.label} />
      </Sequence>
    ))}
    <Dip fadeIn={5} fadeOut={10} />
  </AbsoluteFill>
);

/** What the 30 seconds cost in real time, said out loud before anyone asks. */
const EndCard: React.FC = () => {
  const frame = useCurrentFrame();

  const line = (delay: number) => ({
    opacity: interpolate(frame, [delay, delay + 12], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE,
    }),
    translate: interpolate(
      frame,
      [delay, delay + 16],
      ["0px 12px", "0px 0px"],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE },
    ),
  });

  return (
    <AbsoluteFill name="EndCard">
      <Backdrop />
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center", gap: 26 }}
      >
        <Interactive.Div
          name="Receipt"
          style={{
            ...line(0),
            fontFamily: theme.fontMono,
            fontSize: 25,
            letterSpacing: "0.1em",
            color: theme.inkFaint,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          this run — 4 frames · 1700 → 2015 AD · {formatClock(ELAPSED_TOTAL)} of
          real time, sped up
        </Interactive.Div>
        <Interactive.Div
          name="Reach"
          style={{
            ...line(12),
            marginTop: 14,
            fontFamily: theme.fontDisplay,
            fontSize: 52,
            fontWeight: 600,
            letterSpacing: "0.005em",
            color: theme.ink,
          }}
        >
          any spot on Earth · {REACH}
        </Interactive.Div>
        <Interactive.Div
          name="Repo"
          style={{
            ...line(30),
            marginTop: 22,
            fontFamily: theme.fontDisplay,
            fontSize: 66,
            fontWeight: 700,
            letterSpacing: "0.01em",
            color: theme.accent,
            textShadow: "0 0 60px rgba(255,209,102,0.35)",
          }}
        >
          github.com/TengHu/GL4SS
        </Interactive.Div>
        <Interactive.Div
          name="Upstream"
          style={{
            ...line(48),
            marginTop: 6,
            fontFamily: theme.fontMono,
            fontSize: 22,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: theme.inkFaint,
          }}
        >
          a fork of GL4SS by @elder_plinius
        </Interactive.Div>
      </AbsoluteFill>
      <Dip fadeIn={6} />
    </AbsoluteFill>
  );
};

export const LookingGlass: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Sequence name="Hook" from={SCENES.hook.from}
      durationInFrames={SCENES.hook.durationInFrames}>
      <Hook />
    </Sequence>

    <Sequence name="Title" from={SCENES.title.from}
      durationInFrames={SCENES.title.durationInFrames}>
      <Title />
    </Sequence>

    <Sequence name="Map" from={SCENES.map.from}
      durationInFrames={SCENES.map.durationInFrames}>
      <WorkflowScene
        clip="s2_map.mp4"
        speed={SCENES.map.speed}
        caption="drop a pin anywhere on Earth"
      />
    </Sequence>

    <Sequence name="Lever" from={SCENES.lever.from}
      durationInFrames={SCENES.lever.durationInFrames}>
      <WorkflowScene
        clip="s3_lever.mp4"
        speed={SCENES.lever.speed}
        caption="pull the lever"
      />
    </Sequence>

    <Sequence name="Wormhole" from={SCENES.wormhole.from}
      durationInFrames={SCENES.wormhole.durationInFrames}>
      <WorkflowScene
        clip="s4_wormhole.mp4"
        speed={SCENES.wormhole.speed}
        caption="it develops the frame"
        elapsed={SCENES.wormhole.elapsed}
      />
    </Sequence>

    <Sequence name="Year" from={SCENES.year.from}
      durationInFrames={SCENES.year.durationInFrames}>
      <WorkflowScene
        clip="s5_year.mp4"
        speed={SCENES.year.speed}
        caption="then ask it for any stretch of time"
        sub="render 3 frames"
        elapsed={SCENES.year.elapsed}
      />
    </Sequence>

    <Sequence name="Strip" from={SCENES.strip.from}
      durationInFrames={SCENES.strip.durationInFrames}>
      <WorkflowScene
        clip="s6_strip.mp4"
        speed={SCENES.strip.speed}
        caption="four frames land, one by one"
        sub="1700 · 1810 · 1915 · 2015"
        elapsed={SCENES.strip.elapsed}
      />
    </Sequence>

    <Sequence name="Render" from={SCENES.render.from}
      durationInFrames={SCENES.render.durationInFrames}>
      <WorkflowScene
        clip="s7_render.mp4"
        speed={SCENES.render.speed}
        caption="then it renders the years between"
        elapsed={SCENES.render.elapsed}
      />
    </Sequence>

    <Sequence name="Payoff" from={SCENES.payoff.from}
      durationInFrames={SCENES.payoff.durationInFrames}>
      <Payoff />
    </Sequence>

    <Sequence name="EndCard" from={SCENES.end.from}
      durationInFrames={SCENES.end.durationInFrames}>
      <EndCard />
    </Sequence>
  </AbsoluteFill>
);
