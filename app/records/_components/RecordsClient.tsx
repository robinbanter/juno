"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck, Clock, XCircle, Upload } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/Button";
import { useAppAuth } from "@/components/useAppAuth";

type Record = {
  id: string;
  status: "pending" | "verified" | "rejected";
  createdAt: string;
  verifiedAt: string | null;
};

const ID_TYPES = [
  { value: "passport", label: "Passport" },
  { value: "drivers_license", label: "Driver's licence" },
  { value: "national_id", label: "National ID card" },
] as const;

/**
 * Where a creator submits their §2257 age and consent records.
 *
 * This page is the difference between a gate and a lockout: publishing is
 * blocked without a verified record, so if there were no way to submit one the
 * requirement would just be a wall.
 */
export default function RecordsPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAppAuth();
  const [record, setRecord] = useState<Record | null>(null);
  const [loading, setLoading] = useState(true);

  const [legalName, setLegalName] = useState("");
  const [stageNames, setStageNames] = useState("");
  const [dob, setDob] = useState("");
  const [idType, setIdType] = useState<string>("passport");
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/account/records", { cache: "no-store" });
    if (res.ok) setRecord((await res.json()).record);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }
    void refresh();
  }, [isLoaded, isSignedIn, router, refresh]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("legalName", legalName.trim());
      if (stageNames.trim()) form.append("stageNames", stageNames.trim());
      form.append("dateOfBirth", dob);
      form.append("idDocumentType", idType);
      form.append("consent", String(consent));
      if (file) form.append("idDocument", file);

      const res = await fetch("/api/account/records", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not submit your records");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your records");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = legalName.trim() && dob && file && consent && !submitting;

  return (
    <main className="bg-bg text-text flex min-h-dvh flex-1 flex-col">
      <header className="bg-surface/80 border-hairline pt-safe sticky top-0 z-40 border-b backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-md items-center gap-3 px-[18px] py-3.5">
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.back()}
            className="text-muted hover:text-text -ml-2 flex size-[38px] items-center justify-center"
          >
            <ArrowLeft size={22} strokeWidth={2} />
          </button>
          <h1 className="flex-1 text-xl font-bold leading-none">Age &amp; consent records</h1>
        </div>
      </header>

      <section className="mx-auto w-full max-w-md flex-1 px-[18px] py-6 pb-28">
        {loading ? (
          <p className="text-muted text-[14px]">Loading…</p>
        ) : record ? (
          <StatusCard record={record} />
        ) : (
          <>
            <p className="text-muted text-[14.5px] leading-[1.7]">
              US law (18 U.S.C. §2257) requires us to keep proof of age and
              consent for everyone appearing in content on Norr. Submit yours once
              — a reviewer checks it, then you can publish.
            </p>
            <p className="text-faint mt-3 text-[13px] leading-[1.7]">
              Your ID is stored encrypted and private. It is only ever opened by a
              reviewer, never shown publicly, and never shared with other users.
            </p>

            <label className="mt-6 block">
              <span className="text-faint text-[12px] font-bold uppercase tracking-[0.04em]">
                Full legal name
              </span>
              <input
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                className="bg-surface-2 border-hairline text-text mt-2 h-[50px] w-full rounded-md border px-4 text-[16px] outline-none focus:border-primary"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-faint text-[12px] font-bold uppercase tracking-[0.04em]">
                Other names you perform under (optional)
              </span>
              <input
                value={stageNames}
                onChange={(e) => setStageNames(e.target.value)}
                placeholder="Comma separated"
                className="bg-surface-2 border-hairline text-text mt-2 h-[50px] w-full rounded-md border px-4 text-[16px] outline-none focus:border-primary"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-faint text-[12px] font-bold uppercase tracking-[0.04em]">
                Date of birth
              </span>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="bg-surface-2 border-hairline text-text mt-2 h-[50px] w-full rounded-md border px-4 text-[16px] outline-none focus:border-primary"
              />
            </label>

            <div className="mt-4">
              <span className="text-faint text-[12px] font-bold uppercase tracking-[0.04em]">
                ID document
              </span>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {ID_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setIdType(t.value)}
                    className={`h-11 rounded-md border text-[13px] font-semibold transition-colors ${
                      idType === t.value
                        ? "border-primary bg-primary-tint text-primary"
                        : "border-hairline bg-surface-2 text-text hover:bg-surface-3"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="bg-surface-2 border-hairline hover:bg-surface-3 mt-3 flex cursor-pointer items-center gap-3 rounded-md border px-4 py-4 transition-colors">
              <Upload size={20} className="text-primary shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[14.5px]">
                {file ? file.name : "Upload a photo of your ID"}
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>

            <label className="mt-4 flex items-start gap-3">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
              />
              <span className="text-[13.5px] leading-[1.6]">
                I confirm I am at least 18 years old, that this ID is mine, and
                that I consent to appearing in the content I publish on Norr.
              </span>
            </label>

            {error && (
              <p className="text-danger mt-4 text-[14px] font-semibold" role="alert">
                {error}
              </p>
            )}

            <Button onClick={submit} loading={submitting} disabled={!canSubmit} className="mt-5 w-full">
              SUBMIT RECORDS
            </Button>
          </>
        )}
      </section>

      <BottomNav />
    </main>
  );
}

function StatusCard({ record }: { record: Record }) {
  const map = {
    pending: {
      icon: Clock,
      tone: "text-gold",
      title: "Under review",
      body: "A reviewer is checking your records. You can publish as soon as they're verified — usually within a day.",
    },
    verified: {
      icon: ShieldCheck,
      tone: "text-success",
      title: "Verified",
      body: "Your records are on file. You can publish.",
    },
    rejected: {
      icon: XCircle,
      tone: "text-danger",
      title: "Not accepted",
      body: "We couldn't verify your records. Contact support to resubmit.",
    },
  }[record.status];

  const Icon = map.icon;
  return (
    <div className="bg-surface-2 border-hairline rounded-card border px-5 py-8 text-center">
      <Icon size={40} className={`mx-auto ${map.tone}`} />
      <p className="mt-3 text-[18px] font-bold">{map.title}</p>
      <p className="text-muted mx-auto mt-2 max-w-xs text-[14px] leading-[1.6]">{map.body}</p>
    </div>
  );
}
