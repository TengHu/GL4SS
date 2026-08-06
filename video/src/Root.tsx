import { Composition } from "remotion";
import "./index.css";
import { Berlin } from "./gl4ss/Berlin";
import { GoldenGate } from "./gl4ss/GoldenGate";
import { LookingGlass } from "./gl4ss/LookingGlass";
import {
  BL_TOTAL_FRAMES,
  FPS,
  GG_TOTAL_FRAMES,
  HEIGHT,
  TOTAL_FRAMES,
  WIDTH,
} from "./gl4ss/theme";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="LookingGlass"
        component={LookingGlass}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="Berlin"
        component={Berlin}
        durationInFrames={BL_TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="GoldenGate"
        component={GoldenGate}
        durationInFrames={GG_TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
