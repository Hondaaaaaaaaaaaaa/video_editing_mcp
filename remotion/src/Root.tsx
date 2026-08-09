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
import {
  PageGadzhi,
  gadzhiSchema,
  GadzhiStyleProvider,
} from "./CaptionedVideo/styles/PageGadzhi";
import {
  PageKinetic,
  kineticSchema,
  KINETIC_DEFAULTS,
  KineticStyleProvider,
} from "./CaptionedVideo/styles/PageKinetic";
import {
  PageHormozi2,
  hormozi2Schema,
  Hormozi2StyleProvider,
} from "./CaptionedVideo/styles/PageHormozi2";

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
  showPunctuation,
  ...style
}) => (
  <ClassicStyleProvider value={style}>
    <CaptionedVideo src={src} showPunctuation={showPunctuation} PageComponent={PageClassic} />
  </ClassicStyleProvider>
);

// Shiny takes extra schema props (glow + gradient) and feeds them to the
// style via context — the shared engine stays untouched.
const ShinyCaptionedVideo: React.FC<z.infer<typeof shinySchema>> = ({
  src,
  showPunctuation,
  ...style
}) => (
  <ShinyStyleProvider value={style}>
    <CaptionedVideo
      src={src}
      showPunctuation={showPunctuation}
      shape="shiny"
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
  showPunctuation,
  ...style
}) => (
  <TypewriterStyleProvider value={style}>
    <CaptionedVideo src={src} showPunctuation={showPunctuation} PageComponent={PageTypewriter} />
  </TypewriterStyleProvider>
);

// Highlight uses Shiny's kinetic LAYOUT, so (like Shiny) it does its own
// count-based grouping from the flat caption stream and renders as a single
// full-timeline surface. Its layout/color/gradient/glow/pop/wiggle props feed
// the style via context.
const HighlightCaptionedVideo: React.FC<z.infer<typeof highlightSchema>> = ({
  src,
  showPunctuation,
  ...style
}) => (
  <HighlightStyleProvider value={style}>
    <CaptionedVideo src={src} showPunctuation={showPunctuation} shape="shiny" PageComponent={PageHighlight} singleSurface />
  </HighlightStyleProvider>
);

// Hormozi is kinetic-only like Shiny: it does its OWN count-based grouping into
// two-line blocks and alternates which line wears the accent color, so it renders
// as a single full-timeline surface.
const HormoziCaptionedVideo: React.FC<z.infer<typeof hormoziSchema>> = ({
  src,
  showPunctuation,
  ...style
}) => (
  <HormoziStyleProvider value={style}>
    <CaptionedVideo src={src} showPunctuation={showPunctuation} shape="hormozi" PageComponent={PageHormozi} singleSurface />
  </HormoziStyleProvider>
);

// Gadzhi renders the whole timeline itself too: it reads the caption document's
// segments directly and needs every caption at once to pick ONE font size for
// the video, so it can only work as a single surface.
const GadzhiCaptionedVideo: React.FC<z.infer<typeof gadzhiSchema>> = ({
  src,
  showPunctuation,
  ...style
}) => (
  <GadzhiStyleProvider value={style}>
    <CaptionedVideo src={src} showPunctuation={showPunctuation} shape="gadzhi" PageComponent={PageGadzhi} singleSurface />
  </GadzhiStyleProvider>
);

// Hormozi 2 reads the caption document's segments and needs every caption at
// once to pick ONE font size for the video, so (like Gadzhi) it renders as a
// single surface. Its two-line block lights the SPOKEN line in a per-line random
// accent colour and wiggles it.
const Hormozi2CaptionedVideo: React.FC<z.infer<typeof hormozi2Schema>> = ({
  src,
  showPunctuation,
  ...style
}) => (
  <Hormozi2StyleProvider value={style}>
    <CaptionedVideo src={src} showPunctuation={showPunctuation} shape="hormozi2" PageComponent={PageHormozi2} singleSurface />
  </Hormozi2StyleProvider>
);

