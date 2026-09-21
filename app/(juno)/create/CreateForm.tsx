"use client";

import { useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Clapperboard, ExternalLink, ImageIcon, LoaderCircle, Upload, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { CURVE_PRESET_LIST, CURVE_PRESETS } from "@/lib/juno/curves";
import { QUOTE_TOKENS } from "@/lib/juno/dbc";
import { usd } from "@/lib/juno/format";
import type { CoinFormat, CurvePresetId } from "@/lib/juno/types";
import { cluster, explorer, meteoraPoolUrl } from "@/lib/juno/cluster";
import { presetShape } from "@/lib/juno/curve-shape";
import { Button } from "@/components/juno/ui/Button";
import { CurveChart } from "@/components/juno/coin/CurveChart";
import { useLaunch } from "@/components/juno/wallet/useLaunch";

const FORMATS: Array<{ id: CoinFormat; label: string; hint: string; Icon: typeof ImageIcon }> = [
  { id: "post", label: "Post", hint: "Image or video, shown in the grid", Icon: ImageIcon },
  { id: "reel", label: "Reel", hint: "Vertical video, shown in the swipe feed", Icon: Clapperboard },
];

/**
 * The launch form.
 *
 * The curve preset is the consequential choice here, so it gets the most
 * space and each option states what it does to the market rather than naming
 * a shape. Format defaults to post; picking reel switches the default curve to
 * `content`, since reels are bought on impulse.
 */
export function CreateForm() {
  const [format, setFormat] = useState<CoinFormat>("post");
  const [preset, setPreset] = useState<CurvePresetId>("content");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [quote, setQuote] = useState(QUOTE_TOKENS[0]);
  const [initialMc, setInitialMc] = useState(1_000);
  const [migrationMc, setMigrationMc] = useState(25_000);

  const { connected } = useWallet();
  const { state, launch, reset } = useLaunch();
  const [media, setMedia] = useState<{
    url: string;
    mimeType: string;
    width: number;
    height: number;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Upload as soon as a file is chosen rather than at submit. Pinning a 25MB
   * video inside the launch flow would leave the wallet prompt waiting on IPFS.
   */
  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      // Intrinsic dimensions drive the grid's aspect ratio, so they are read
      // from the file itself rather than assumed from the format.
      const dimensions = await readDimensions(file).catch(() => ({ width: 0, height: 0 }));
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/juno/upload", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Upload failed");
      setMedia({
        url: body.url,
        mimeType: body.mimeType,
        width: dimensions.width,
        height: dimensions.height,
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const active = CURVE_PRESETS[preset];

  // Computed locally from `buildCurveWithLiquidityWeights` — pure maths, no
  // pool required — so the curve is visible before it is paid for.
  const shape = useMemo(
    () =>
      presetShape({
        preset,
        initialMarketCap: initialMc,
        migrationMarketCap: migrationMc,
        quoteDecimals: quote.decimals,
      }),
    [preset, initialMc, migrationMc, quote.decimals],
  );
  const valid =
    name.trim().length > 0 && symbol.trim().length > 0 && migrationMc > initialMc;
  const busy = state.status === "building" || state.status === "signing";

  if (state.status === "done") {
    return <LaunchResult result={state.result} onReset={reset} />;
  }

  return (
    <form
      className="mt-6 flex flex-col gap-7"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        void launch({
          quote,
          format,
          mediaUrl: media?.url ?? null,
          mimeType: media?.mimeType ?? null,
          mediaWidth: media?.width || null,
          mediaHeight: media?.height || null,
          description: description.trim() || undefined,
          name: name.trim(),
          symbol: symbol.trim(),
          preset,
          initialMarketCap: initialMc,
          migrationMarketCap: migrationMc,
        });
      }}
    >
      <Field label="Format">
        <div className="grid grid-cols-2 gap-2">
          {FORMATS.map(({ id, label, hint, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={format === id}
              onClick={() => {
                setFormat(id);
                if (id === "reel") setPreset("content");
              }}
              className={cn(
                "flex flex-col items-start gap-1 rounded-j border p-3 text-left transition-colors",
                "focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
                format === id
                  ? "border-j-ink bg-j-surface"
                  : "border-j-line hover:border-j-line-strong",
              )}
            >
              <Icon size={18} className={format === id ? "text-j-ink" : "text-j-muted"} />
              <span className="text-[14px] font-semibold">{label}</span>
              <span className="text-[12px] leading-snug text-j-muted">{hint}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field label="Media" optional>
        {media ? (
          <div className="relative overflow-hidden rounded-j border border-j-line">
            {media.mimeType.startsWith("video") ? (
              <video src={media.url} muted loop playsInline autoPlay className="max-h-[300px] w-full object-contain" />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={media.url} alt="" className="max-h-[300px] w-full object-contain" />
            )}
            <button
              type="button"
              onClick={() => {
                setMedia(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
              aria-label="Remove media"
              className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm"
            >
              <X size={16} />
            </button>
            <p className="border-t border-j-line bg-j-surface px-3 py-2 text-[11px] text-j-muted">
              Pinned to IPFS · {media.url.split("/").pop()?.slice(0, 18)}…
            </p>
          </div>
        ) : (
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-j border border-dashed border-j-line-strong bg-j-input text-center transition-colors hover:border-j-ink",
              format === "reel" ? "aspect-[9/16] max-h-[280px]" : "aspect-[16/10]",
              uploading && "pointer-events-none opacity-60",
            )}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            {uploading ? (
              <LoaderCircle size={20} className="animate-spin text-j-muted" />
            ) : (
              <Upload size={20} className="text-j-muted" />
            )}
            <span className="text-[14px] font-medium">
              {uploading
                ? "Pinning to IPFS…"
                : format === "reel"
                  ? "Upload a vertical video"
                  : "Upload an image or video"}
            </span>
            <span className="text-[12px] text-j-faint">
              {format === "reel" ? "9:16 recommended" : "Any aspect ratio"} · max 25MB
            </span>
          </label>
        )}
        {uploadError && (
          <p role="alert" className="text-[12px] text-j-danger">
            {uploadError}
          </p>
        )}
      </Field>

      <Field label="Name">
        <Input value={name} onChange={setName} placeholder="Town Hall" maxLength={64} />
      </Field>

      <Field label="Ticker">
        <Input
          value={symbol}
          onChange={(v) => setSymbol(v.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          placeholder="TOWNHALL"
          maxLength={12}
          mono
        />
      </Field>

      <Field label="Description" optional>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="What is this?"
          className="w-full resize-none rounded-j border border-j-line bg-j-input px-3.5 py-2.5 text-[14px] placeholder:text-j-faint focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none"
        />
      </Field>

      <Field
        label="Curve"
        hint="How price moves as people buy. This is the decision that shapes the market."
      >
        <div className="flex flex-col gap-2">
          {CURVE_PRESET_LIST.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={preset === option.id}
              onClick={() => setPreset(option.id)}
              className={cn(
                "rounded-j border p-3 text-left transition-colors",
                "focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
                preset === option.id
                  ? "border-j-ink bg-j-surface"
                  : "border-j-line hover:border-j-line-strong",
              )}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-semibold">{option.label}</span>
                <span className="shrink-0 text-[11px] text-j-faint tabular-nums">
                  {option.startingFeeBps / 100}% → {option.endingFeeBps / 100}% fee
                </span>
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-j-muted">
                {option.tagline}
              </span>
              <PresetSparkline
                preset={option.id}
                initialMc={initialMc}
                migrationMc={migrationMc}
                quoteDecimals={quote.decimals}
              />
            </button>
          ))}
        </div>
        {/* The curve this preset will actually create, at the valuations set
            below. Wide flat stretches are heavily weighted liquidity. */}
        {shape && shape.points.length > 0 && (
          <div className="mt-2 rounded-j border border-j-line p-3">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[12px] font-semibold">{active.label}</span>
              <span className="text-[11px] text-j-faint">
                {shape.points.length} segments · {usd(initialMc)} → {usd(migrationMc)}
              </span>
            </div>
            <CurveChart shape={shape} progress={0} height={110} />
          </div>
        )}

        <p className="mt-2 rounded-j bg-j-surface px-3 py-2.5 text-[12px] leading-relaxed text-j-muted">
          {active.rationale}
        </p>
      </Field>

      <Field label="Quote token" hint="What buyers pay with. Fixed once the pool exists.">
        <div className="flex gap-2">
          {QUOTE_TOKENS.map((token) => (
            <button
              key={token.mint}
              type="button"
              aria-pressed={quote.mint === token.mint}
              onClick={() => setQuote(token)}
              className={cn(
                "h-10 flex-1 rounded-j border text-[14px] font-semibold transition-colors",
                "focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
                quote.mint === token.mint
                  ? "border-j-ink bg-j-ink text-j-bg"
                  : "border-j-line-strong hover:bg-j-surface",
              )}
            >
              {token.symbol}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Opening valuation">
          <NumberInput value={initialMc} onChange={setInitialMc} min={100} step={100} />
        </Field>
        <Field label="Graduates at">
          <NumberInput value={migrationMc} onChange={setMigrationMc} min={1000} step={1000} />
        </Field>
      </div>

      {migrationMc <= initialMc && (
        <p className="-mt-4 text-[12px] text-j-danger">
          Graduation valuation must be above the opening valuation.
        </p>
      )}

      <div className="rounded-j border border-j-line p-3">
        <p className="text-[14px] font-semibold">Summary</p>
        <dl className="mt-2 flex flex-col gap-1.5 text-[14px]">
          <SummaryRow label="Format">{format === "reel" ? "Reel" : "Post"}</SummaryRow>
          <SummaryRow label="Curve">{active.label}</SummaryRow>
          <SummaryRow label="Quote">{quote.symbol}</SummaryRow>
          <SummaryRow label="Opens at">{usd(initialMc)}</SummaryRow>
          <SummaryRow label="Graduates at">{usd(migrationMc)}</SummaryRow>
          <SummaryRow label="Migrates to">Meteora DAMM v2</SummaryRow>
        </dl>
      </div>

      <div>
        <Button type="submit" variant="buy" size="lg" className="w-full" disabled={!valid || busy}>
          {state.status === "building"
            ? "Building transactions…"
            : state.status === "signing"
              ? `${state.label} (${state.step}/${state.total})`
              : !connected
              ? "Connect wallet to launch"
              : !valid
                ? "Add a name and ticker"
                : `Launch on ${cluster()}`}
        </Button>

        {state.status === "error" && (
          <p role="alert" className="mt-3 rounded-j border border-j-danger/40 bg-j-danger/10 px-3 py-2 text-[14px] text-j-danger">
            {state.message}
          </p>
        )}

        <p className="mt-3 text-center text-[12px] text-j-faint">
          Creates a config key and a virtual pool in one transaction. Costs
          network fees and account rent.
        </p>
      </div>
    </form>
  );
}

/**
 * Post-launch receipt. Every address is a link, because the whole point of
 * launching on-chain is that someone else can go and verify it.
 */
function LaunchResult({
  result,
  onReset,
}: {
  result: { signature: string; signatures: string[]; pool: string; config: string; baseMint: string };
  onReset: () => void;
}) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="rounded-j border border-j-pos/40 bg-j-pos/10 px-4 py-3">
        <p className="text-[16px] font-semibold text-j-pos">Pool is live</p>
        <p className="mt-1 text-[14px] text-j-muted">
          The bonding curve is open on {cluster()}. Anyone can trade it now.
        </p>
      </div>

      <dl className="flex flex-col gap-2 text-[14px]">
        <ProofRow label="Transaction" value={result.signature} href={explorer.tx(result.signature)} />
        <ProofRow label="Pool" value={result.pool} href={explorer.account(result.pool)} />
        <ProofRow label="Token mint" value={result.baseMint} href={explorer.token(result.baseMint)} />
        <ProofRow label="Config key" value={result.config} href={explorer.account(result.config)} />
      </dl>

      <div className="flex gap-2">
        <Button
          variant="buy"
          size="lg"
          className="flex-1"
          onClick={() => window.open(`/coin/${result.baseMint}`, "_self")}
        >
          Open the coin
        </Button>
        <Button variant="outline" size="lg" onClick={onReset}>
          Launch another
        </Button>
      </div>

      <a
        href={meteoraPoolUrl(result.pool)}
        target="_blank"
        rel="noreferrer noopener"
        className="text-center text-[12px] text-j-muted underline hover:text-j-ink"
      >
        View the curve on Meteora
      </a>
    </div>
  );
}

function ProofRow({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-j-muted">{label}</dt>
      <dd>
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-1.5 font-mono text-[12px] hover:underline"
        >
          {value.slice(0, 6)}…{value.slice(-6)}
          <ExternalLink size={12} className="text-j-muted" />
        </a>
      </dd>
    </div>
  );
}

/**
 * A miniature of each preset's curve, on its own selector button.
 *
 * Reading four taglines tells you less than seeing four shapes side by side —
 * and the shapes are the actual difference between the presets.
 */
function PresetSparkline({
  preset,
  initialMc,
  migrationMc,
  quoteDecimals,
}: {
  preset: CurvePresetId;
  initialMc: number;
  migrationMc: number;
  quoteDecimals: number;
}) {
  const shape = useMemo(
    () => presetShape({ preset, initialMarketCap: initialMc, migrationMarketCap: migrationMc, quoteDecimals }),
    [preset, initialMc, migrationMc, quoteDecimals],
  );
  if (!shape || shape.points.length === 0) return null;
  return (
    <span className="mt-2 block opacity-70">
      <CurveChart shape={shape} progress={0} height={38} />
    </span>
  );
}

/** Intrinsic media dimensions, read from the file before it leaves the browser. */
function readDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const done = (width: number, height: number) => {
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };
    if (file.type.startsWith("video")) {
      const video = document.createElement("video");
      video.onloadedmetadata = () => done(video.videoWidth, video.videoHeight);
      video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Unreadable video")); };
      video.src = url;
    } else {
      const image = new Image();
      image.onload = () => done(image.naturalWidth, image.naturalHeight);
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Unreadable image")); };
      image.src = url;
    }
  });
}

function Field({
  label,
  hint,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline gap-2">
        <span className="text-[14px] font-semibold">{label}</span>
        {optional && <span className="text-[12px] text-j-faint">optional</span>}
      </span>
      {hint && <span className="-mt-1 text-[12px] leading-snug text-j-muted">{hint}</span>}
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  maxLength,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  mono?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className={cn(
        "h-11 w-full rounded-j border border-j-line bg-j-input px-3.5 text-[14px] placeholder:text-j-faint",
        "focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
        mono && "font-mono tracking-wide",
      )}
    />
  );
}

function NumberInput({
  value,
  onChange,
  min,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  step: number;
}) {
  return (
    <span className="flex h-11 items-center rounded-j border border-j-line bg-j-input pl-3.5">
      <span className="text-[14px] text-j-muted">$</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-full w-full bg-transparent px-1.5 text-[14px] tabular-nums outline-none"
      />
    </span>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-j-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
