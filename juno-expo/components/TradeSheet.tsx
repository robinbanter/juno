import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Modal, TextInput } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import styled from "styled-components/native";

import { Tappable } from "./Press";
import { Button, Caption, Col, ExternalGlyph, Label, Row } from "./kit";
import { juno, type Coin } from "../lib/api";
import { money, tokens } from "../lib/useApi";
import { useWallet } from "../lib/wallet";
import { theme } from "../theme";

/**
 * Buy and sell, with a numpad.
 *
 * A system keyboard is the wrong control here. It covers half the screen —
 * including the quote the person is deciding on — offers characters an amount
 * cannot contain, and moves its decimal key by locale. A purpose-built pad
 * keeps the number, the quote and the button visible at once, which is the
 * whole decision in one view.
 *
 * ## The quote is fetched, not computed
 *
 * The amount could be multiplied by the last price, and that estimate would be
 * wrong in exactly the way that matters: a bonding curve moves as it fills, so
 * a large order does not clear at spot. The server quotes against the live
 * curve and returns the transaction built against that same quote, so what is
 * shown is what gets signed.
 *
 * Debounced, because a quote is an RPC round trip and typing "125" should not
 * cost three of them.
 *
 * ## Saying so afterwards
 *
 * Juno is a social app and a trade was the one thing you could not talk about:
 * the comment box here attaches your words to the fill, with the side and the
 * signature on the row. That is what makes it an announcement rather than a
 * boast — anyone reading it can check it on an explorer.
 *
 * Posted only after the signature lands, and a failure to post says so without
 * pretending the trade failed. The two are different events and only one of
 * them moved money.
 */

/** Dollar sizes, converted at the quote token's rate. */
const QUICK_USD = [2, 20, 50, 100];
/** What a buy offers when no USD feed answered, in quote units. */
const QUICK_QUOTE = [0.1, 0.25, 0.5, 1];
/** A sell is a fraction of what you hold; absolute sizes mean nothing there. */
const QUICK_SELL = [0.25, 0.5, 0.75, 1];

/**
 * How long the pre-sign refresh is allowed to take.
 *
 * Shorter than the client's default, because this one has somewhere to fall
 * back to. Waiting the full forty-five seconds for a refresh would spend most
 * of the blockhash window the refresh exists to protect.
 */
const REQUOTE_MS = 12_000;

type Stage = "entry" | "confirming" | "done";

