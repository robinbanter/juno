"use client";

import { useEffect, useState } from "react";
import { Flag, X, CheckCircle2 } from "lucide-react";
import { Button } from "./ui/Button";

/**
 * Report a post.
 *
 * Deliberately usable while signed out — the API allows it, and requiring an
 * account to report abuse suppresses exactly the reports that matter most.
 *
 * The reasons mirror `reportReasonEnum`; the ones carrying real-world urgency
 * are listed first because a reporter scanning this list is often not calm.
 */
const REASONS = [
  { value: "csam", label: "A minor appears in this" },
  { value: "non_consensual", label: "Posted without consent" },
  { value: "underage", label: "The creator may be underage" },
  { value: "violence", label: "Violence or abuse" },
  { value: "copyright", label: "My copyrighted work" },
  { value: "impersonation", label: "Impersonation" },
  { value: "spam", label: "Spam or a scam" },
  { value: "other", label: "Something else" },
] as const;

export function ReportSheet({
  postId,
  open,
  onClose,
}: {
  postId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset when reopened so a previous report's state doesn't leak into the next.
  useEffect(() => {
    if (open) {
      setReason("");
      setDetail("");
      setDone(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  async function submit() {
    if (!reason) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, reason, detail: detail.trim() || undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not send the report");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button
        type="button"
        aria-label="Close report"
        className="absolute inset-0 cursor-default bg-black/55"
        style={{ animation: "vscrim .2s ease both" }}
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        className="bg-surface border-hairline relative max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-card border-t px-5 pb-6 pt-5 text-text shadow-card"
        style={{ animation: "vrise .24s var(--ease-veil) both" }}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="report-title" className="flex items-center gap-2 text-[22px] font-bold">
            <Flag size={19} className="text-primary" /> Report
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-muted hover:text-text flex size-10 shrink-0 items-center justify-center"
          >
            <X size={22} />
          </button>
        </div>

        {done ? (
          <div className="py-6 text-center">
            <CheckCircle2 size={40} className="text-success mx-auto" />
            <p className="mt-3 text-[16px] font-semibold">Report sent</p>
            <p className="text-muted mx-auto mt-2 max-w-xs text-[14px] leading-[1.6]">
              A person reviews every report. We won&apos;t tell the creator who
              reported them.
            </p>
            <Button variant="secondary" onClick={onClose} className="mt-6 w-full">
              DONE
            </Button>
          </div>
        ) : (
          <>
            <p className="text-muted text-[14px] leading-[1.6]">
              Tell us what&apos;s wrong. You don&apos;t need an account, and the
              creator won&apos;t know who reported them.
            </p>

            <div className="mt-4 space-y-1.5">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={`flex w-full items-center rounded-md border px-4 py-3 text-left text-[14.5px] transition-colors ${
                    reason === r.value
                      ? "border-primary bg-primary-tint text-primary font-semibold"
                      : "border-hairline bg-surface-2 text-text hover:bg-surface-3"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <label className="mt-4 block">
              <span className="text-faint text-[12px] font-bold uppercase tracking-[0.04em]">
                Anything else? (optional)
              </span>
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                rows={3}
                maxLength={2000}
                className="bg-surface-2 border-hairline text-text mt-2 w-full resize-none rounded-md border px-4 py-3 text-[14.5px] outline-none focus:border-primary"
              />
            </label>

            {error && (
              <p className="text-danger mt-3 text-[14px] font-semibold" role="alert">
                {error}
              </p>
            )}

            <Button
              onClick={submit}
              loading={submitting}
              disabled={!reason || submitting}
              className="mt-5 w-full"
            >
              SEND REPORT
            </Button>
          </>
        )}
      </section>
    </div>
  );
}
