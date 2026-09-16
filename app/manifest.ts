import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Norr",
    short_name: "Norr",
    description:
      "Pay-per-tap premium content with invisible app-balance payments.",
    start_url: "/",
    display: "standalone",
    // Match the layout viewport themeColor so the splash + status bar agree.
    background_color: "#000000",
    theme_color: "#000000",
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
    categories: ["entertainment", "social"],
  };
}