export function TradeSheet({
  coin,
  side: initialSide,
  onClose,
  onDone,
  holding = null,
  quoteBalance = null,
  initialAmount = "",
  onFilled,
  onCommented,
}: {
  coin: Coin;
  side: "buy" | "sell";
  onClose: () => void;
  onDone: () => void;
  /** Coin balance, for a sell. Null when unknown. */
  holding?: number | null;
  /** Quote-token balance, for a buy. Null when unknown. */
  quoteBalance?: number | null;
  /**
   * Pre-filled amount, for a buy opened from somewhere that already knows the
   * size — a recurring-buy contribution. Editable: it is a starting point, not
   * a lock, because the whole point of signing each one is that you can change
   * your mind about this week.
   */
  initialAmount?: string;
  /**
   * A swap **confirmed**, with the quote amount that was spent or received.
   *
   * Fires on the signature landing, not on the sheet closing. Anything that
   * records a fill has to hang off this and only this: a callback on close
   * would count a trade that errored, and one on submit would count a
   * transaction that never made it into a block.
   */
  onFilled?: (quoteAmount: number) => void;
  /** An announcement was posted alongside the fill. */
  onCommented?: () => void;
}) {
  const wallet = useWallet();
  const [side, setSide] = useState<"buy" | "sell">(initialSide);
  const [amount, setAmount] = useState(initialAmount);
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof juno.buildSwap>> | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [stage, setStage] = useState<Stage>("entry");
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  /** When the quote on screen was built. Kept for the "quoted Ns ago" read. */
  const quotedAt = useRef(0);

  const value = Number(amount || "0");
  const valid = Number.isFinite(value) && value > 0;
  const unit = side === "buy" ? coin.quote.symbol : coin.symbol;
  const rate = coin.quoteUsdRate;

  /**
   * What the wallet can actually spend on this side.
   *
   * Null rather than zero when it is not known — a balance that failed to load
   * and a genuinely empty wallet are different, and only one of them should
   * stop someone trying.
   */
  const balance = useMemo(() => {
    if (side === "sell") return holding;
    return quoteBalance;
  }, [side, holding, quoteBalance]);

  const usdEquivalent = useMemo(() => {
    if (!valid) return null;
    const live = quote?.quoteUsdRate ?? rate;
    if (side === "buy") return live === null ? null : money(value * live, "USD", { compact: false });
    return coin.priceUsd > 0 ? money(value * coin.priceUsd, coin.marketCapCurrency, { compact: false }) : null;
  }, [valid, value, side, quote?.quoteUsdRate, rate, coin.priceUsd, coin.marketCapCurrency]);

  useEffect(() => {
    if (!valid || !wallet.address) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const built = await juno.buildSwap({
          mint: coin.address,
          owner: wallet.address!,
          side,
          amountIn: value,
        });
        if (!cancelled) {
          setQuote(built);
          quotedAt.current = Date.now();
        }
      } catch (caught) {
        if (!cancelled) {
          setQuote(null);
          setError(caught instanceof Error ? caught.message : "Could not quote this trade");
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [amount, valid, value, side, coin.address, wallet.address]);

  const press = useCallback((key: string) => {
    setError(null);
    setSignature(null);
    setAmount((current) => {
      if (key === "back") return current.slice(0, -1);
      if (key === ".") return current.includes(".") ? current : current === "" ? "0." : `${current}.`;
      // No leading zeros: "05" is not an amount anyone meant to type.
      const next = current === "0" ? key : current + key;
      const [, decimals = ""] = next.split(".");
      if (decimals.length > 9) return current;
      return next;
    });
  }, []);

  async function confirm() {
    if (!quote) return;
    setStage("confirming");
    setError(null);
    try {
      const address = wallet.address ?? (await wallet.connect());
      if (!address) throw new Error("No wallet available");

      /*
       * Rebuild the quote, every time, right before signing.
       *
       * A quote carries the blockhash the transaction is signed against, and a
       * Solana blockhash lives about ninety seconds. This was conditional on
       * the quote being older than thirty seconds, and that still failed: the
       * *round trip* — rebuild, sign, submit, confirm — can itself take longer
       * than the remaining life of a blockhash issued half a minute ago,
       * especially against an endpoint that is rate-limiting.
       *
       * So the branch is gone. One extra quote on the fast path costs a call
       * this sheet already makes on every keystroke; a dead blockhash costs
       * the trade. It is also *more* correct: the curve moves as it fills, so
       * a minute-old quote is quoting a price nobody would get now. The
       * rebuilt quote replaces the visible one before signing, so what is
       * signed is what the sheet shows.
       */
      const fresh = await juno
        .buildSwap({ mint: coin.address, owner: address, side, amountIn: value }, REQUOTE_MS)
        // A refresh that times out is not a reason to refuse the trade: the
        // quote on screen may still be inside its blockhash window, and
        // failing here would turn a slow endpoint into a failed buy. If the
        // old one has also expired the submit says so, in those words.
        .catch(() => null);
      const live = fresh ?? quote;
      if (fresh) {
        setQuote(fresh);
        quotedAt.current = Date.now();
      }

      const signed = await wallet.sign(live.unsigned.transaction);
      const { signature: landed } = await juno.submit({
        transaction: signed,
        window: live.window,
        poolAddress: live.pool,
      });
      setSignature(landed);
      setStage("done");
      onFilled?.(value);

      // The announcement, if one was written. Its failure is reported on its
      // own line: the trade is already on chain and saying "the trade failed"
      // here would be false.
      const body = note.trim();
      if (body) {
        try {
          await juno.addComment({
            coin: coin.address,
            wallet: address,
            body,
            side,
            signature: landed,
          });
          setNote("");
          onCommented?.();
        } catch (caught) {
          setNoteError(
            caught instanceof Error
              ? `The trade landed; your note did not post: ${caught.message}`
              : "The trade landed; your note did not post.",
          );
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The trade failed");
      setStage("entry");
    }
  }

  const receiving = useMemo(() => {
    if (!quote) return null;
    return side === "buy"
      ? `${tokens(quote.quote.amountOut)} ${coin.symbol}`
      : money(quote.quote.amountOut, coin.quote.symbol, { compact: false });
  }, [quote, side, coin.symbol, coin.quote.symbol]);

  /**
   * The quick sizes, in whatever unit the trade is actually denominated in.
   *
   * Dollars when a feed gives a rate to convert them at, because "$20" is the
   * size someone has in mind and "0.175 SOL" is the same thought after
   * arithmetic they should not have to do. Without a rate the dollar labels
   * would be a guess, so the presets fall back to quote units and say so by
   * showing the symbol.
   */
  const quickSizes = useMemo(() => {
    if (side === "sell") {
      return QUICK_SELL.map((fraction) => ({
        label: `${fraction * 100}%`,
        // Null when the balance is unknown: a percentage of an unknown number
        // is not a number, and the pill is disabled rather than guessing.
        amount: balance === null ? null : balance * fraction,
      }));
    }
    if (rate === null || rate <= 0) {
      return QUICK_QUOTE.map((size) => ({ label: `${size} ${coin.quote.symbol}`, amount: size }));
    }
    return QUICK_USD.map((dollars) => ({ label: `$${dollars}`, amount: dollars / rate }));
  }, [side, balance, rate, coin.quote.symbol]);

  const done = stage === "done" && signature !== null;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Scrim onPress={onClose} />

      <Sheet>
        <Grabber />

        <Row justify="space-between" align="center">
          <Row gap={8}>
            <SideTap
              $on={side === "buy"}
              $buy
              onPress={() => setSide("buy")}
              accessibilityRole="button"
              accessibilityState={{ selected: side === "buy" }}
            >
              <SideText $on={side === "buy"} $buy>
                Buy
              </SideText>
            </SideTap>
            <SideTap
              $on={side === "sell"}
              $buy={false}
              onPress={() => setSide("sell")}
              accessibilityRole="button"
              accessibilityState={{ selected: side === "sell" }}
            >
              <SideText $on={side === "sell"} $buy={false}>
                Sell
              </SideText>
            </SideTap>
          </Row>
          <Close onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <CloseMark>✕</CloseMark>
          </Close>
        </Row>

        {done ? (
          <Done>
            <DoneTitle>Done</DoneTitle>
            <Label muted style={{ textAlign: "center" }}>
              {side === "buy" ? "Bought" : "Sold"} {receiving ?? ""} — confirmed on Solana.
            </Label>
            {noteError ? <ErrorText>{noteError}</ErrorText> : null}
            <LinkTap onPress={() => Linking.openURL(juno.explorer("tx", signature!))}>
              <LinkText>View the transaction</LinkText>
              <ExternalGlyph />
            </LinkTap>
            <Button label="Done" onPress={onDone} style={{ marginTop: 16, alignSelf: "stretch" }} />
          </Done>
        ) : (
          <>
            {/* The field, the token it is denominated in, and what you have to
                spend — the three things the number has to be read against, in
                one box. */}
            <Field $live={valid}>
              <Col gap={2} style={{ flex: 1 }}>
                <AmountRow>
                  <AmountValue numberOfLines={1}>{amount || "0"}</AmountValue>
                  <Caret />
                </AmountRow>
                <Caption>{usdEquivalent ? `~${usdEquivalent}` : " "}</Caption>
              </Col>
              <Col gap={4} style={{ alignItems: "flex-end" }}>
                <TokenChip>
                  <TokenDot />
                  <TokenText>{unit}</TokenText>
                </TokenChip>
                <Caption>
                  Balance: {balance === null ? "—" : `${tokens(balance)} ${unit}`}
                </Caption>
              </Col>
            </Field>

            <Row gap={8}>
              {quickSizes.map((preset) => (
                <Quick
                  key={preset.label}
                  disabled={preset.amount === null}
                  onPress={() =>
                    preset.amount === null
                      ? undefined
                      : setAmount(trimTrailingZeros(preset.amount))
                  }
                >
                  <QuickLabel $off={preset.amount === null}>{preset.label}</QuickLabel>
                </Quick>
              ))}
            </Row>

            {/* Network fee, and the curve's own cost beside it. They are
                different things and a trader deciding on size needs the second
                one: the fee does not grow with the order, the curve does. */}
            <Line>
              <Row gap={6}>
                <Label muted>Trading fee</Label>
                <Info />
              </Row>
              <Mono_>
                {quote
                  ? `${tokens(quote.quote.fee)} ${coin.quote.symbol}`
                  : quoting
                    ? "…"
                    : "—"}
              </Mono_>
            </Line>
            <Line>
              <Label muted>Price impact</Label>
              <Mono_
                $warn={(quote?.quote.priceImpact ?? 0) > 0.02}
              >
                {quote ? `${(quote.quote.priceImpact * 100).toFixed(2)}%` : quoting ? "…" : "—"}
              </Mono_>
            </Line>

            {/* What the curve will actually give you, quoted rather than
                multiplied out from spot. Blank rather than instructional when
                there is no amount yet: the caret in the field is already
                saying "type here", and a second voice saying it sat between
                two rows of figures where a figure belongs. */}
            <Receive>
              {quoting ? "Quoting against the curve…" : receiving ? `You'll receive ${receiving}` : " "}
            </Receive>

            {/* The announcement. Optional, and never the default — a trade is
                not a post unless you say so. */}
            <Note>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Add a comment..."
                placeholderTextColor={theme.colors.faint}
                maxLength={280}
                style={{
                  flex: 1,
                  fontSize: theme.type.body.size,
                  color: theme.colors.text,
                }}
              />
            </Note>

            <Button
              label={stage === "confirming" ? "Confirming…" : side === "buy" ? "Buy" : "Sell"}
              variant={side === "buy" ? "lime" : "sell"}
              tall
              onPress={confirm}
              loading={stage === "confirming" || wallet.signing}
              disabled={!quote || quoting}
              style={{ alignSelf: "stretch" }}
            />

            {error ? <ErrorText>{error}</ErrorText> : null}

            <Pad>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"].map((key) => (
                <Key
                  key={key}
                  onPress={() => press(key)}
                  accessibilityRole="button"
                  accessibilityLabel={key === "back" ? "Delete" : key}
                >
                  <KeyLabel>{key === "back" ? "⌫" : key}</KeyLabel>
                </Key>
              ))}
            </Pad>
          </>
        )}
      </Sheet>
    </Modal>
  );
}

