import type { CaptionStyle } from "./CaptionedVideo/styles/types";
import "./index.css";
import { Composition } from "remotion";
import { HelloWorld, myCompSchema } from "./HelloWorld";
import { Logo, myCompSchema2 } from "./HelloWorld/Logo";
import {
  CaptionedVideo,
  calculateCaptionedVideoMetadata,
  captionedVideoMetadataAtFps,
  captionedVideoMetadataWithFrame,
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
  SHINY_DEFAULTS,
  ShinyStyleProvider,
} from "./CaptionedVideo/styles/PageShiny";
import {
  PageTypewriter,
  typewriterSchema,
  TYPEWRITER_DEFAULTS,
  TypewriterStyleProvider,
} from "./CaptionedVideo/styles/PageTypewriter";
import {
  PageHighlight,
  highlightSchema,
  HIGHLIGHT_DEFAULTS,
  HighlightStyleProvider,
} from "./CaptionedVideo/styles/PageHighlight";
import {
  PageHormozi,
  hormoziSchema,
  HORMOZI_DEFAULTS,
  HormoziStyleProvider,
} from "./CaptionedVideo/styles/PageHormozi";
import {
  PageGadzhi,
  gadzhiSchema,
  GADZHI_DEFAULTS,
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
  HORMOZI2_DEFAULTS,
  Hormozi2StyleProvider,
} from "./CaptionedVideo/styles/PageHormozi2";
import {
  PageAli,
  aliSchema,
  ALI_DEFAULTS,
  AliStyleProvider,
} from "./CaptionedVideo/styles/PageAli";
import {
  PageSpeed,
  speedSchema,
  SPEED_DEFAULTS,
  SpeedStyleProvider,
} from "./CaptionedVideo/styles/PageSpeed";
import {
  PageEdits,
  editsSchema,
  EDITS_DEFAULTS,
  EDITS_MATCH_DEFAULTS,
  EditsStyleProvider,
} from "./CaptionedVideo/styles/PageEdits";
import {
  PageAnimator,
  animatorSchema,
  AnimatorStyleProvider,
} from "./CaptionedVideo/styles/PageAnimator";
import {
  PageClassic2,
  classic2Schema,
  CLASSIC2_DEFAULTS,
  Classic2StyleProvider,
} from "./CaptionedVideo/styles/PageClassic2";
import {
  PageTypewriter3,
  typewriter3Schema,
  TYPEWRITER3_DEFAULTS,
  Typewriter3StyleProvider,
} from "./CaptionedVideo/styles/PageTypewriter3";

// The video that captions are rendered over (a vertical clip at
// remotion/public/sample-video.mp4). Stored as a PLAIN FILENAME — not
// staticFile("…") — so every composition's defaultProps stay a fully static
// object literal that Remotion Studio can SAVE (a function call would block
// "save default props"). CaptionedVideo resolves the filename via staticFile().
import { FadePopDemo, fadePopDemoSchema, PRESETS, preset } from "./FadePopDemo";

import {
  PageWordByWord,
  wordByWordSchema,
  WORD_BY_WORD_DEFAULTS,
  WordByWordStyleProvider,
} from "./CaptionedVideo/styles/PageWordByWord";

const SAMPLE_VIDEO = "sample-video.mp4";

// The Edits 2 reference reel (remotion/public/edits 2.mp4) — 576x576, 30 fps,
// with its own captions burned in. The "Edits" composition plays THIS rather
// than the shared sample video while Edits 2 is reverse-engineered from it, so
// the Studio timeline scrubs the same footage the measurements come from.
const EDITS2_REFERENCE = "References/Fade + pop/edits 2.mp4";

// The Word by Word reference reel. Lives under public/References/, which is
// gitignored for .mp4 — bring it by hand on a new machine or point `src` at a
// clip that has a caption document beside it.
const WORD_BY_WORD_REFERENCE = "References/Fade + pop/fade  in .mp4";

