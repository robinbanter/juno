"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  X,
  ArrowUpRight,
  ScrollText,
  ShieldCheck,
  Trash2,
  User,
  Layers,
  Settings as SettingsIcon,
  CreditCard,
  Building2,
  HelpCircle,
  Moon,
  LogOut,
  ChevronRight,
  KeyRound,
  Smartphone,
  Wallet,
} from "lucide-react";
import { useTheme } from "./useTheme";
import {
  useAppAuth,
  useAppSignOut,
  useAppUser,
  useCustodialWalletAddress,
} from "./useAppAuth";
import { WalletModal } from "./WalletModal";
import { DeleteAccountSheet } from "./DeleteAccountSheet";
import { usePasskeyEnrollment } from "./usePasskeyEnrollment";
import { useInstallPrompt } from "./useInstallPrompt";

export function SettingsDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { theme, toggle } = useTheme();
  const { isSignedIn } = useAppAuth();
  const signOut = useAppSignOut();
  const { user } = useAppUser();
  const { canInstall, promptInstall } = useInstallPrompt();
  const [walletOpen, setWalletOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // The user's custodial Algorand wallet — the single wallet shown everywhere:
  // it holds the balance, so its address + on-chain holdings + the app balance
  // all refer to the same account.
  const algoAddress = useCustodialWalletAddress();

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  const isLight = theme === "light";
  const identity = isSignedIn
    ? user?.primaryEmailAddress?.emailAddress || user?.fullName || "Signed in"
    : "Not signed in";

  return (
    <>
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default"
        style={{ background: "rgba(4,3,5,.55)", animation: "vscrim .2s ease both" }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="bg-surface fixed inset-y-0 right-0 z-50 flex w-[328px] max-w-[85vw] flex-col overscroll-contain"
        style={{
          animation: "vdrawer .24s cubic-bezier(.22,1,.36,1) both",
          boxShadow: "-20px 0 60px rgba(0,0,0,.5)",
        }}
      >
        {/* Header */}
        <div
          className="border-hairline border-b px-5 pb-[18px]"
          // `pt-safe` (a custom utility) was clobbering Tailwind's `pt-6`, collapsing
          // the intended 24px top padding to the bare safe-area inset (0 in a browser),
          // which jammed the avatar against the top edge. Keep the design's 24px while
          // still clearing the notch on devices whose inset exceeds it.
          style={{ paddingTop: "max(24px, calc(env(safe-area-inset-top, 0px) + 12px))" }}
        >
          <div className="flex items-start justify-between">
            <div className="relative size-[52px]">
              <div
                className="size-[52px] rounded-full"
                style={{ background: "conic-gradient(from 120deg,#3a3640,#1c1a22)" }}
              />
              <span
                className="absolute right-0 bottom-0 size-[13px] rounded-full"
                style={{ background: "var(--success)", border: "2px solid var(--surface)" }}
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-muted hover:text-text flex size-[34px] items-center justify-center"
              aria-label="Close"
            >
              <X size={22} />
            </button>
          </div>
          <div className="mt-3 text-lg font-bold">{user?.fullName || "You"}</div>
          <div className="text-faint mt-0.5 truncate text-[13px]">{identity}</div>

          {/* Generated Algorand wallet — tap to open the wallet panel. */}
          {algoAddress && (
            <button
              type="button"
              onClick={() => setWalletOpen(true)}
              title="Open wallet"
              className="bg-surface-2 border-hairline text-muted hover:text-text mt-3 inline-flex max-w-full items-center gap-2 rounded-pill border px-3 py-1.5"
            >
              <Wallet size={14} className="text-primary shrink-0" />
              <span className="font-mono text-[12.5px] tracking-tight">
                {`${algoAddress.slice(0, 6)}…${algoAddress.slice(-6)}`}
              </span>
              <ChevronRight size={14} className="text-faint shrink-0" />
            </button>
          )}
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto py-2">
          <Row icon={User} label="My profile" href="/profile" onNavigate={onClose} />
          <Row icon={Layers} label="Collection" href="/collection" onNavigate={onClose} />
          <PasskeyRow />
          <Divider />
          <Row
            icon={CreditCard}
            label="Add funds"
            href="/add-funds"
            onNavigate={onClose}
          />
          <Row
            icon={ArrowUpRight}
            label="Withdraw"
            href="/withdraw"
            onNavigate={onClose}
          />
          <Row icon={Building2} label="Become a creator" href="/new" onNavigate={onClose} />
          <Row
            icon={ShieldCheck}
            label="Age & consent records"
            href="/records"
            onNavigate={onClose}
          />
          <Divider />
          <Row
            icon={HelpCircle}
            label="Help and support"
            href="/legal/compliance"
            onNavigate={onClose}
          />
          <Row
            icon={ScrollText}
            label="Compliance & reporting"
            href="/legal/compliance"
            onNavigate={onClose}
          />

          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggle}
            className="flex w-full items-center gap-3.5 px-[22px] py-3.5 text-left"
          >
            <Moon size={21} strokeWidth={1.8} className="text-muted" />
            <span className="flex-1 text-[15px] font-medium">
              {isLight ? "Light mode" : "Dark mode"}
            </span>
            <span
              className="relative h-6 w-[42px] rounded-pill transition-colors"
              style={{ background: isLight ? "var(--primary)" : "var(--surface-3)" }}
            >
              <span
                className="absolute top-0.5 size-5 rounded-full bg-white transition-[left]"
                style={{ left: isLight ? 20 : 2, boxShadow: "0 1px 3px rgba(0,0,0,.3)" }}
              />
            </span>
          </button>

          {/* PWA install — only shown when the browser offers it (Add to Home
              Screen used to be a floating banner; it now lives here). */}
          {canInstall && (
            <button
              type="button"
              onClick={promptInstall}
              className="flex w-full items-center gap-3.5 px-[22px] py-3.5 text-left"
            >
              <Smartphone size={21} strokeWidth={1.8} className="text-muted" />
              <span className="text-[15px] font-medium">Add to Home Screen</span>
            </button>
          )}
          <Divider />
          <button
            type="button"
            onClick={() => {
              void signOut({ redirectUrl: "/" });
              onClose();
            }}
            className="flex w-full items-center gap-3.5 px-[22px] py-3.5 text-left"
          >
            <LogOut size={21} strokeWidth={1.8} className="text-muted" />
            <span className="text-[15px] font-medium">Log out</span>
          </button>
          {isSignedIn && (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="flex w-full items-center gap-3.5 px-[22px] py-3.5 text-left"
            >
              <Trash2 size={21} strokeWidth={1.8} className="text-danger" />
              <span className="text-danger text-[15px] font-medium">Delete account</span>
            </button>
          )}
        </div>
      </aside>

      <WalletModal
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        address={algoAddress}
      />

      <DeleteAccountSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </>
  );
}