/**
 * A size as a typed amount rather than a float's decimal expansion.
 *
 * `20 / 114.03` is `0.17539244058581952`, which is not something anyone typed
 * and reads as noise in a field. Six significant figures is more precision
 * than any curve quote needs and still exact enough that the dollar figure
 * beside it rounds to the preset.
 */
function trimTrailingZeros(value: number): string {
  return String(Number(value.toPrecision(6)));
}

function Info() {
  return (
    <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
      <Circle cx={8} cy={8} r={6.6} stroke={theme.colors.faint} strokeWidth={1.6} />
      <Path d="M8 7.2v4" stroke={theme.colors.faint} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={8} cy={4.9} r={0.95} fill={theme.colors.faint} />
    </Svg>
  );
}

const Scrim = styled.Pressable`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(18, 21, 14, 0.45);
`;

const Sheet = styled.View`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${(p) => p.theme.colors.surface};
  border-top-left-radius: ${(p) => p.theme.radius.xl}px;
  border-top-right-radius: ${(p) => p.theme.radius.xl}px;
  padding: ${(p) => p.theme.space(4)}px;
  padding-bottom: ${(p) => p.theme.space(8)}px;
  gap: ${(p) => p.theme.space(3)}px;
`;

const Grabber = styled.View`
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background-color: ${(p) => p.theme.colors.line};
  align-self: center;
`;