// The Writer reference reel (remotion/public/References/Type Writer/1.mp4) —
// 1920x1080, with its own captions burned in, so ours land on top of them for
// comparison. Reference 1 of the five: the plain-white one, no coloured keyword.
// H.264, transcoded from the original: reference 1 ships as HEVC/H.265, which
// Chromium cannot decode, so the Studio PREVIEW showed no footage at all (a
// render was fine — that path goes through ffmpeg, not the browser).
const WRITER_REFERENCE = "References/Type Writer/1-h264.mp4";

// The Typewriter 3 reference reel — 576x576 @30fps, already H.264 so it plays
// in the Studio preview as-is. Its own captions are burned in, so ours land on
// top of them for comparison. The filename really does carry a space before the
// extension; it is the file as supplied.
const TYPEWRITER3_REFERENCE = "References/typewriter 3 .mp4";

// Thin wrappers bind a caption *style* to the shared CaptionedVideo
// composition. Same video + captions, different look per composition.
// ---------------------------------------------------------------------------
// Every caption composition wraps the same three things: put the tuned props on
// the style context, hand CaptionedVideo its page component, and name the
// per-template segmentation variant to read from the caption document. Only the
// provider, the page and the shape differ, so those are the only arguments.
//
// Generic over the PROPS rather than loosely typed: <Composition> is generic
// over its schema, so a wrapper typed as React.FC<any> would force casts at
// every call site and lose the check that defaultProps match the schema.
// ---------------------------------------------------------------------------
type CaptionBaseProps = { src: string; showPunctuation?: boolean };

const makeCaptionedVideo = <P extends CaptionBaseProps>(
  Provider: React.Provider<Omit<P, "src" | "showPunctuation">>,
  PageComponent: CaptionStyle,
  shape: string,
): React.FC<P> => {
  const Wrapped: React.FC<P> = ({ src, showPunctuation, ...style }) => (
    <Provider value={style as Omit<P, "src" | "showPunctuation">}>
      <CaptionedVideo
        src={src}
        showPunctuation={showPunctuation}
        shape={shape}
        PageComponent={PageComponent}
        singleSurface
      />
    </Provider>
  );
  return Wrapped;
};
// Typewriter 3 paints one <Sequence> per screen and types each screen out a
// character at a time, so it reads its own `typewriter3` layout variant.
const Typewriter3CaptionedVideo = makeCaptionedVideo<z.infer<typeof typewriter3Schema>>(
  Typewriter3StyleProvider,
  PageTypewriter3,
  "typewriter3",
);

const ClassicCaptionedVideo = makeCaptionedVideo<z.infer<typeof classicSchema>>(
  ClassicStyleProvider,
  PageClassic,
  "classic",
);

// Shiny takes extra schema props (glow + gradient) and feeds them to the
// style via context — the shared engine stays untouched.
const ShinyCaptionedVideo = makeCaptionedVideo<z.infer<typeof shinySchema>>(
  ShinyStyleProvider,
  PageShiny,
  "shiny",
);

// Typewriter paints its own <Sequence> per screen from the caption document —
// it needs each screen's own start time and duration to schedule typing, which
// the default per-page rendering cannot give it. Until this carried `shape`, it
// silently fell back to Hormozi's layout (the "unwired" note in
// docs/adding-a-caption-template.md).
const TypewriterCaptionedVideo = makeCaptionedVideo<z.infer<typeof typewriterSchema>>(
  TypewriterStyleProvider,
  PageTypewriter,
  "typewriter",
);

// Highlight uses Shiny's kinetic LAYOUT, so (like Shiny) it does its own
// count-based grouping from the flat caption stream and renders as a single
// full-timeline surface. Its layout/color/gradient/glow/pop/wiggle props feed
// the style via context.
const HighlightCaptionedVideo = makeCaptionedVideo<z.infer<typeof highlightSchema>>(
  HighlightStyleProvider,
  PageHighlight,
  "shiny",
);

