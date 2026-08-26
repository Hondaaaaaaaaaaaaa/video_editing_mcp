// The registry moved to src/CaptionedVideo/templates.ts so the Studio and this
// editor share one list. These aliases keep the playground's existing names.
export type { TemplateDef as StyleEntry, TemplateProps as StyleProps } from "../src/CaptionedVideo/templates";
export {
  TEMPLATES as STYLES,
  TEMPLATE_BY_ID as STYLE_BY_ID,
  DOCUMENT_DRIVEN as EDITOR_STYLES,
} from "../src/CaptionedVideo/templates";
