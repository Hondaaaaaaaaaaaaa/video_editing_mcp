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
  THE_CINE_DEFAULTS,
  TheCineStyleProvider,
} from "./CaptionedVideo/styles/PageTheCine";
import {
  PageTypewriter,
  typewriterSchema,
  TypewriterStyleProvider,
} from "./CaptionedVideo/styles/PageTypewriter";
import {
  PageHighlight,
  highlightSchema,
  HighlightStyleProvider,
} from "./CaptionedVideo/styles/PageHighlight";

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
  ...style
}) => (
  <TheCineStyleProvider value={style}>
    <CaptionedVideo src={src} PageComponent={PageTheCine} />
  </TheCineStyleProvider>
);

// Typewriter feeds all its typing/cursor/color props to the style via context.
const TypewriterCaptionedVideo: React.FC<z.infer<typeof typewriterSchema>> = ({
  src,
  ...style
}) => (
  <TypewriterStyleProvider value={style}>
    <CaptionedVideo src={src} PageComponent={PageTypewriter} />
  </TypewriterStyleProvider>
);

// Highlight feeds its mode + colors + box padding to the style via context.
const HighlightCaptionedVideo: React.FC<z.infer<typeof highlightSchema>> = ({
  src,
  highlightMode,
  baseTextColor,
  highlightTextColor,
  boxColor,
  boxPaddingPx,
}) => (
  <HighlightStyleProvider
    value={{ highlightMode, baseTextColor, highlightTextColor, boxColor, boxPaddingPx }}
  >
    <CaptionedVideo src={src} PageComponent={PageHighlight} />
  </HighlightStyleProvider>
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
          ...THE_CINE_DEFAULTS,
          src: SAMPLE_VIDEO,
          glowStrength: 39,
          glowColor: "#ff8a00",
          gradientTop: "#ffd400",
          gradientMid: "#ff8a00",
          gradientBottom: "#ff3d00",
        }}
      />

      {/* "Typewriter" caption style — letter-by-letter typing (customizable) */}
      <Composition
        id="Typewriter"
        component={TypewriterCaptionedVideo}
        schema={typewriterSchema}
        calculateMetadata={calculateCaptionedVideoMetadata}
        fps={30}
        durationInFrames={600}
        width={1080}
        height={1920}
        defaultProps={{
          src: SAMPLE_VIDEO,
          typingSpeed: 60,
          initialDelay: 0,
          showCursor: true,
          cursorCharacter: "_",
          cursorBlinkDuration: 530,
          hideCursorWhileTyping: false,
          variableSpeed: false,
          variableSpeedMin: 40,
          variableSpeedMax: 120,
          textColors: ["#ffffff", "#ffd400", "#ff8a00"],
          easing: "linear" as const,
          easingSpeed: 1,
        }}
      />

      {/* "Highlight" caption style — word-by-word text/box highlight (customizable) */}
      <Composition
        id="Highlight"
        component={HighlightCaptionedVideo}
        schema={highlightSchema}
        calculateMetadata={calculateCaptionedVideoMetadata}
        fps={30}
        durationInFrames={600}
        width={1080}
        height={1920}
        defaultProps={{
          src: staticFile("sample-video.mp4"),
          highlightMode: "text" as const,
          baseTextColor: "white",
          highlightTextColor: "#39E508",
          boxColor: "#39e508",
          boxPaddingPx: 22,
        }}
      />
    </>
  );
};
