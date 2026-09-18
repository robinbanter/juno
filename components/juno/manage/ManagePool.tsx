"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ExternalLink, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { cluster, explorer } from "@/lib/juno/cluster";
import { quoteAmount, shortAddress, tokenAmount } from "@/lib/juno/format";
import {
  claimCreatorFees,
  dammPoolExists,
  graduatePool,
  readIssuerState,
  type ClaimReceipt,
  type GraduationReceipt,
  type IssuerState,
} from "@/lib/juno/issuer";
import { CurveChart } from "../coin/CurveChart";
import { FeeDecayChart } from "../coin/EconomicsPanel";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { describeError } from "../wallet/useLaunch";

/**
 * Re-read cadence. The curve only moves when someone trades, and the public
 * devnet RPC 429s anything chattier; the fee countdown ticks locally between
 * reads so the one number that moves every second does not need the chain.
 */
const POLL_MS = 30_000;

type Busy = "idle" | "claiming" | "migrating";

/**
 * The creator's Manage view: monitor the pool, claim fees, graduate it.
 *
 * Reads through `readIssuerState` and acts through `claimCreatorFees` /
 * `graduatePool` — the same functions `juno:inspect`, `juno:claim` and
 * `juno:graduate` call from the CLI. Only the signer differs.
 *
 * The monitor is public chain data and renders for anyone; the actions render
 * only for the wallet the pool account names as its creator, which is the
 * only key the program would accept for a claim anyway.
 */