// Hormozi is kinetic-only like Shiny: it does its OWN count-based grouping into
// two-line blocks and alternates which line wears the accent color, so it renders
// as a single full-timeline surface.
const HormoziCaptionedVideo = makeCaptionedVideo<z.infer<typeof hormoziSchema>>(
  HormoziStyleProvider,
  PageHormozi,
  "hormozi",
);

// Gadzhi renders the whole timeline itself too: it reads the caption document's
// segments directly and needs every caption at once to pick ONE font size for
// the video, so it can only work as a single surface.
const GadzhiCaptionedVideo = makeCaptionedVideo<z.infer<typeof gadzhiSchema>>(
  GadzhiStyleProvider,
  PageGadzhi,
  "gadzhi",
);

// Hormozi 2 reads the caption document's segments and needs every caption at
// once to pick ONE font size for the video, so (like Gadzhi) it renders as a
// single surface. Its two-line block lights the SPOKEN line in a per-line random
// accent colour and wiggles it.
const Hormozi2CaptionedVideo = makeCaptionedVideo<z.infer<typeof hormozi2Schema>>(
  Hormozi2StyleProvider,
  PageHormozi2,
  "hormozi2",
);

// Ali reads the caption document's segments and needs every caption at once to
// pick ONE font size for the video, so (like Gadzhi) it renders as a single
// surface. One line of text on a rounded sticker; each word crosses from grey
// to black as it is spoken.
const AliCaptionedVideo = makeCaptionedVideo<z.infer<typeof aliSchema>>(
  AliStyleProvider,
  PageAli,
  "ali",
);

// Speed reads the caption document's segments (including each word's SEMANTIC
// COLOUR, which only this template uses) and paints the whole timeline itself,
// so it renders as a single surface. Words fade in one at a time; colour
// carries meaning rather than position.
const SpeedCaptionedVideo = makeCaptionedVideo<z.infer<typeof speedSchema>>(
  SpeedStyleProvider,
  PageSpeed,
  "speed",
);

// Edits reads the caption document's segments and paints the whole timeline
// itself, so it renders as a single surface. One small centred line of heavy
// caps that grows a word at a time, the line re-centring as each lands.
const WordByWordCaptionedVideo = makeCaptionedVideo<z.infer<typeof wordByWordSchema>>(
  WordByWordStyleProvider,
  PageWordByWord,
  "wordbyword",
);

const EditsCaptionedVideo = makeCaptionedVideo<z.infer<typeof editsSchema>>(
  EditsStyleProvider,
  PageEdits,
  "edits",
);

// Writer paints with the same component as Edits but reads its OWN layout
// variant: it renders at more than double the em, so it cannot share Edits'
// character budget without putting far too much text on screen at once.
const WriterCaptionedVideo = makeCaptionedVideo<z.infer<typeof editsSchema>>(
  EditsStyleProvider,
  PageEdits,
  "writer",
);

// Animator is the slider-driven one: the caption document gives it the words,
// and its own wave decides when each one arrives. Single surface, like the rest.
const AnimatorCaptionedVideo = makeCaptionedVideo<z.infer<typeof animatorSchema>>(
  AnimatorStyleProvider,
  PageAnimator,
  "animator",
);

// Classic 2 reads the caption document's segments and paints its own <Sequence>
// per screen, so it renders as one full-timeline surface. One centred line of
// Bebas Neue caps whose words are revealed in place, a word at a time.
const Classic2CaptionedVideo = makeCaptionedVideo<z.infer<typeof classic2Schema>>(
  Classic2StyleProvider,
  PageClassic2,
  "classic2",
);

