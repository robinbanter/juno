import { ImageResponse } from "next/og";

// Branded social-share card. Next wires this in as og:image AND twitter:image
// for every route that doesn't define its own opengraph-image.
export const alt = "Norr — lift the veil";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(120% 80% at 50% -10%, #1e1233, #0f0d15 60%)",
          color: "#f5f2f3",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 9999,
              background:
                "radial-gradient(circle at 35% 30%, #a78bfa, #7c3aed 45%, #4c1d95)",
            }}
          />
          <div
            style={{
              fontSize: 108,
              fontWeight: 800,
              letterSpacing: 14,
              paddingLeft: 6,
            }}
          >
            NORR
          </div>
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 40,
            color: "#c9c2c6",
            maxWidth: 820,
            textAlign: "center",
            lineHeight: 1.25,
          }}
        >
          Pay-per-tap premium content with invisible app-balance payments.
        </div>
      </div>
    ),
    size,
  );
}
