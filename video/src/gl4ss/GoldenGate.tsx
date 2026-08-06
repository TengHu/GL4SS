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
  formatClock,
  GG_ELAPSED_TOTAL,
  GG_SCENES,
  GG_STATIONS,
  SCREEN_GG,
  theme,
} from "./theme";
import {
  Backdrop,
  Caption,
  Clock,
  ScreenContext,
  ScreenFrame,
  SpeedBadge,
  StationChip,
} from "./ui";

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** Black held over a cut, so a scene change lands rather than blinks. */
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

/** A step of the workflow: the recording, the rate, and the wall clock. */
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
 * Cold open: the film run backwards, so the bridge dissolves out of the one
 * view of San Francisco everybody already holds in their head. Frame 0 is the
 * finished bridge — the poster frame on a muted timeline has to be the thing
 * people recognise, not the thing they have to work out.
 */
const Hook: React.FC = () => (
  <AbsoluteFill name="Hook">
    <Video
      src={staticFile("g0_hook.mp4")}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  </AbsoluteFill>
);

/** The claim, over the strait the bridge just left. */
const Title: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Title">
      <Img
        src={staticFile("gg_title_bg.png")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "blur(13px) saturate(0.5)",
          scale: 1.06,
        }}
      />
      <AbsoluteFill style={{ backgroundColor: "rgba(4,5,10,0.80)" }} />
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center", gap: 20 }}
      >
        <Interactive.Div
          name="TitleLine"
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 92,
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
          same instrument. new pin.
        </Interactive.Div>
        <Interactive.Div
          name="TitleSub"
          style={{
            fontFamily: theme.fontMono,
            fontSize: 27,
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
          the bridge isn&rsquo;t there yet
        </Interactive.Div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** The payoff: the film forwards and uncut — the bridge arrives. */
const Payoff: React.FC = () => (
  <AbsoluteFill name="Payoff">
    <Video
      src={staticFile("g8_payoff.mp4")}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
    <AbsoluteFill
      style={{
        backgroundImage:
          "linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 24%)",
      }}
    />
    {GG_STATIONS.map((station) => (
      <Sequence
        key={station.label}
        name={station.label}
        from={station.from}
        durationInFrames={station.durationInFrames}
        layout="none"
      >
        <StationChip label={station.label} />
      </Sequence>
    ))}
    <Dip fadeIn={5} fadeOut={10} />
  </AbsoluteFill>
);

/** What this run cost, and where to find it. */
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
        style={{ justifyContent: "center", alignItems: "center", gap: 0 }}
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
          this run — 2 frames · 1913 → 2013 AD ·{" "}
          {formatClock(GG_ELAPSED_TOTAL)} of real time, sped up
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
          any spot on Earth · back to 252 million years ago
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

export const GoldenGate: React.FC = () => (
  <ScreenContext.Provider value={SCREEN_GG}>
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Sequence
        name="Hook"
        from={GG_SCENES.hook.from}
        durationInFrames={GG_SCENES.hook.durationInFrames}
      >
        <Hook />
      </Sequence>

      <Sequence
        name="Title"
        from={GG_SCENES.title.from}
        durationInFrames={GG_SCENES.title.durationInFrames}
      >
        <Title />
      </Sequence>

      <Sequence
        name="Map"
        from={GG_SCENES.map.from}
        durationInFrames={GG_SCENES.map.durationInFrames}
      >
        <WorkflowScene
          clip="g2_map.mp4"
          speed={GG_SCENES.map.speed}
          caption="a pin on the Golden Gate"
          sub="seeded from street view"
        />
      </Sequence>

      <Sequence
        name="Lever"
        from={GG_SCENES.lever.from}
        durationInFrames={GG_SCENES.lever.durationInFrames}
      >
        <WorkflowScene
          clip="g3_lever.mp4"
          speed={GG_SCENES.lever.speed}
          caption="pull the lever"
        />
      </Sequence>

      <Sequence
        name="Wormhole"
        from={GG_SCENES.wormhole.from}
        durationInFrames={GG_SCENES.wormhole.durationInFrames}
      >
        <WorkflowScene
          clip="g4_wormhole.mp4"
          speed={GG_SCENES.wormhole.speed}
          caption="it develops the frame"
          elapsed={GG_SCENES.wormhole.elapsed}
        />
      </Sequence>

      <Sequence
        name="Frame"
        from={GG_SCENES.frame.from}
        durationInFrames={GG_SCENES.frame.durationInFrames}
      >
        <WorkflowScene
          clip="g5_frame.mp4"
          speed={GG_SCENES.frame.speed}
          caption="the seed frame lands"
          sub="2013 · drawn from the photograph"
          elapsed={GG_SCENES.frame.elapsed}
        />
      </Sequence>

      <Sequence
        name="Payoff"
        from={GG_SCENES.payoff.from}
        durationInFrames={GG_SCENES.payoff.durationInFrames}
      >
        <Payoff />
      </Sequence>

      <Sequence
        name="EndCard"
        from={GG_SCENES.end.from}
        durationInFrames={GG_SCENES.end.durationInFrames}
      >
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  </ScreenContext.Provider>
);
