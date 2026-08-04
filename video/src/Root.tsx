import { Composition } from "remotion";
import "./index.css";
import { LookingGlass } from "./gl4ss/LookingGlass";
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from "./gl4ss/theme";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LookingGlass"
      component={LookingGlass}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
