"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck, ExternalLink } from "lucide-react";

/**
 * Operator console for reports and §2257 records.
 *
 * Auth is the same bearer secret the API uses, held in memory only — never
 * localStorage. An operator token grants takedown and can read government IDs;
 * persisting it in a place XSS can read would be a poor trade for skipping one
 * paste per session.
 *
 * Not linked from anywhere in the app on purpose. It isn't secret (the API is
 * the real boundary and fails closed), but there's no reason to advertise it.
 */
type Report = {
  id: string;
  reason: string;
  detail: string | null;
  status: string;
  createdAt: string;
  postId: string | null;
  postTitle: string | null;
  postTakenDownAt: string | null;
  creatorUsername: string | null;
};

type Record = {
  id: string;
  legalName: string;
  stageNames: string | null;
  dateOfBirth: string;
  idDocumentType: string;
  idDocumentUrl: string | null;
  status: string;
  createdAt: string;
  creatorUsername: string | null;
};

const URGENT = new Set(["csam", "underage", "non_consensual"]);

export default function ModerationConsole() {
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<"reports" | "records">("reports");
  const [reports, setReports] = useState<Report[]>([]);
  const [records, setRecords] = useState<Record[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const auth = useCallback(() => ({ authorization: `Bearer ${secret}` }), [secret]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [r, rec] = await Promise.all([
        fetch("/api/moderation/reports", { headers: auth(), cache: "no-store" }),
        fetch("/api/moderation/records", { headers: auth(), cache: "no-store" }),
      ]);
      // The API 404s rather than 403s so it isn't confirmed to a prober — which
      // means "wrong secret" and "no such route" look identical here too.
      if (!r.ok) throw new Error("Not authorised (or the secret is wrong)");
      setReports((await r.json()).reports ?? []);
      setRecords(rec.ok ? ((await rec.json()).records ?? []) : []);
      setAuthed(true);
    } catch (err) {
      setAuthed(false);
      setError(err instanceof Error ? err.message : "Could not load");
    }
  }, [auth]);

  useEffect(() => {
    if (authed) void load();
  }, [authed, load]);

  async function act(reportId: string, action: "takedown" | "dismiss") {
    setBusy(reportId);
    try {
      await fetch(`/api/moderation/reports/${reportId}`, {
        method: "PATCH",
        headers: { ...auth(), "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function review(recordId: string, action: "verify" | "reject") {
    setBusy(recordId);
    try {
      await fetch("/api/moderation/records", {
        method: "PATCH",
        headers: { ...auth(), "content-type": "application/json" },
        body: JSON.stringify({ recordId, action }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!authed) {
    return (
      <main className="bg-bg text-text flex min-h-dvh items-center justify-center px-5">
        <div className="bg-surface border-hairline w-full max-w-sm rounded-card border p-6">
          <h1 className="text-[20px] font-bold">Moderation</h1>
          <p className="text-muted mt-2 text-[14px] leading-[1.6]">
            Paste the operator secret. It is kept in memory for this tab only.
          </p>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            className="bg-surface-2 border-hairline text-text mt-4 h-[50px] w-full rounded-md border px-4 text-[15px] outline-none focus:border-primary"
          />
          {error && <p className="text-danger mt-3 text-[13.5px] font-semibold">{error}</p>}
          <button
            type="button"
            onClick={load}
            disabled={!secret}
            className="bg-primary text-primary-fg mt-4 h-12 w-full rounded-pill text-[15px] font-semibold disabled:opacity-50"
          >
            Open
          </button>
        </div>
      </main>
    );
  }

  const open = reports.filter((r) => r.status === "open");

  return (
    <main className="bg-bg text-text min-h-dvh">
      <div className="mx-auto w-full max-w-3xl px-[18px] py-8">
        <h1 className="text-[24px] font-bold">Moderation</h1>
        <div className="mt-4 flex gap-2">
          <Tab active={tab === "reports"} onClick={() => setTab("reports")}>
            Reports ({open.length})
          </Tab>
          <Tab active={tab === "records"} onClick={() => setTab("records")}>
            §2257 records ({records.length})
          </Tab>
        </div>

        {tab === "reports" && (
          <div className="mt-6 space-y-2">
            {open.length === 0 && <Empty>No open reports.</Empty>}
            {open.map((r) => (
              <div
                key={r.id}
                className={`border-hairline rounded-md border px-4 py-4 ${
                  URGENT.has(r.reason) ? "border-danger/40 bg-danger/5" : "bg-surface-2"
                }`}
              >
                <div className="flex items-center gap-2">
                  {URGENT.has(r.reason) && <AlertTriangle size={16} className="text-danger" />}
                  <span className="text-[14px] font-bold uppercase tracking-wide">
                    {r.reason.replace(/_/g, " ")}
                  </span>
                  <span className="text-faint text-[12px]">
                    {new Date(r.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1.5 text-[14.5px]">
                  {r.postTitle ?? "(post gone)"}{" "}
                  {r.creatorUsername && (
                    <span className="text-faint">by @{r.creatorUsername}</span>
                  )}
                </div>
                {r.detail && (
                  <p className="text-muted mt-1 text-[13.5px] leading-[1.6]">{r.detail}</p>
                )}
                {r.postTakenDownAt && (
                  <p className="text-success mt-1 text-[12.5px] font-semibold">
                    Already taken down
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => act(r.id, "takedown")}
                    className="bg-danger h-9 rounded-pill px-4 text-[13px] font-bold text-white disabled:opacity-50"
                  >
                    Take down
                  </button>
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => act(r.id, "dismiss")}
                    className="bg-surface-3 border-hairline text-muted h-9 rounded-pill border px-4 text-[13px] font-bold disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "records" && (
          <div className="mt-6 space-y-2">
            {records.length === 0 && <Empty>No records awaiting review.</Empty>}
            {records.map((rec) => (
              <div key={rec.id} className="bg-surface-2 border-hairline rounded-md border px-4 py-4">
                <div className="text-[15px] font-semibold">{rec.legalName}</div>
                <div className="text-faint mt-0.5 text-[12.5px]">
                  {rec.creatorUsername ? `@${rec.creatorUsername}` : "—"} ·{" "}
                  DOB {new Date(rec.dateOfBirth).toLocaleDateString()} ·{" "}
                  {rec.idDocumentType.replace(/_/g, " ")}
                </div>
                {rec.stageNames && (
                  <div className="text-muted mt-1 text-[13px]">Also: {rec.stageNames}</div>
                )}
                {rec.idDocumentUrl && (
                  <a
                    href={rec.idDocumentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold"
                  >
                    Open ID <ExternalLink size={12} />
                    <span className="text-faint font-normal">(link expires in 5 min)</span>
                  </a>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy === rec.id}
                    onClick={() => review(rec.id, "verify")}
                    className="bg-success inline-flex h-9 items-center gap-1.5 rounded-pill px-4 text-[13px] font-bold text-black disabled:opacity-50"
                  >
                    <ShieldCheck size={14} /> Verify
                  </button>
                  <button
                    type="button"
                    disabled={busy === rec.id}
                    onClick={() => review(rec.id, "reject")}
                    className="bg-surface-3 border-hairline text-muted h-9 rounded-pill border px-4 text-[13px] font-bold disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-pill px-4 text-[13.5px] font-bold ${
        active ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted border-hairline border"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-faint py-10 text-center text-[14px]">{children}</p>;
}