// Kinetic reads the caption document's per-word variants and builds the whole
// flowing block itself, so (like Shiny/Gadzhi) it renders as a single surface.
const KineticCaptionedVideo = makeCaptionedVideo<z.infer<typeof kineticSchema>>(
  KineticStyleProvider,
  PageKinetic,
  "kinetic",
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
        // Spread, NOT a literal copy: Studio writes tuned props back here, and a
        // literal silently stops tracking CLASSIC_DEFAULTS (it is how the new
        // `easing` control went missing). Tune in Studio, then fold the value
        // into CLASSIC_DEFAULTS so both stay in step.
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
        defaultProps={{ src: "sample-video.mp4", ...SHINY_DEFAULTS }}
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
        // Spread, NOT a literal copy — a literal silently stops tracking
        // TYPEWRITER_DEFAULTS, which is how Classic's defaults drifted.
        defaultProps={{ src: "sample-video.mp4", ...TYPEWRITER_DEFAULTS }}
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
        defaultProps={{ src: "sample-video.mp4", ...HIGHLIGHT_DEFAULTS }}
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
        defaultProps={{ src: "sample-video.mp4", ...HORMOZI_DEFAULTS }}
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
        defaultProps={{ src: "sample-video.mp4", ...GADZHI_DEFAULTS }}
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
        defaultProps={{ src: "sample-video.mp4", ...HORMOZI2_DEFAULTS }}
      />

      {/* TEXT MOTION LAB — four ways a caption can "grow", each on a plain
          background with no footage and no caption document, so the motion can
          be judged on its own. Same component, four presets; every value is a
          control in the Studio props panel. See the header of FadePopDemo.tsx
          for what each one is and which the reference actually measures as. */}
      <Composition
        id="MotionA-FadeOnly"
        component={FadePopDemo}
        schema={fadePopDemoSchema}
        fps={30}
        durationInFrames={165}
        width={1080}
        height={1080}
        defaultProps={preset(PRESETS.fadeOnly)}
      />
      <Composition
        id="MotionB-TrackOut"
        component={FadePopDemo}
        schema={fadePopDemoSchema}
        fps={30}
        durationInFrames={165}
        width={1080}
        height={1080}
        defaultProps={preset(PRESETS.trackOut)}
      />
      <Composition
        id="MotionC-ZoomContinuous"
        component={FadePopDemo}
        schema={fadePopDemoSchema}
        fps={30}
        durationInFrames={165}
        width={1080}
        height={1080}
        defaultProps={preset(PRESETS.zoomOut)}
      />
      <Composition
        id="MotionD-WordPop"
        component={FadePopDemo}
        schema={fadePopDemoSchema}
        fps={30}
        durationInFrames={165}
        width={1080}
        height={1080}
        defaultProps={preset(PRESETS.wordPop)}
      />

      {/* "Word by Word" — the caption is laid out in full and its words arrive
          one at a time into slots they never leave, so nothing re-centres. It
          carries the SHARED text-animation slot in full: fade in, pop in, track
          out and zoom continuous are all controls in the props panel. The
          DEFAULT is zoom continuous — the caption keeps scaling up about its
          centre and never settles.

          Plays over ITS OWN REFERENCE (public/References/Fade + pop/fade  in
          .mp4, 720x720) rather than the shared sample video, so the composition
          is SQUARE. The reference carries its own burned-in captions, so ours
          land on top of them — point `src` at a clean clip to see it alone.
          Every default is a measurement; see the header of PageWordByWord.tsx. */}
      <Composition
        id="WordByWord"
        component={WordByWordCaptionedVideo}
        schema={wordByWordSchema}
        calculateMetadata={calculateCaptionedVideoMetadata}
        fps={30}
        durationInFrames={600}
        width={1080}
        height={1080}
        defaultProps={{ src: WORD_BY_WORD_REFERENCE, ...WORD_BY_WORD_DEFAULTS }}
      />

      {/* "Edits" — the cinematic edit caption: ONE small line of heavy white
          caps that grows a word at a time while staying centred, so everything
          already on screen slides outward as the next word lands. Reverse-
          engineered from public/edits.mp4; the per-word fade + pop, the larger
          type and the 78% position are deliberate departures from it, and the
          glow is an addition (see the header of PageEdits.tsx). */}
      <Composition
        id="Edits"
        component={EditsCaptionedVideo}
        schema={editsSchema}
        calculateMetadata={calculateCaptionedVideoMetadata}
        fps={30}
        durationInFrames={600}
        // SQUARE, because the Edits 2 reference is 1:1. Put this composition
        // back on the vertical sample with 1080x1920 + SAMPLE_VIDEO.
        width={1080}
        height={1080}
        defaultProps={{ src: EDITS2_REFERENCE, ...EDITS_DEFAULTS }}
      />

      {/* "Edits Match" — a verification composition ONLY: the Edits template
          rendered over the SQUARE reference (public/edits.mp4, 1080x1080, 60fps)
          with EDITS_MATCH_DEFAULTS — the reference EXACTLY as measured (hard-cut
          words, true 2.52% em, 65% position, no glow). Overlay this on the
          reference to confirm ours lands on top of the burned-in captions. The
          product "Edits" comp above is unchanged. */}
      <Composition
        id="Typewriter3"
        component={Typewriter3CaptionedVideo}
        schema={typewriter3Schema}
        calculateMetadata={calculateCaptionedVideoMetadata}
        fps={30}
        durationInFrames={1849}
        width={576}
        height={576}
        defaultProps={{ src: TYPEWRITER3_REFERENCE, ...TYPEWRITER3_DEFAULTS }}
      />
      <Composition
        id="Writer"
        component={WriterCaptionedVideo}
        schema={editsSchema}
        calculateMetadata={calculateCaptionedVideoMetadata}
        fps={30}
        durationInFrames={600}
        width={1920}
        height={1080}
        defaultProps={{ src: WRITER_REFERENCE, ...EDITS_MATCH_DEFAULTS }}
      />

      {/* "Animator" — the slider-driven word animator, modelled on the Text
          Animator Pro MOGRT and calibrated against its exported clips. Words
          only, entrance only: a WAVE sweeps the caption, so at any instant some
          words are settled, one is mid-flight and the rest have not arrived.
          Every channel (rise, fade, blur, scale, rotation, duration, stagger,
          curve, direction) is a slider — this is the one template whose motion
          is meant to be dialled rather than fixed. */}
      <Composition
        id="Animator"
        component={AnimatorCaptionedVideo}
        schema={animatorSchema}
        calculateMetadata={captionedVideoMetadataWithFrame}
        fps={30}
        durationInFrames={600}
        width={1080}
        height={1920}
        defaultProps={{
          src: "Words Animator/easing sample 2.mp4",
          showPunctuation: false,
          frame: "9:16" as const,
          animation: {
            slideDirection: "right" as const,
            slideDistancePct: 25.5,
            fadeFrom: 0,
            fadeMs: 730,
            blurPct: 0.83,
            blurMs: 540,
            scaleFrom: 1,
            rotateFrom: 0,
            durationMs: 555,
            staggerMs: 190,
            easing: { type: "ease-out" as const, strength: 4 },
            direction: "reading" as const,
            seed: 0,
          },
          layout: {
            fontSizePct: 6.7,
            captionScale: 1,
            letterSpacing: 0,
            wordSpacing: 0.24,
            lineSpacing: 1.2,
            positionX: 50,
            positionY: 50,
            alignment: "center" as const,
          },
          text: {
            font: { family: "Playfair Display" as const, custom: "" },
            weight: 700,
            uppercase: false,
            color: "#ffffff",
            accentColor: "#e02020",
            accentOnEmphasis: true,
          },
          effects: {
            shadow: {
              enabled: true,
              color: "rgba(0,0,0,0.5)",
              blur: 10,
              offsetY: 3,
            },
            glow: { enabled: false, blur: 18, opacity: 0.3 },
          },
        }}
      />

      {/* "Classic 2 Match" — the cinematic movie-clip caption: ONE short centred
          line of white Bebas Neue caps whose words are revealed IN PLACE, a word
          at a time (the line is laid out and centred for its FULL text up front,
          so it never re-centres as it grows). Defaults ARE the measurements
          taken off the reference — including a hard-cut entrance, which the
          fade / easing / pop controls can soften.

          It plays over ITS OWN REFERENCE CLIP (public/Classic 2.mp4) rather than
          the shared sample video: this look was built for cinematic landscape
          footage and reads wrong on the vertical talking-head sample. NOTE the
          reference still carries its own burned-in captions, so ours land on top
          of them — point `src` at a clean clip to see it alone.

          Size still comes from the `frame` prop (9:16 / 16:9 / 1:1 / 4:5); it
          defaults to 16:9 here because the reference is landscape. */}
      <Composition
        id="Classic2Match"
        component={Classic2CaptionedVideo}
        schema={classic2Schema}
        // calculateMetadata's returned size WINS over the width/height below,
        // which are only what the Studio shows before it resolves.
        calculateMetadata={captionedVideoMetadataWithFrame}
        fps={30}
        durationInFrames={600}
        width={1920}
        height={1080}
        defaultProps={{ src: "References/Classic/Classic 2.mp4", ...CLASSIC2_DEFAULTS, frame: "16:9" as const }}
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

      {/* "KineticMatch" — reference-fidelity verification comp. Renders the
          kinetic template over ksample1.mp4 (an identical copy of the reference
          "kinetic 1/sample 1.mp4", 720x1280, with its OWN kinetic caption data)
          so our captions can be overlaid on the reference's burned-in captions
          and compared pixel-for-pixel. NOT a product composition. */}
      <Composition
        id="KineticMatch"
        component={KineticCaptionedVideo}
        schema={kineticSchema}
        calculateMetadata={calculateCaptionedVideoMetadata}
        fps={30}
        durationInFrames={210}
        width={720}
        height={1280}
        defaultProps={{ src: "References/kinetic 1/ksample1.mp4", ...KINETIC_DEFAULTS }}
      />

      {/* "Ali" — the sticker look. ONE line of Poppins on a rounded pill that
          hugs the text, sitting under the speaker's chin; each word crosses
          from pale grey to black over ~280ms as it is spoken, and nothing else
          moves. Defaults are spread from ALI_DEFAULTS (which ARE the
          measurements taken off remotion/public/Ali) rather than inlined, so
          Studio nudging a prop can't quietly fork them. */}
      <Composition
        id="Ali"
        component={AliCaptionedVideo}
        schema={aliSchema}
        calculateMetadata={calculateCaptionedVideoMetadata}
        fps={30}
        durationInFrames={600}
        width={1080}
        height={1920}
        defaultProps={{ src: SAMPLE_VIDEO, ...ALI_DEFAULTS }}
      />

      {/* "Speed" — the fast-cut viral look. Heavy ALL-CAPS display type in the
          middle of the frame; words fade in ONE AT A TIME over ~85ms on an
          easeOutQuad curve (measured frame by frame off the 60fps reference —
          it is a fade, NOT a scale pop), and colour carries MEANING: white
          base, yellow key term, green positive, red negative, and a rare
          red-with-white-outline for the peak beat. */}
      <Composition
        id="Speed"
        component={SpeedCaptionedVideo}
        schema={speedSchema}
        // 60fps, matching the reference reels. NOT cosmetic: the per-word fade
        // is 85ms, which is 5-6 graded frames at 60 but only ~2.5 at 30 — at
        // 30fps the identical curve reads as a hard cut, which is exactly how
        // this template looked wrong the first time.
        calculateMetadata={captionedVideoMetadataAtFps(60)}
        fps={60}
        durationInFrames={1200}
        width={1080}
        height={1920}
        // NOT the shared sample clip. Speed's whole character is words landing
        // on top of each other, and that only happens on fast speech: the
        // sample clip's median gap between words is 460ms, so each 85ms fade
        // finishes and then sits alone for ~375ms — the template reads as
        // static text popping on, no matter how correct it is. The reference
        // reel's median gap is 200ms, where the fades nearly run together.
        // Judging this template on slow footage will always mislead.
        defaultProps={{ src: "References/Fade + pop/speed 1.mp4", ...SPEED_DEFAULTS }}
      />
    </>
  );
};