export function ManagePool({
  pool,
  symbol,
  quoteSymbol,
  launchPreset,
}: {
  pool: string;
  symbol: string;
  quoteSymbol: string;
  /** The preset the registry recorded at launch, checked against the chain. */
  launchPreset: string;
}) {
  const { publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();

  const [state, setState] = useState<IssuerState | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [claim, setClaim] = useState<ClaimReceipt | null>(null);
  const [graduation, setGraduation] = useState<GraduationReceipt | null>(null);
  const [dammLive, setDammLive] = useState<boolean | null>(null);

  const refresh = useCallback(
    async (fresh = false) => {
      setLoading(true);
      try {
        const next = await readIssuerState(pool, { fresh });
        if (next) {
          setState(next);
          setReadError(null);
        } else {
          setReadError("The pool account is not readable on this cluster.");
        }
      } catch (error) {
        setReadError(describeError(error));
      } finally {
        setLoading(false);
      }
    },
    [pool],
  );

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Once migrated, check the DAMM v2 account really exists before linking it
  // as a live pool rather than a derived address.
  const dammPool = state?.graduated ? state.dammPool : null;
  useEffect(() => {
    if (!dammPool) return;
    dammPoolExists(dammPool).then(setDammLive, () => setDammLive(null));
  }, [dammPool]);

  const isCreator = Boolean(state && publicKey?.toBase58() === state.creator);

  async function run(kind: Exclude<Busy, "idle">) {
    if (!publicKey || !signTransaction) {
      setVisible(true);
      return;
    }
    setActionError(null);
    setBusy(kind);
    try {
      if (kind === "claiming") {
        setClaim(await claimCreatorFees({ pool, creator: publicKey, signTransaction }));
      } else {
        setGraduation(await graduatePool({ pool, payer: publicKey, signTransaction }));
      }
      await refresh(true);
    } catch (error) {
      setActionError(describeError(error));
    } finally {
      setBusy("idle");
    }
  }

  if (!state) {
    return readError ? (
      <p role="alert" className="rounded-j border border-j-danger/40 bg-j-danger/10 px-3 py-2 text-[13px] text-j-danger">
        {readError}
      </p>
    ) : (
      <div className="grid gap-4 lg:grid-cols-2" aria-busy="true">
        <Skeleton className="h-56 rounded-j-lg" />
        <Skeleton className="h-56 rounded-j-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 text-[12px] text-j-muted">
        <span>
          Read from {cluster()} at{" "}
          <time dateTime={new Date(state.readAt).toISOString()}>
            {new Date(state.readAt).toLocaleTimeString()}
          </time>
          {readError && <span className="ml-2 text-j-danger">· last refresh failed: {readError}</span>}
        </span>
        <button
          type="button"
          onClick={() => void refresh(true)}
          disabled={loading}
          className="flex items-center gap-1 hover:text-j-ink disabled:opacity-50"
        >
          <RefreshCw size={12} className={cn(loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CurveCard state={state} quoteSymbol={quoteSymbol} symbol={symbol} />
        <FeeCard state={state} />
      </div>

      <PresetCard state={state} launchPreset={launchPreset} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Creator trading fees">
          <Row label="Claimable now">
            {state.claimable ? (
              <>
                {quoteAmount(state.claimable.quote, 9)} {quoteSymbol}
                {state.claimable.base > 0 && (
                  <span className="ml-1 text-j-muted">
                    + {tokenAmount(state.claimable.base)} {symbol}
                  </span>
                )}
              </>
            ) : (
              <span className="text-j-faint">unreadable — the RPC refused the metrics read</span>
            )}
          </Row>
          <div className="mt-1.5" />
          <Row label="Paid to">{shortAddress(state.creator, 6, 6)} (pool creator)</Row>

          <CreatorGate isCreator={isCreator} connected={Boolean(publicKey)} creator={state.creator} onConnect={() => setVisible(true)}>
            <Button
              variant="buy"
              size="md"
              className="mt-3 w-full"
              disabled={
                busy !== "idle" ||
                !state.claimable ||
                (state.claimable.quote <= 0 && state.claimable.base <= 0)
              }
              onClick={() => void run("claiming")}
            >
              {busy === "claiming" ? "Claiming…" : "Claim fees"}
            </Button>
          </CreatorGate>

          {claim && (
            <Receipt signature={claim.signature} title="Fees claimed">
              {claim.claimed
                ? `${quoteAmount(claim.claimed.quote, 9)} ${quoteSymbol} moved to your wallet.`
                : `Up to ${quoteAmount(claim.requested.quote, 9)} ${quoteSymbol}; the post-claim read failed, so the exact figure is on the explorer.`}
            </Receipt>
          )}
        </Card>

        <Card title="Graduation">
          <Row label="Status">
            {state.graduated ? (
              <span className="text-j-pos">Migrated to DAMM v2</span>
            ) : state.readyToGraduate ? (
              <span className="text-j-brand">Curve complete — ready to migrate</span>
            ) : (
              <span>On the curve · {(state.progress * 100).toFixed(4)}%</span>
            )}
          </Row>
          <div className="mt-1.5" />
          <Row label="DAMM v2 fee tier">
            option {state.migrationFeeOption}
            {state.dammConfig && (
              <a href={explorer.account(state.dammConfig)} target="_blank" rel="noreferrer noopener" className="ml-1 inline-flex items-center gap-0.5 text-j-muted hover:text-j-ink">
                config <ExternalLink size={10} />
              </a>
            )}
          </Row>

          {state.graduated && state.dammPool ? (
            <a
              href={explorer.account(state.dammPool)}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-3 flex items-center justify-between rounded-j border border-j-pos/40 bg-j-pos/10 px-3 py-2 text-[13px] font-semibold text-j-pos hover:underline"
            >
              <span>DAMM v2 pool {shortAddress(state.dammPool, 6, 6)}</span>
              <span className="flex items-center gap-1 text-[12px] font-normal text-j-muted">
                {dammLive === false ? "account not found" : "Solscan"}
                <ExternalLink size={11} />
              </span>
            </a>
          ) : (
            <CreatorGate isCreator={isCreator} connected={Boolean(publicKey)} creator={state.creator} onConnect={() => setVisible(true)}>
              <Button
                variant="contrast"
                size="md"
                className="mt-3 w-full"
                disabled={busy !== "idle" || !state.readyToGraduate}
                onClick={() => void run("migrating")}
              >
                {busy === "migrating" ? "Migrating…" : "Migrate to DAMM v2"}
              </Button>
              {!state.readyToGraduate && (
                <p className="mt-2 text-[12px] text-j-faint">
                  Opens when the curve holds {quoteAmount(state.migrationThreshold, 4)} {quoteSymbol}.
                  The program rejects an earlier migration.
                </p>
              )}
            </CreatorGate>
          )}

          {graduation && (
            <Receipt signature={graduation.signature} title="Migrated">
              Liquidity moved into DAMM v2 pool {shortAddress(graduation.dammPool, 6, 6)}.
            </Receipt>
          )}
        </Card>
      </div>

      {actionError && (
        <p role="alert" className="rounded-j border border-j-danger/40 bg-j-danger/10 px-3 py-2 text-[13px] text-j-danger">
          {actionError}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CurveCard({ state, quoteSymbol, symbol }: { state: IssuerState; quoteSymbol: string; symbol: string }) {
  const pct = Math.min(1, Math.max(0, state.progress));
  return (
    <Card title="Curve progress">
      <div className="flex items-baseline justify-between">
        <span className="text-[28px] font-semibold tabular-nums">{(pct * 100).toFixed(pct < 0.01 ? 4 : 2)}%</span>
        <span className="text-[12px] text-j-muted">toward migrationQuoteThreshold</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
        aria-label="Curve progress toward migration"
        className="mt-2 h-2 overflow-hidden rounded-full bg-j-line-strong"
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct * 100}%`,
            backgroundImage: "var(--j-curve)",
            backgroundSize: `${pct > 0 ? 100 / pct : 100}% 100%`,
          }}
        />
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        <Row label="Quote reserve">{quoteAmount(state.quoteReserve, 6)} {quoteSymbol}</Row>
        <Row label="Migration threshold">{quoteAmount(state.migrationThreshold, 6)} {quoteSymbol}</Row>
        <Row label="Price">{significant(state.price)} {quoteSymbol} / {symbol}</Row>
        <Row label="Left on the curve">{tokenAmount(state.baseReserve)} {symbol}</Row>
      </div>
    </Card>
  );
}

function FeeCard({ state }: { state: IssuerState }) {
  const fee = state.fee;
  // The schedule is a pure function of time since activation, so the
  // countdown can tick locally between chain reads.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!fee || fee.secondsRemaining === 0 || state.graduated) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fee, state.graduated]);

  if (!fee) {
    return (
      <Card title="Fee schedule">
        <p className="text-[13px] text-j-muted">This config has no fee scheduler Juno can read.</p>
      </Card>
    );
  }

  const remaining = Math.max(0, fee.secondsRemaining - Math.floor((now - state.readAt) / 1000));

  return (
    <Card title="Fee schedule">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Opening" value={bps(fee.startBps)} />
        <Stat label="Now" value={bps(fee.currentBps)} strong />
        <Stat label="Floor" value={bps(fee.endBps)} />
      </div>
      <p className="mt-3 text-[12px] text-j-muted">
        Period {fee.period} of {fee.totalPeriods} ({fee.mode} decay).{" "}
        {state.graduated ? (
          <span>The curve is closed; trades now pay the DAMM v2 pool&apos;s fee, not this schedule.</span>
        ) : remaining === 0 ? (
          <span>At the floor — the anti-snipe window has closed.</span>
        ) : (
          <span className="text-j-brand">{duration(remaining)} until the floor.</span>
        )}
      </p>
      <FeeDecayChart fee={fee} className="mt-3 h-[64px]" />
    </Card>
  );
}

function PresetCard({ state, launchPreset }: { state: IssuerState; launchPreset: string }) {
  const weights = state.shape.points.map((p) => p.weight);
  const mismatch = state.preset && state.preset.id !== launchPreset;
  return (
    <Card title="Curve preset">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[18px] font-semibold">
          {state.preset ? state.preset.label : "Not a Juno preset"}
        </span>
        <span className="text-[12px] text-j-muted">
          matched from the on-chain config · {weights.length} segments
        </span>
      </div>
      {state.preset && <p className="mt-1 text-[13px] text-j-muted">{state.preset.tagline}</p>}
      {mismatch && (
        <p className="mt-1 text-[12px] text-j-danger">
          The registry recorded “{launchPreset}”, but the chain holds “{state.preset!.id}”.
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <figure>
          <figcaption className="mb-1 text-[12px] text-j-muted">Liquidity weight per segment</figcaption>
          <div className="flex h-24 items-end gap-[3px]" role="img" aria-label={`Liquidity weights: ${weights.map((w) => w.toFixed(2)).join(", ")}`}>
            {weights.map((w, i) => (
              <div key={i} className="flex-1 rounded-t-sm bg-j-line-strong" style={{ height: `${Math.max(2, w * 100)}%` }} title={`Segment ${i + 1}: ${w.toFixed(3)}`} />
            ))}
          </div>
        </figure>
        <figure>
          <figcaption className="mb-1 text-[12px] text-j-muted">Price along supply (log scale), traded portion filled</figcaption>
          <CurveChart shape={state.shape} progress={state.progress} height={96} />
        </figure>
      </div>
    </Card>
  );
}

function CreatorGate({
  isCreator,
  connected,
  creator,
  onConnect,
  children,
}: {
  isCreator: boolean;
  connected: boolean;
  creator: string;
  onConnect: () => void;
  children: React.ReactNode;
}) {
  if (isCreator) return <>{children}</>;
  return (
    <p className="mt-3 rounded-j border border-j-line px-3 py-2 text-[12px] text-j-muted">
      {connected ? "The connected wallet is not this pool's creator. " : ""}
      Only {shortAddress(creator, 6, 6)} can act on this pool.{" "}
      {!connected && (
        <button type="button" onClick={onConnect} className="font-semibold text-j-ink hover:underline">
          Connect wallet
        </button>
      )}
    </p>
  );
}

function Receipt({ signature, title, children }: { signature: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-j border border-j-pos/40 bg-j-pos/10 px-3 py-2 text-[13px]">
      <p className="font-semibold text-j-pos">{title}</p>
      <p className="mt-0.5 text-j-muted">{children}</p>
      <a href={explorer.tx(signature)} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-1 text-[12px] hover:underline">
        {shortAddress(signature, 8, 8)} on Solscan
        <ExternalLink size={11} />
      </a>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-j-lg border border-j-line bg-j-surface p-4">
      <h2 className="mb-3 text-[14px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-j-muted">{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-j border border-j-line px-2 py-2">
      <div className="text-[11px] uppercase tracking-wide text-j-faint">{label}</div>
      <div className={cn("mt-0.5 tabular-nums", strong ? "text-[18px] font-semibold text-j-brand" : "text-[15px]")}>{value}</div>
    </div>
  );
}

function bps(value: number): string {
  return `${(value / 100).toFixed(2)}%`;
}

function significant(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  return value < 0.001 ? value.toExponential(4) : value.toPrecision(6);
}

function duration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}