const SideTap = styled.Pressable<{ $on: boolean; $buy: boolean }>`
  padding: 9px 18px;
  border-radius: ${(p) => p.theme.radius.md}px;
  background-color: ${(p) =>
    !p.$on ? "transparent" : p.$buy ? p.theme.colors.lime : p.theme.colors.negSoft};
`;

const SideText = styled.Text<{ $on: boolean; $buy: boolean }>`
  font-size: ${(p) => p.theme.type.lead.size}px;
  font-weight: 800;
  letter-spacing: ${(p) => p.theme.type.lead.tracking}px;
  color: ${(p) =>
    !p.$on ? p.theme.colors.faint : p.$buy ? p.theme.colors.onLime : p.theme.colors.neg};
`;

const Close = styled.Pressable`
  width: 32px;
  height: 32px;
  border-radius: 16px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
  align-items: center;
  justify-content: center;
`;

const CloseMark = styled.Text`
  font-size: ${(p) => p.theme.type.body.size}px;
  color: ${(p) => p.theme.colors.muted};
`;

const Field = styled.View<{ $live: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${(p) => p.theme.space(3)}px;
  padding: ${(p) => p.theme.space(4)}px;
  border-radius: ${(p) => p.theme.radius.lg}px;
  border-width: 1.5px;
  border-color: ${(p) => (p.$live ? p.theme.colors.ink : p.theme.colors.line)};
  background-color: ${(p) => p.theme.colors.surface};
`;

const AmountRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 2px;
`;

const AmountValue = styled.Text`
  font-size: ${(p) => p.theme.type.heading.size}px;
  line-height: ${(p) => p.theme.type.heading.height}px;
  letter-spacing: ${(p) => p.theme.type.heading.tracking}px;
  font-weight: 800;
  font-variant: tabular-nums;
  color: ${(p) => p.theme.colors.text};
`;

/* The caret. The pad is the keyboard, so the field never takes focus and
   never draws one of its own — without this the box reads as a label. */
const Caret = styled.View`
  width: 2px;
  height: ${(p) => p.theme.type.heading.size}px;
  background-color: ${(p) => p.theme.colors.focus};
  margin-left: 2px;
`;

const TokenChip = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: ${(p) => p.theme.radius.pill}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
`;

const TokenDot = styled.View`
  width: 14px;
  height: 14px;
  border-radius: 7px;
  background-color: ${(p) => p.theme.colors.ink};
`;

const TokenText = styled.Text`
  font-size: ${(p) => p.theme.type.caption.size}px;
  font-weight: 800;
  color: ${(p) => p.theme.colors.text};
`;

const Line = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const Mono_ = styled.Text<{ $warn?: boolean }>`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 700;
  font-variant: tabular-nums;
  color: ${(p) => (p.$warn ? p.theme.colors.neg : p.theme.colors.text)};
`;

const Receive = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.text};
  min-height: 18px;
`;

const Note = styled.View`
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  padding-vertical: 12px;
  border-radius: ${(p) => p.theme.radius.md}px;
  border-width: ${(p) => p.theme.hairline}px;
  border-color: ${(p) => p.theme.colors.line};
  background-color: ${(p) => p.theme.colors.surface};
`;

const Quick = styled.Pressable`
  flex: 1;
  padding-vertical: ${(p) => p.theme.space(3)}px;
  border-radius: ${(p) => p.theme.radius.md}px;
  border-width: ${(p) => p.theme.hairline}px;
  border-color: ${(p) => p.theme.colors.line};
  align-items: center;
`;

const QuickLabel = styled.Text<{ $off?: boolean }>`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 700;
  color: ${(p) => (p.$off ? p.theme.colors.faint : p.theme.colors.text)};
`;

const Pad = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
`;

const Key = styled.Pressable`
  width: 33.33%;
  padding-vertical: ${(p) => p.theme.space(3)}px;
  align-items: center;
`;

const KeyLabel = styled.Text`
  font-size: ${(p) => p.theme.type.heading.size}px;
  font-weight: 500;
  color: ${(p) => p.theme.colors.text};
`;

const Done = styled.View`
  align-items: center;
  gap: ${(p) => p.theme.space(2)}px;
  padding-vertical: ${(p) => p.theme.space(6)}px;
`;

const DoneTitle = styled.Text`
  font-size: ${(p) => p.theme.type.heading.size}px;
  font-weight: 800;
  color: ${(p) => p.theme.colors.pos};
`;

const LinkTap = styled.Pressable`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  margin-top: ${(p) => p.theme.space(2)}px;
`;

const LinkText = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 700;
  color: ${(p) => p.theme.colors.focus};
`;

const ErrorText = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  color: ${(p) => p.theme.colors.neg};
  text-align: center;
`;