// Kinetic reads the caption document's per-word variants and builds the whole
// flowing block itself, so (like Shiny/Gadzhi) it renders as a single surface.
const KineticCaptionedVideo: React.FC<z.infer<typeof kineticSchema>> = ({
  src,
  showPunctuation,
  ...style
}) => (
  <KineticStyleProvider value={style}>
    <CaptionedVideo src={src} showPunctuation={showPunctuation} shape="kinetic" PageComponent={PageKinetic} singleSurface />
  </KineticStyleProvider>
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
            wordSpacing: 0,
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
            captionScale: 1,
            wordSpacing: 0.2,
            lineSpacing: 1.15,
            positionX: 50,
            positionY: 78,
            alignment: "center" as const,
          },
          text: {
            fontFamily: "Montserrat" as const,
            baseColor: "#ffffff",
            accentColor: "#ffd400",
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
            stroke: { enabled: true, color: "#000000", width: 6 },
            shadow: { enabled: true, color: "rgba(0, 0, 0, 0.65)", blur: 8 },
          },
        }}
      />

      {/* "Gadzhi" caption style — the clean podcast look reverse-engineered from
          the reference clip: two stacked lines, NO accent color at all. The
          spoken line is bold and opaque, the other is the same white in a thin
          weight at lower opacity, and the bold steps top->bottom in time with
          the speech. Text never moves or resizes; each caption just fades in. */}
      <Composition
        id="Gadzhi"
        component={GadzhiCaptionedVideo}
        schema={gadzhiSchema}
        calculateMetadata={calculateCaptionedVideoMetadata}
        fps={30}
        durationInFrames={600}
        width={1080}
        height={1920}
        defaultProps={{
          src: "sample-video.mp4",
          layout: {
            fontSizePct: 6.63,
            captionScale: 1,
            wordSpacing: 0.27,
            lineSpacing: 1.19,
            positionX: 50,
            positionY: 69,
            alignment: "center" as const,
          },
          text: {
            activeFont: { family: "Montserrat" as const, custom: "" },
            inactiveFont: { family: "Montserrat" as const, custom: "" },
            color: "#ffffff",
            activeWeight: 700,
            inactiveWeight: 200,
            inactiveOpacity: 0.85,
            capitalizeFirstWord: true,
          },
          motion: { fadeInMs: 0 },
          effects: {
            stroke: { enabled: false, color: "#000000", width: 4 },
            shadow: { enabled: true, color: "rgba(0, 0, 0, 0.35)", blur: 12 },
          },
        }}
      />

      {/* "Hormozi 2" — the changing-colour + wiggle look. Two stacked ALL-CAPS
          lines in a heavy condensed italic; the SPOKEN line lights up in a
          per-line random accent (red / yellow / green, each with its own
          outline) and pops + wiggles, then reverts to white as the highlight
          steps to the next line. */}
      <Composition
        id="Hormozi2"
        component={Hormozi2CaptionedVideo}
        schema={hormozi2Schema}
        calculateMetadata={calculateCaptionedVideoMetadata}
        fps={30}
        durationInFrames={600}
        width={1080}
        height={1920}
        defaultProps={{
          src: "sample-video.mp4",
          layout: {
            fontSizePct: 13.5,
            captionScale: 1,
            wordSpacing: 0.22,
            lineSpacing: 1.05,
            positionX: 50,
            positionY: 64,
            alignment: "center" as const,
            balanceLines: true,
          },
          text: {
            font: {
              family: "Montserrat" as const,
              custom: "avenir-next-condensed-heavy-italic.ttf",
            },
            uppercase: true,
            baseColor: "#ffffff",
            baseStroke: "#0a0a0a",
            strokeWidth: 9,
            accents: {
              one: { fill: "#ff1f1f", stroke: "#ffffff" },
              two: { fill: "#ffe000", stroke: "#0a0a0a" },
              three: { fill: "#28e234", stroke: "#0a0a0a" },
            },
          },
          motion: {
            fadeInMs: 60,
            bobEm: 0.08,
            bobSpeed: 0.4,
            rotateDeg: 0,
            rotateSpeed: 0.28,
          },
          effects: {
            shadow: {
              enabled: true,
              color: "rgba(0,0,0,0.78)",
              blur: 14,
              offsetY: 5,
            },
          },
        }}
      />

      {/* "Kinetic" — kinetic-typography poster captions. Words accumulate one by
          one, each styled by a per-word role (base / punch / elegant) that Claude
          assigns; the keyword wipes on, connective words pop in. Defaults are
          spread from KINETIC_DEFAULTS (the tuning source of truth is the
          playground) rather than inlined. */}
      <Composition
        id="Kinetic"
        component={KineticCaptionedVideo}
        schema={kineticSchema}
        calculateMetadata={calculateCaptionedVideoMetadata}
        fps={30}
        durationInFrames={600}
        width={1080}
        height={1920}
        // The canonical sample clip. Its enriched sidecar now carries a
        // `variants.kinetic` (per-word base/punch/elegant roles) matching its
        // own audio, so the captions are what the speaker actually says — the
        // template applied to a real video, which is how it works for any clip.
        defaultProps={{ src: SAMPLE_VIDEO, ...KINETIC_DEFAULTS }}
      />
    </>
  );
};
