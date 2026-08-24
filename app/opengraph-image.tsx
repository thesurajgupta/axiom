import { ImageResponse } from "next/og";

export const alt = "Axiom — find what's broken before you ship";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Generated rather than shipped as a static asset, so the share card cannot
 * drift out of sync with the product. The severity ramp is the same one the
 * report uses.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f2f4f7",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: "#5e6a7a", letterSpacing: 4 }}>
          AXIOM · PRE-LAUNCH AUDIT
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 84,
            fontWeight: 700,
            color: "#10151d",
            lineHeight: 1.05,
            letterSpacing: -2,
          }}
        >
          <span>Find what&apos;s broken</span>
          <span>before you ship it.</span>
        </div>

        {/* The severity meter, the same device the report opens with. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", height: 16, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ width: "21%", background: "#b3231b" }} />
            <div style={{ width: "29%", background: "#9a4a06" }} />
            <div style={{ width: "33%", background: "#75600a" }} />
            <div style={{ width: "17%", background: "#4f5866" }} />
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#444f5f" }}>
            Blocking · Serious · Moderate · Minor
          </div>
        </div>
      </div>
    ),
    size
  );
}
