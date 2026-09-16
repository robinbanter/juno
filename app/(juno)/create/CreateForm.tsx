"use client";

import { useState } from "react";
import { Clapperboard, ImageIcon, Upload } from "lucide-react";

import { cn } from "@/lib/utils";
import { CURVE_PRESET_LIST, CURVE_PRESETS } from "@/lib/juno/curves";
import { QUOTE_TOKENS } from "@/lib/juno/dbc";
import { usd } from "@/lib/juno/format";
import type { CoinFormat, CurvePresetId } from "@/lib/juno/types";
import { Button } from "@/components/juno/ui/Button";

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

  const active = CURVE_PRESETS[preset];
  const ready = name.trim().length > 0 && symbol.trim().length > 0;

  return (
    <form
      className="mt-6 flex flex-col gap-7"
      onSubmit={(e) => {
        e.preventDefault();
        // Wire to `buildLaunchTransaction` in lib/juno/dbc.ts once a wallet
        // adapter is connected: it takes exactly these fields.
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

      <Field label="Media">
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-j border border-dashed border-j-line-strong bg-j-input text-center transition-colors hover:border-j-ink",
            format === "reel" ? "aspect-[9/16] max-h-[280px]" : "aspect-[16/10]",
          )}
        >
          <input type="file" accept="image/*,video/*" className="sr-only" />
          <Upload size={20} className="text-j-muted" />
          <span className="text-[13px] font-medium">
            {format === "reel" ? "Upload a vertical video" : "Upload an image or video"}
          </span>
          <span className="text-[12px] text-j-faint">
            {format === "reel" ? "9:16 recommended" : "Any aspect ratio"}
          </span>
        </label>
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
            </button>
          ))}
        </div>
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
        <p className="text-[13px] font-semibold">Summary</p>
        <dl className="mt-2 flex flex-col gap-1.5 text-[13px]">
          <SummaryRow label="Format">{format === "reel" ? "Reel" : "Post"}</SummaryRow>
          <SummaryRow label="Curve">{active.label}</SummaryRow>
          <SummaryRow label="Quote">{quote.symbol}</SummaryRow>
          <SummaryRow label="Opens at">{usd(initialMc)}</SummaryRow>
          <SummaryRow label="Graduates at">{usd(migrationMc)}</SummaryRow>
          <SummaryRow label="Migrates to">Meteora DAMM v2</SummaryRow>
        </dl>
      </div>

      <div>
        <Button
          type="submit"
          variant="buy"
          size="lg"
          className="w-full"
          disabled={!ready || migrationMc <= initialMc}
        >
          {ready ? "Launch" : "Add a name and ticker"}
        </Button>
        <p className="mt-3 text-center text-[12px] text-j-faint">
          Connect a wallet to launch. Creating a pool costs network fees only.
        </p>
      </div>
    </form>
  );
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
        <span className="text-[13px] font-semibold">{label}</span>
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
