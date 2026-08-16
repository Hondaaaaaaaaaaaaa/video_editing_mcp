---
name: captions-remotion-architecture
description: Captions are built natively in Remotion as data-driven timed text; AE/Lottie reserved for B-roll only
metadata: 
  node_type: memory
  type: project
  originSessionId: f2defde1-5fdc-4375-8a0b-fcadf995cd2d
---

Agreed architecture for the captions feature (planning chat 2026-06-04):

- **Captions built natively in Remotion**, data-driven: transcript → `{ text, startMs, endMs }[]` → Remotion React component. The MCP outputs that JSON; the component renders it.
- `@remotion/captions` provides the `Caption` type and `createTikTokStyleCaptions()` — the Submagic-style word-pop effect out of the box.
- **After Effects / Lottie (`@remotion/lottie`) is NOT used for captions** — reserved strictly for animated B-roll overlays later. Raw AE-JSON custom parsing was explicitly rejected as maintenance hell.
- **Remotion runs alongside the app, not inside it.** Keep the Remotion code (`remotion/` folder here) isolated; the render engine is invoked by the MCP, not imported into UI pages.

**Why:** captions are just timed text — trivial and fully programmatic in React, easy for the MCP to drive. Locks in "native Remotion, not AE" so we don't revisit the AE-import path. Part of [[vemcp-saas-goal]].
