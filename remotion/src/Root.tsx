import "./index.css";
import { Composition } from "remotion";
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
import {
  PageHormozi,
  hormoziSchema,
  HormoziStyleProvider,
} from "./CaptionedVideo/styles/PageHormozi";

// The video that captions are rendered over (a vertical clip at
// remotion/public/sample-video.mp4). Stored as a PLAIN FILENAME — not
// staticFile("…") — so every composition's defaultProps stay a fully static
// object literal that Remotion Studio can SAVE (a function call would block
// "save default props"). CaptionedVideo resolves the filename via staticFile().
const SAMPLE_VIDEO = "sample-video.mp4";

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
      // Shiny is kinetic-only: it does its OWN count-based grouping from the
      // flat caption stream, so it always renders as a single full-timeline
      // surface (not the default per-page time-based rendering).
      singleSurface
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

// Highlight uses Shiny's kinetic LAYOUT, so (like Shiny) it does its own
// count-based grouping from the flat caption stream and renders as a single
// full-timeline surface. Its layout/color/gradient/glow/pop/wiggle props feed
// the style via context.
const HighlightCaptionedVideo: React.FC<z.infer<typeof highlightSchema>> = ({
  src,
  ...style
}) => (
  <HighlightStyleProvider value={style}>
    <CaptionedVideo src={src} PageComponent={PageHighlight} singleSurface />
  </HighlightStyleProvider>
);

// Hormozi is kinetic-only like Shiny: it does its OWN count-based grouping into
// two-line blocks and alternates which line wears the accent color, so it renders
// as a single full-timeline surface.
const HormoziCaptionedVideo: React.FC<z.infer<typeof hormoziSchema>> = ({
  src,
  ...style
}) => (
  <HormoziStyleProvider value={style}>
    <CaptionedVideo src={src} PageComponent={PageHormozi} singleSurface />
  </HormoziStyleProvider>
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
          src: "sample-video.mp4",
          // === LAYOUT ===
          layout: {
            wordsPerLine: 2,
            linesPerSegment: 3,
            captionScale: 1,
            wordSpacing: 0.12,
            lineSpacing: 1.1,
            positionX: 50,
            positionY: 84,
            emphasisAlignment: "center" as const,
            normalAlignment: "alternate" as const,
          },
          // === TEXT (normal words) ===
          text: {
            fontFamily: "Inter" as const,
            baseColor: "#ffffff",
          },
          // === EMPHASIS (big/shiny words) ===
          emphasis: {
            scale: 1.4,
            fontFamily: "Anton" as const,
            offsetX: 0,
            offsetY: 0,
            colorEnabled: false,
            color: "#ffffff",
            entrance: {
              direction: "left" as const,
              distance: 29,
              easing: "smooth" as const,
              easingSpeed: 3,
            },
          },
          // === EFFECTS ===
          effects: {
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
            stroke: { enabled: true, color: "#000000", width: 0 },
            shadow: { enabled: false, color: "rgba(0, 0, 0, 0.6)", blur: 0 },
          },
          // === ANIMATION (normal-word entrance + easing) ===
          animation: {
            entrance: {
              direction: "up" as const,
              distance: 63,
              duration: 13,
            },
            easing: {
              type: "smooth" as const,
              speed: 1,
            },
          },
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
          src: "sample-video.mp4",
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
          positionX: 50,
          positionY: 78,
          captionScale: 1,
          wordSpacing: 0.12,
          lineSpacing: 1.2,
        }}
      />

      {/* "Highlight" caption style — Shiny's kinetic LAYOUT (wordsPerLine /
          linesPerSegment / even spacing / auto-fit font) with a word-by-word
          color/gradient highlight + glow, PLUS independent POP (active-word
          spring) and WIGGLE (block sway) toggles. */}
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
          src: "sample-video.mp4",
          layout: {
            wordsPerLine: 3,
            linesPerSegment: 1,
            fontSize: 120,
            captionScale: 1,
            wordSpacing: 0.28,
            lineSpacing: 1.25,
            positionX: 50,
            positionY: 79,
            alignment: "center" as const,
          },
          text: {
            fontFamily: "Inter" as const,
            baseTextColor: "#FFFFFF",
            highlightColor: "#56ff00",
          },
          gradient: {
            enabled: false,
            angle: 180,
            topColor: "#ffe14d",
            topPosition: 0,
            midEnabled: false,
            midColor: "#ff8a00",
            midPosition: 50,
            bottomColor: "#ff3d00",
            bottomPosition: 100,
          },
          glow: { enabled: true, color: "rgba(0, 255, 43, 0.38)", size: 30 },
          pop: { enabled: true, speed: 130, intensity: 1.2 },
          wiggle: { enabled: false, strength: 14, speed: 0.2 },
          shadow: { enabled: true, color: "rgba(0, 0, 0, 0.6)", blur: 8 },
          stroke: { enabled: true, color: "#000000", width: 1 },
        }}
      />

      {/* "Hormozi" caption style — the viral Alex Hormozi look: two stacked
          phrases where ONE line is white and the other is an accent color
          (yellow), and the accent line ALTERNATES top->bottom block by block
          (color "changes from sentence to sentence"). All Shiny effects
          (gradient/glow/deepGlow/sweep/stroke/shadow) are opt-in. */}
      <Composition
        id="Hormozi"
        component={HormoziCaptionedVideo}
        schema={hormoziSchema}
        calculateMetadata={calculateCaptionedVideoMetadata}
        fps={30}
        durationInFrames={600}
        width={1080}
        height={1920}
        defaultProps={{
          src: "sample-video.mp4",
          layout: {
            wordsPerLine: 3,
            captionScale: 1,
            wordSpacing: 0.12,
            lineSpacing: 1.15,
            positionX: 50,
            positionY: 78,
            alignment: "center" as const,
          },
          text: {
            fontFamily: "Anton" as const,
            baseColor: "#ffffff",
            accentColor: "#ffd400",
          },
          colorFlow: {
            accentStart: "top" as const,
            alternate: true,
          },
          animation: {
            entrance: {
              direction: "up" as const,
              distance: 28,
              duration: 10,
            },
            easing: {
              type: "smooth" as const,
              speed: 3,
            },
          },
          effects: {
            gradient: {
              enabled: false,
              angle: 180,
              topColor: "#ffe14d",
              topPosition: 0,
              midEnabled: false,
              midColor: "#ff8a00",
              midPosition: 50,
              bottomColor: "#ff3d00",
              bottomPosition: 100,
            },
            glow: { strength: 0, color: "#ffd400" },
            deepGlow: {
              enabled: false,
              radius: 60,
              brightness: 70,
              innerColor: "#fff5e6",
              outerColor: "#ffd400",
              chromatic: 0,
            },
            sweep1: {
              enabled: false,
              color: "#ffffff",
              angle: 20,
              width: 30,
              intensity: 70,
              positionX: 50,
              positionY: 50,
            },
            sweep2: {
              enabled: false,
              color: "#ffffff",
              angle: 160,
              width: 20,
              intensity: 50,
              positionX: 50,
              positionY: 50,
            },
            sweep3: {
              enabled: false,
              color: "#ffffff",
              angle: 90,
              width: 15,
              intensity: 40,
              positionX: 50,
              positionY: 50,
            },
            stroke: { enabled: true, color: "#000000", width: 8 },
            shadow: { enabled: true, color: "rgba(0, 0, 0, 0.65)", blur: 8 },
          },
        }}
      />
    </>
  );
};
