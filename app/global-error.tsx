"use client"; // global-error replaces the root layout, so it ships its own <html>

import { useEffect } from "react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: "0 24px",
          textAlign: "center",
          background: "#0f0d15",
          color: "#f5f2f3",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ color: "#a8a0a4", maxWidth: 360, fontSize: 15 }}>
          The app hit an unexpected error.
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          style={{
            background: "#7c3aed",
            color: "#fff",
            border: 0,
            borderRadius: 9999,
            padding: "12px 24px",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
