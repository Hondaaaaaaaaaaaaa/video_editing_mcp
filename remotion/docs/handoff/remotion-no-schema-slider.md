---
name: remotion-no-schema-slider
description: "Remotion Studio renders schema numbers as a drag-number, never a track slider; custom sliders need a separate @remotion/player app"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 34866cfd-fcef-487c-aaff-5b9042321683
---

Remotion's Studio schema/props editor renders a `z.number()` as a **drag-to-scrub number** (`InputDragger`), NOT an `<input type="range">` track-and-thumb slider — true even with `.min().max().step()`, and true on the latest `main` branch, not just 4.0.475. Verified by reading `@remotion/studio`'s `ZodNumberEditor.tsx` (renders only `InputDragger`) and the GitHub source. `.min()/.max()` only bound the drag + validate; `.step()` snaps it. There is no range-slider widget anywhere in the schema editor.

So "add min/max to get a slider" is false for this Remotion. To get real sliders you need a custom UI outside the Studio.

That custom UI lives in `remotion/playground/` — a Vite + `@remotion/player` app (`npm run playground` → http://localhost:3100). It auto-generates real `<input type=range>` sliders by introspecting each style's zod schema (numbers→slider, enum→select, bool→checkbox, zColor→color, array→color list). zColor is detected via `schema.description === "__remotion-color"`. Playground is excluded from the root tsconfig (has its own with DOM libs). Related: [[node-tls-system-ca]].