function Divider() {
  return <div className="bg-hairline mx-[22px] my-2 h-px" />;
}

// Security row. Only rendered for real Clerk users — dev-auth accounts and
// signed-out visitors produce neither `hasPasskey` nor `canEnroll`.
function PasskeyRow() {
  const { hasPasskey, canEnroll, isPending, error, enrollPasskey } =
    usePasskeyEnrollment();

  if (!hasPasskey && !canEnroll) return null;

  return (
    <div className="flex w-full items-center gap-3.5 px-[22px] py-3.5">
      <KeyRound size={21} strokeWidth={1.8} className="text-muted" />
      <div className="min-w-0 flex-1">
        <span className="text-[15px] font-medium">Passkey</span>
        {error && <p className="text-danger mt-0.5 text-[12px]">{error}</p>}
      </div>
      {hasPasskey ? (
        <span
          className="text-[12.5px] font-semibold"
          style={{ color: "var(--success)" }}
        >
          Connected
        </span>
      ) : (
        <div className="flex items-center gap-2.5">
          <span className="text-faint text-[12.5px] font-medium">Recommended</span>
          <button
            type="button"
            onClick={enrollPasskey}
            disabled={isPending}
            className="bg-primary text-primary-fg rounded-pill px-3 py-1.5 text-[12.5px] font-bold disabled:opacity-60"
          >
            {isPending ? "…" : "Add"}
          </button>
        </div>
      )}
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  hint,
  href,
  onNavigate,
}: {
  icon: typeof User;
  label: string;
  hint?: string;
  href?: string;
  onNavigate?: () => void;
}) {
  const inner = (
    <>
      <Icon size={21} strokeWidth={1.8} className="text-muted" />
      <span className="text-[15px] font-medium">
        {label}
        {hint && <span className="text-faint font-normal"> {hint}</span>}
      </span>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className="flex items-center gap-3.5 px-[22px] py-3.5"
      >
        {inner}
      </Link>
    );
  }
  // No href and no action = a row that silently does nothing when tapped. Four
  // of these shipped ("Collections", "Settings", "Become a creator", "Help").
  // Fail loudly in development instead of quietly in front of a user.
  if (process.env.NODE_ENV !== "production") {
    throw new Error(`SettingsDrawer Row "${label}" has no href — it would render a dead button`);
  }
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3.5 px-[22px] py-3.5 text-left"
    >
      {inner}
    </button>
  );
}
