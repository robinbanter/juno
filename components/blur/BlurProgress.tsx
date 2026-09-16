"use client";

import { Check } from "lucide-react";

// Ordered pipeline stages per media type (image skips tracking).
const STEPS = {
  image: [
    { key: "detecting", label: "Detecting sensitive regions" },
    { key: "compositing", label: "Applying the blur" },
    { key: "ready_for_review", label: "Preview ready" },
  ],
  video: [
    { key: "detecting", label: "Detecting sensitive regions" },
    { key: "tracking", label: "Tracking across frames" },
    { key: "compositing", label: "Applying the blur" },
    { key: "ready_for_review", label: "Preview ready" },
  ],
} as const;

const ORDER = ["uploaded", "detecting", "tracking", "compositing", "ready_for_review"];
const DONE = ["ready_for_review", "approved", "published"];

/**
 * Live stepper for the blur pipeline. Driven by the job status (the review page
 * polls it), so it advances detecting → tracking → compositing → ready as the
 * webhooks land.
 */
export function BlurProgress({
  status,
  mediaType,
}: {
  status: string;
  mediaType: "image" | "video";
}) {
  const steps = STEPS[mediaType];
  const eff = status === "uploaded" ? "detecting" : status; // treat "just queued" as detecting
  const cur = ORDER.indexOf(eff);
  const failed = status === "failed";
  const allDone = DONE.includes(status);

  return (
    <div className="flex aspect-[4/5] flex-col justify-center gap-1 px-5">
      <p className="text-faint mb-3 text-[12.5px] tracking-wide uppercase">
        {failed ? "Processing failed" : allDone ? "Done" : "Auto-blurring…"}
      </p>
      {steps.map((s, i) => {
        const sIdx = ORDER.indexOf(s.key);
        const state =
          allDone || sIdx < cur ? "done" : sIdx === cur ? "active" : "pending";
        const last = i === steps.length - 1;
        return (
          <div key={s.key} className="flex items-stretch gap-3">
            <div className="flex flex-col items-center">
              <span
                className="flex size-[26px] shrink-0 items-center justify-center rounded-full"
                style={{
                  background:
                    state === "done"
                      ? "var(--primary)"
                      : state === "active"
                        ? "var(--primary-tint)"
                        : "var(--surface-3)",
                  border: state === "active" ? "1px solid var(--primary)" : "none",
                }}
              >
                {state === "done" ? (
                  <Check size={15} strokeWidth={3} style={{ color: "var(--primary-fg)" }} />
                ) : state === "active" && !failed ? (
                  <span
                    aria-hidden
                    className="size-3 rounded-full"
                    style={{
                      border: "2px solid color-mix(in srgb, var(--primary) 30%, transparent)",
                      borderTopColor: "var(--primary)",
                      animation: "vspin 0.7s linear infinite",
                    }}
                  />
                ) : (
                  <span
                    className="size-2 rounded-full"
                    style={{ background: "var(--text-faint)" }}
                  />
                )}
              </span>
              {!last && (
                <span
                  className="my-1 min-h-[16px] w-px flex-1"
                  style={{ background: state === "done" ? "var(--primary)" : "var(--hairline)" }}
                />
              )}
            </div>
            <span
              className={`pt-[3px] pb-2 text-[14.5px] ${
                state === "pending"
                  ? "text-faint"
                  : state === "active"
                    ? "text-text font-medium"
                    : "text-muted"
              }`}
            >
              {s.label}
              {state === "active" && !failed && <span className="text-faint"> …</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
