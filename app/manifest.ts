import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Juno",
    short_name: "Juno",
    description:
      "A social app on Solana where publishing a post launches a Meteora " +
      "Dynamic Bonding Curve pool for it.",
    start_url: "/explore",
    display: "standalone",
    // Match the layout viewport themeColor so the splash + status bar agree.
    background_color: "#0d0b12",
    theme_color: "#0d0b12",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    categories: ["finance", "social"],
  };
}
