import "./index.css";
import { Composition, staticFile } from "remotion";
import { HelloWorld, myCompSchema } from "./HelloWorld";
import { Logo, myCompSchema2 } from "./HelloWorld/Logo";
import {
  CaptionedVideo,
  calculateCaptionedVideoMetadata,
} from "./CaptionedVideo";
import { z } from "zod";
import {
  PageClassic,
  classicSchema,
  CLASSIC_DEFAULTS,
  ClassicStyleProvider,
} from "./CaptionedVideo/styles/PageClassic";
import {
  PageShiny,
  shinySchema,
  ShinyStyleProvider,
} from "./CaptionedVideo/styles/PageShiny";
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
const ClassicCaptionedVideo: React.FC<z.infer<typeof classicSchema>> = ({
  src,
  ...style
}) => (
  <ClassicStyleProvider value={style}>
    <CaptionedVideo src={src} PageComponent={PageClassic} />
  </ClassicStyleProvider>
);

// Shiny takes extra schema props (glow + gradient) and feeds them to the
// style via context — the shared engine stays untouched.
const ShinyCaptionedVideo: React.FC<z.infer<typeof shinySchema>> = ({
  src,
  ...style
}) => (
  <ShinyStyleProvider value={style}>
    <CaptionedVideo
      src={src}
      PageComponent={PageShiny}
      // Kinetic mode does its OWN count-based grouping from the flat caption
      // stream, so it renders as a single full-timeline surface. Single mode
      // keeps the default per-page (time-based) rendering.
      singleSurface={style.layoutMode === "kinetic"}
    />
  </ShinyStyleProvider>
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
  ...style
}) => (
  <HighlightStyleProvider value={style}>
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
        schema={classicSchema}
        calculateMetadata={calculateCaptionedVideoMetadata}
        fps={30}
        durationInFrames={600}
        width={1080}
        height={1920}
        defaultProps={{ src: SAMPLE_VIDEO, ...CLASSIC_DEFAULTS }}
      />

      {/* "Shiny" caption style — cinematic gradient + glow (customizable) */}
      <Composition
        id="Shiny"
        component={ShinyCaptionedVideo}
        schema={shinySchema}
        calculateMetadata={calculateCaptionedVideoMetadata}
        fps={30}
        durationInFrames={600}
        width={1080}
        height={1920}
        defaultProps={{
          src: staticFile("sample-video.mp4"),
          layoutMode: "kinetic" as const,
          kinetic: {
            wordsPerLine: 2,
            linesPerSegment: 2,
            lineSpacing: 1.3,
            positionY: 69,
            emphasisAlignment: "center" as const,
            normalAlignment: "alternate" as const,
          },
          text: {
            fontFamily: "Inter" as const,
            emphasisFontFamily: "Anton" as const,
            emphasisScale: 1.4,
            emphasisColorEnabled: false,
            emphasisColor: "#ffffff",
          },
          animation: {
            entranceDirection: "up" as const,
            entranceDistance: 30,
            entranceDuration: 30,
            entranceEasing: "smooth" as const,
            entranceEasingSpeed: 6,
            emphasisEntranceDirection: "left" as const,
            emphasisEntranceDistance: 120,
            emphasisEntranceEasing: "smooth" as const,
            emphasisEntranceEasingSpeed: 3,
          },
          gradient: {
            angle: 295,
            topColor: "#ff8800",
            topPosition: 0,
            midEnabled: false,
            midColor: "#000000",
            midPosition: 50,
            bottomColor: "#ff8800",
            bottomPosition: 100,
          },
          glow: { strength: 0, color: "#ff8800" },
          deepGlow: {
            enabled: true,
            radius: 23,
            brightness: 36,
            innerColor: "#ff8a00",
            outerColor: "#ff8a00",
            chromatic: 0,
          },
          sweep1: {
            enabled: false,
            color: "#ffffff",
            angle: 150,
            width: 6,
            intensity: 17,
            positionX: 61,
            positionY: 41,
          },
          sweep2: {
            enabled: true,
            color: "#e8ff00",
            angle: 160,
            width: 1,
            intensity: 50,
            positionX: 32,
            positionY: 50,
          },
          sweep3: {
            enabled: true,
            color: "#ffffff",
            angle: 163,
            width: 1,
            intensity: 40,
            positionX: 58,
            positionY: 57,
          },
          shadow: { enabled: false, color: "rgba(0, 0, 0, 0.6)", blur: 0 },
          stroke: { enabled: true, color: "#000000", width: 0 },
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
          src: staticFile("sample-video.mp4"),
          typingSpeed: 60,
          initialDelay: 0,
          showCursor: true,
          cursorCharacter: "_",
          cursorBlinkDuration: 530,
          hideCursorWhileTyping: false,
          variableSpeed: false,
          variableSpeedMin: 40,
          variableSpeedMax: 120,
          baseTextColor: "#ffffff",
          textColors: [],
          easing: "linear" as const,
          easingSpeed: 6,
          fontFamily: "Montserrat" as const,
          shadowEnabled: true,
          shadowColor: "rgba(0, 0, 0, 0.6)",
          shadowBlur: 13,
          strokeEnabled: true,
          strokeColor: "#000000",
          strokeWidth: 0,
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
          fontFamily: "Inter" as const,
          shadowEnabled: true,
          shadowColor: "rgba(0, 0, 0, 0.6)",
          shadowBlur: 8,
          strokeEnabled: true,
          strokeColor: "#000000",
          strokeWidth: 2,
        }}
      />
    </>
  );
};
