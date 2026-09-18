import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  experimental: {
    viewTransition: true,
  },
  // Pin the workspace root so a stray lockfile in a parent dir isn't picked up.
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
  // node-postgres is node-only and must never enter the client graph; sharp
  // loads a native binary the bundler cannot trace.
  serverExternalPackages: ["sharp", "pg"],
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
        value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
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
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          // Media and token art live on IPFS gateways; identicons are data URIs.
          "img-src 'self' data: blob: https:",
          "media-src 'self' blob: https:",
          "font-src 'self' data:",
          // Solana RPC (HTTP + websocket), whichever endpoint is configured.
          "connect-src 'self' https: wss:",
          // Solflare's web wallet runs in an iframe from connect.solflare.com;
          // without this, connecting Solflare without its extension is blocked.
          "frame-src 'self' https://connect.solflare.com",
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
