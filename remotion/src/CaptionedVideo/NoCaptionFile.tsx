import React from "react";
import { AbsoluteFill } from "remotion";

/**
 * Shown when a video has no matching `<name>.json` captions file in `public/`.
 * Generate one with:  node sub.mjs public/<name>.mp4
 */
export const NoCaptionFile: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
        textAlign: "center",
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(0,0,0,0.6)",
          color: "white",
          padding: "24px 32px",
          borderRadius: 16,
          fontFamily: "sans-serif",
          fontSize: 40,
          lineHeight: 1.4,
        }}
      >
        No captions found.
        <br />
        Run{" "}
        <code style={{ color: "#39E508" }}>node sub.mjs public/your-video.mp4</code>
      </div>
    </AbsoluteFill>
  );
};
