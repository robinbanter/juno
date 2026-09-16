import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  experimental: {
    viewTransition: true,
  },
  // Pin the workspace root so a stray lockfile in a parent dir isn't picked up.
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
  // Native/binary packages used by the auto-blur server code must NOT be bundled
  // (the ffmpeg/ffprobe installers ship platform binaries + non-JS files the
  // bundler can't trace). Load them from node_modules at runtime instead.
  serverExternalPackages: [
    "sharp",
    "@ffmpeg-installer/ffmpeg",
    "@ffprobe-installer/ffprobe",
    "fluent-ffmpeg",
    "replicate",
    // Server-only data/storage clients — node-postgres ("pg") is node-only and
    // must never enter the client/browser graph; keeping both external stops
    // Turbopack from intermittently failing to resolve them into the page build.
    "pg",
    "@supabase/supabase-js",
  ],
  // sharp (libvips) and the ffmpeg/ffprobe installers load their native binaries
  // via dynamic requires the file tracer can't follow — force them into the
  // functions that composite (blur routes) and extract keyframes (posts upload).
  outputFileTracingIncludes: {
    "/api/blur/**": [
      "./node_modules/@img/**",
      "./node_modules/sharp/**",
      "./node_modules/@ffmpeg-installer/**",
      "./node_modules/@ffprobe-installer/**",
    ],
    "/api/posts": [
      "./node_modules/@ffmpeg-installer/**",
      "./node_modules/@ffprobe-installer/**",
    ],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
      // Private Vercel Blob signed URLs (the active storage backend). Allowing
      // the host lets next/image resize + re-encode the full-res blurred
      // previews instead of shipping the multi-MB originals to the client.
      { protocol: "https", hostname: "*.blob.vercel-storage.com" },
    ],
    // AVIF first (smallest), WebP fallback — big LCP/bandwidth win on the feed.
    formats: ["image/avif", "image/webp"],
    // Next 16 requires an explicit qualities allowlist. 50 is plenty for the
    // blurred teaser (it's displayed under a 15px blur); 75 stays the default.
    qualities: [50, 75],
  },
  // `next build --webpack` (needed for the serwist service worker) chokes on
  // @txnlab/use-wallet-ui-react, which inlines its font as
  //   new URL("data:font/woff2;base64,…", import.meta.url)
  // Webpack's asset handling types that data URI as an asset and attaches a
  // `generator.filename`, which `asset/inline` rejects → "Invalid generator
  // object … unknown property 'filename'". The data URI is self-contained, so
  // stop webpack from rewriting `new URL()` inside this package and let the
  // browser resolve it natively. Scoped to the one package; Turbopack is
  // unaffected (it handles the data URI fine).
  webpack: (config) => {
    config.module.rules.push({
      test: /[\\/]node_modules[\\/]@txnlab[\\/]use-wallet-ui-react[\\/]/,
      parser: { url: false },
    });
    return config;
  },
  // Don't advertise the framework.
  poweredByHeader: false,
  async headers() {
    // Always-safe hardening (no functional impact in dev or prod).
    const base = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(self), geolocation=(), browsing-topics=()",
      },
    ];
    // HSTS + CSP are production-only: a strict CSP would fight Turbopack HMR and
    // the dev overlay (both need eval + ws:), and HSTS is meaningless over http.
    if (process.env.NODE_ENV === "production") {
      base.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
      base.push({
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          // 'unsafe-inline' covers the pre-paint theme script + inline styles.
          // Privy (auth) runs its login UI in an iframe from auth.privy.io.
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://auth.privy.io https://challenges.cloudflare.com",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "media-src 'self' blob: https:",
          "font-src 'self' data:",
          // Privy, Algorand nodes (algonode), Supabase, WalletConnect relays.
          "connect-src 'self' https: wss:",
          "frame-src 'self' https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com",
          "worker-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
        ].join("; "),
      });
    }
    return [{ source: "/:path*", headers: base }];
  },
};

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Disable the service worker in dev so Turbopack HMR isn't interfered with.
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);
