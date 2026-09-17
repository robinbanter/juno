import { ImageResponse } from "next/og";

// Branded social-share card. Next wires this in as og:image AND twitter:image
// for every route that doesn't define its own opengraph-image.
export const alt = "Juno — every post is a market";
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
          // Juno's canvas: near-black with a violet cast, so the amber reads warm.
          background:
            "radial-gradient(120% 80% at 50% -10%, #1d1630, #0d0b12 60%)",
          color: "#f4f1f8",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* The banded gas-giant mark, in the brand amber. */}
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 9999,
              background:
                "radial-gradient(circle at 35% 30%, #ffe066, #ffb020 45%, #b56d00)",
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
            JUNO
          </div>
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 40,
            color: "#a79fb8",
            maxWidth: 900,
            textAlign: "center",
            lineHeight: 1.25,
          }}
        >
          Every post is a market. Publishing launches a Meteora bonding curve on
          Solana.
        </div>
      </div>
    ),
    size,
  );
}
