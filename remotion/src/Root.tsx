import "./index.css";
import { Composition, staticFile } from "remotion";
import { HelloWorld, myCompSchema } from "./HelloWorld";
import { Logo, myCompSchema2 } from "./HelloWorld/Logo";
import {
  CaptionedVideo,
  captionedVideoSchema,
  calculateCaptionedVideoMetadata,
} from "./CaptionedVideo";
import { z } from "zod";
import { PageClassic } from "./CaptionedVideo/styles/PageClassic";
import {
  PageTheCine,
  theCineSchema,
  TheCineStyleProvider,
} from "./CaptionedVideo/styles/PageTheCine";

// The video that captions are rendered over. Drop a vertical clip at
// remotion/public/sample-video.mp4 (and run `node sub.mjs` to caption it).
const SAMPLE_VIDEO = staticFile("sample-video.mp4");

// Thin wrappers bind a caption *style* to the shared CaptionedVideo
// composition. Same video + captions, different look per composition.
const ClassicCaptionedVideo: React.FC<{ src: string }> = (props) => (
  <CaptionedVideo {...props} PageComponent={PageClassic} />
);

// TheCine takes extra schema props (glow + gradient) and feeds them to the
// style via context — the shared engine stays untouched.
const TheCineCaptionedVideo: React.FC<z.infer<typeof theCineSchema>> = ({
  src,
  glowStrength,
  glowColor,
  gradientTop,
  gradientMid,
  gradientBottom,
}) => (
  <TheCineStyleProvider
    value={{ glowStrength, glowColor, gradientTop, gradientMid, gradientBottom }}
  >
    <CaptionedVideo src={src} PageComponent={PageTheCine} />
  </TheCineStyleProvider>
);

// Each <Composition> is an entry in the sidebar!

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        // You can take the "id" to render a video:
        // npx remotion render HelloWorld
        id="HelloWorld"
        component={HelloWorld}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        // You can override these props for each render:
        // https://www.remotion.dev/docs/parametrized-rendering
        schema={myCompSchema}
        defaultProps={{
          titleText: "Welcome to Remotion",
          titleColor: "#000000",
          logoColor1: "#91EAE4",
          logoColor2: "#86A8E7",
        }}
      />

      {/* Mount any React component to make it show up in the sidebar and work on it individually! */}
      <Composition
        id="OnlyLogo"
        component={Logo}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        schema={myCompSchema2}
        defaultProps={{
          logoColor1: "#91dAE2" as const,
          logoColor2: "#86A8E7" as const,
        }}
      />

      {/* --- Captioned video, vertical (1080x1920) --- */}
      {/* Classic caption style */}
      <Composition
        id="Classic"
        component={ClassicCaptionedVideo}
        schema={captionedVideoSchema}
        calculateMetadata={calculateCaptionedVideoMetadata}
        fps={30}
        durationInFrames={600}
        width={1080}
        height={1920}
        defaultProps={{ src: SAMPLE_VIDEO }}
      />

      {/* "TheCine" caption style — cinematic gradient + glow (customizable) */}
      <Composition
        id="TheCine"
        component={TheCineCaptionedVideo}
        schema={theCineSchema}
        calculateMetadata={calculateCaptionedVideoMetadata}
        fps={30}
        durationInFrames={600}
        width={1080}
        height={1920}
        defaultProps={{
          src: staticFile("sample-video.mp4"),
          glowStrength: 39,
          glowColor: "#ff8a00",
          gradientTop: "#ffd400",
          gradientMid: "#ff8a00",
          gradientBottom: "#ff3d00",
        }}
      />
    </>
  );
};
