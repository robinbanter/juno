"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowDownLeft,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  ShoppingBag,
} from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { EmptyState as AppEmptyState } from "@/components/EmptyState";
import { useAppAuth } from "@/components/useAppAuth";
import { algoAddressUrl, algoAssetUrl, algoTxUrl } from "@/lib/constants";

type Account = {
  availableBalance: string;
  tempoWalletAddress: string | null;
};

type DepositAddress = {
  address: string;
  assetId: number;
  asset: string;
  network: "mainnet" | "testnet";
  ready: boolean;
  reason?: string;
};

type Deposit = {
  txid: string;
  amount: string;
  from: string;
  at: string | null;
};

type Tab = "deposit" | "history";

function money(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function truncate(address: string, lead = 6, tail = 6) {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

export default function AddFundsPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAppAuth();
  const [tab, setTab] = useState<Tab>("deposit");
  const [account, setAccount] = useState<Account | null>(null);
  const [deposit, setDeposit] = useState<DepositAddress | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [qr, setQr] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAccount = useCallback(async () => {
    const res = await fetch("/api/account", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { account: Account };
    setAccount(body.account);
  }, []);

  const refreshDeposits = useCallback(async () => {
    const res = await fetch("/api/account/deposits", { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { deposits?: Deposit[] };
    setDeposits(body.deposits ?? []);
  }, []);

  // Provisioning the address (seed ALGO for gas + opt in to USDC) is what makes
  // the wallet able to receive at all, so it runs on open rather than behind a tap.
  const prepareAddress = useCallback(async () => {
    setPreparing(true);
    setError(null);
    try {
      const res = await fetch("/api/account/deposit-address", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as DepositAddress & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not prepare your deposit address");
      setDeposit(body);
      if (!body.ready) {
        setError(
          body.reason ??
            "Your wallet isn't ready to receive yet. Try again in a moment.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare your deposit address");
    } finally {
      setPreparing(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }
    void refreshAccount();
    void refreshDeposits();
    void prepareAddress();
  }, [isLoaded, isSignedIn, router, refreshAccount, refreshDeposits, prepareAddress]);

  // Only render a QR once the wallet can actually receive — a QR for a wallet
  // that would bounce the transfer is worse than no QR.
  useEffect(() => {
    if (!deposit?.address || !deposit.ready) {
      setQr(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(deposit.address, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr(null); // the address text below is the source of truth
      });
    return () => {
      cancelled = true;
    };
  }, [deposit?.address, deposit?.ready]);

  // Deposits land when the user's own wallet sends them, so there's no callback
  // to wait on — poll while the tab is open and visible.
  useEffect(() => {
    if (!isSignedIn) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void refreshAccount();
      void refreshDeposits();
    };
    const id = window.setInterval(tick, 12_000);
    return () => window.clearInterval(id);
  }, [isSignedIn, refreshAccount, refreshDeposits]);

  async function copyAddress() {
    if (!deposit?.address) return;
    try {
      await navigator.clipboard.writeText(deposit.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Couldn't copy — select the address and copy it manually.");
    }
  }

  const networkLabel = deposit?.network === "mainnet" ? "Algorand MainNet" : "Algorand TestNet";

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
          <h1 className="flex-1 text-xl font-bold leading-none">Add funds</h1>
        </div>

        <div className="border-hairline border-t">
          <div className="mx-auto flex h-[48px] w-full max-w-md overflow-hidden px-[18px]">
            <TabButton active={tab === "deposit"} onClick={() => setTab("deposit")}>
              DEPOSIT
            </TabButton>
            <TabButton active={tab === "history"} onClick={() => setTab("history")}>
              HISTORY
            </TabButton>
          </div>
        </div>
      </header>

      <section className="mx-auto min-h-[calc(100dvh-104px)] w-full max-w-md flex-1 pb-28">
        {tab === "deposit" && (
          <div key="deposit" className="tab-panel">
            <section className="border-hairline px-[18px] py-6">
              <div className="tabular text-[28px] font-bold leading-none">
                {money(account?.availableBalance ?? "0")}
              </div>
              <div className="text-muted mt-2 text-[15px] leading-none">
                Your USDC balance
              </div>
            </section>

            <section className="border-hairline border-y px-[18px] py-6">
              <div className="flex items-center justify-between">
                <h2 className="text-faint text-[13px] font-bold tracking-[0.04em]">
                  DEPOSIT USDC
                </h2>
                <span className="bg-surface-2 border-hairline text-muted rounded-pill border px-2.5 py-1 text-[11.5px] font-semibold">
                  {networkLabel}
                </span>
              </div>

              <p className="text-muted mt-2 text-[14px] leading-snug">
                Send USDC to the address below from any Algorand wallet or exchange.
                It shows up in your balance automatically — no card needed.
              </p>

              {preparing ? (
                <div className="mt-6 flex min-h-[240px] flex-col items-center justify-center gap-3">
                  <Loader2 size={26} className="text-primary animate-spin" />
                  <p className="text-muted text-[14px]">Preparing your wallet…</p>
                </div>
              ) : deposit?.ready ? (
                <>
                  <div className="mt-5 flex justify-center">
                    <div className="rounded-2xl bg-white p-3">
                      {qr ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={qr}
                          alt={`QR code for your USDC deposit address ${deposit.address}`}
                          className="size-[190px]"
                        />
                      ) : (
                        <div className="flex size-[190px] items-center justify-center">
                          <Loader2 size={22} className="animate-spin text-black/40" />
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={copyAddress}
                    className="bg-surface-2 border-hairline hover:bg-surface-3 mt-5 flex w-full items-center gap-3 rounded-md border px-4 py-3.5 text-left transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-faint text-[12px] font-bold uppercase tracking-[0.04em]">
                        Your deposit address
                      </div>
                      <div className="tabular mt-1 truncate text-[14px] font-semibold">
                        {deposit.address}
                      </div>
                    </div>
                    <span className="text-muted shrink-0">
                      {copied ? (
                        <Check size={18} className="text-success" />
                      ) : (
                        <Copy size={18} />
                      )}
                    </span>
                  </button>

                  <div className="mt-3 flex min-h-[76px] items-start gap-3 rounded-md border border-gold/35 bg-gold/10 px-4 py-3">
                    <AlertTriangle size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-gold" />
                    <p className="flex-1 text-[13.5px] leading-[1.55]">
                      Send only <span className="font-semibold">USDC on {networkLabel}</span>{" "}
                      (asset{" "}
                      <a
                        href={algoAssetUrl(deposit.assetId)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:text-primary-hover font-semibold"
                      >
                        {deposit.assetId}
                      </a>
                      ). Anything else — another chain, another asset — is lost
                      forever.
                    </p>
                  </div>

                  <a
                    href={algoAddressUrl(deposit.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted hover:text-text mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold"
                  >
                    View on explorer <ExternalLink size={13} />
                  </a>
                </>
              ) : (
                <div className="mt-5 flex min-h-[76px] items-start gap-3 rounded-md border border-danger/35 bg-danger/10 px-4 py-3">
                  <AlertTriangle size={22} strokeWidth={2} className="mt-0.5 shrink-0 text-danger" />
                  <div className="flex-1">
                    <p className="text-[14.5px] leading-[1.55]">
                      {error ?? "Your wallet isn't ready to receive USDC yet."}
                    </p>
                    <button
                      type="button"
                      onClick={() => void prepareAddress()}
                      className="text-primary hover:text-primary-hover mt-1.5 text-[14px] font-semibold"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </section>

            {deposit?.ready && error && (
              <p className="text-danger px-[18px] pt-4 text-[13.5px] font-semibold" role="alert">
                {error}
              </p>
            )}

            <section className="px-[18px] py-7">
              <h2 className="text-faint text-[13px] font-bold tracking-[0.04em]">
                NO USDC YET?
              </h2>
              <p className="text-muted mt-2 text-[14px] leading-[1.6]">
                {deposit?.network === "mainnet" ? (
                  <>
                    Buy USDC on any exchange that supports the Algorand network
                    (Coinbase, Kraken, or Pera&apos;s in-app buy), then withdraw it
                    to the address above. Double-check the network is Algorand at
                    withdrawal time.
                  </>
                ) : (
                  <>
                    This is TestNet, so the USDC isn&apos;t real money — get free
                    test USDC from{" "}
                    <a
                      href="https://faucet.circle.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:text-primary-hover font-semibold"
                    >
                      Circle&apos;s faucet
                    </a>{" "}
                    (pick &ldquo;Algorand Testnet&rdquo;) and send it to the address
                    above to try the flow end to end.
                  </>
                )}
              </p>
            </section>
          </div>
        )}

        {tab === "history" && (
          <div key="history" className="tab-panel">
            <DepositList deposits={deposits} />
          </div>
        )}
      </section>

      <BottomNav />
    </main>
  );
}

function TabButton({
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
      className="relative flex h-full min-w-[126px] items-center justify-center overflow-hidden whitespace-nowrap text-[13px] font-bold tracking-[0.02em]"
      style={{ color: active ? "var(--text)" : "var(--faint)" }}
    >
      {children}
      {active && <span className="bg-primary absolute inset-x-0 bottom-0 h-1" />}
    </button>
  );
}

function DepositList({ deposits }: { deposits: Deposit[] }) {
  if (deposits.length === 0) {
    return (
      <div className="flex min-h-[520px] items-center justify-center text-center">
        <AppEmptyState
          icon={ShoppingBag}
          title="No deposits yet"
          body="USDC you send to your wallet will show up here."
        />
      </div>
    );
  }

  return (
    <div className="px-[18px] py-8">
      {deposits.map((d) => (
        <a
          key={d.txid}
          href={algoTxUrl(d.txid)}
          target="_blank"
          rel="noreferrer"
          className="border-hairline flex min-h-[64px] items-center gap-3 border-b py-3"
        >
          <span className="bg-surface-2 text-success flex size-10 shrink-0 items-center justify-center rounded-md">
            <ArrowDownLeft size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">USDC deposit</div>
            <div className="text-faint mt-0.5 text-[12px]">
              {d.at ? shortDate(d.at) : "Confirming"} · from {truncate(d.from)}
            </div>
          </div>
          <div className="tabular text-[15px] font-semibold text-text">
            +{money(d.amount)}
          </div>
        </a>
      ))}
    </div>
  );
}
