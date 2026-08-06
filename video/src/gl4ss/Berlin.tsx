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
  BL_ELAPSED_TOTAL,
  BL_SCENES,
  BL_STATIONS,
  SCREEN_BL,
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
 * Cold open: 1928 collapsing into rubble. Frame 0 is the crowded square —
 * trams, a horse cart, an advertising column — which is arresting on a muted
 * timeline in a way that an empty lot is not, and it earns the rubble that
 * follows two seconds later.
 *
 * Unlike the Golden Gate cut this runs forwards, because it is not the same
 * footage as the payoff: the open spends 1928, the payoff picks up at the
 * rubble. Between them they cover the sweep without repeating a frame.
 */
const Hook: React.FC = () => (
  <AbsoluteFill name="Hook">
    <Video
      src={staticFile("b0_hook.mp4")}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  </AbsoluteFill>
);

/** The claim, over the square that just came down. */
const Title: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Title">
      <Img
        src={staticFile("bl_title_bg.png")}
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
          one corner. four Berlins.
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
          one building stands in all four
        </Interactive.Div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** The payoff: rubble, then the death strip, then the glass. One camera. */
const Payoff: React.FC = () => (
  <AbsoluteFill name="Payoff">
    <Video
      src={staticFile("b8_payoff.mp4")}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
    <AbsoluteFill
      style={{
        backgroundImage:
          "linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 24%)",
      }}
    />
    {BL_STATIONS.map((station) => (
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
          this run — 4 frames · 1928 → 2022 AD ·{" "}
          {formatClock(BL_ELAPSED_TOTAL)} of real time, sped up
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

export const Berlin: React.FC = () => (
  <ScreenContext.Provider value={SCREEN_BL}>
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Sequence
        name="Hook"
        from={BL_SCENES.hook.from}
        durationInFrames={BL_SCENES.hook.durationInFrames}
      >
        <Hook />
      </Sequence>

      <Sequence
        name="Title"
        from={BL_SCENES.title.from}
        durationInFrames={BL_SCENES.title.durationInFrames}
      >
        <Title />
      </Sequence>

      <Sequence
        name="Map"
        from={BL_SCENES.map.from}
        durationInFrames={BL_SCENES.map.durationInFrames}
      >
        <WorkflowScene
          clip="b2_map.mp4"
          speed={BL_SCENES.map.speed}
          caption="a pin on Potsdamer Platz"
          sub="seeded from street view"
        />
      </Sequence>

      <Sequence
        name="Lever"
        from={BL_SCENES.lever.from}
        durationInFrames={BL_SCENES.lever.durationInFrames}
      >
        <WorkflowScene
          clip="b3_lever.mp4"
          speed={BL_SCENES.lever.speed}
          caption="pull the lever"
        />
      </Sequence>

      <Sequence
        name="Wormhole"
        from={BL_SCENES.wormhole.from}
        durationInFrames={BL_SCENES.wormhole.durationInFrames}
      >
        <WorkflowScene
          clip="b4_wormhole.mp4"
          speed={BL_SCENES.wormhole.speed}
          caption="it develops the frame"
          elapsed={BL_SCENES.wormhole.elapsed}
        />
      </Sequence>


      <Sequence
        name="Payoff"
        from={BL_SCENES.payoff.from}
        durationInFrames={BL_SCENES.payoff.durationInFrames}
      >
        <Payoff />
      </Sequence>

      <Sequence
        name="EndCard"
        from={BL_SCENES.end.from}
        durationInFrames={BL_SCENES.end.durationInFrames}
      >
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  </ScreenContext.Provider>
);
