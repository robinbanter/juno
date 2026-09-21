import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Modal } from "react-native";
import styled from "styled-components/native";

import { Button, Caption, Col, ExternalGlyph, Label, Pill, Row } from "./kit";
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
 */

/**
 * How long a quote is trusted before Buy rebuilds it.
 *
 * A Solana blockhash lasts about 150 slots — roughly a minute. Thirty seconds
 * leaves room for the sign-and-send round trip to finish inside that window.
 */
const STALE_QUOTE_MS = 30_000;

const QUICK_BUY = [0.1, 0.25, 0.5, 1];
const QUICK_SELL = [0.25, 0.5, 0.75, 1];

type Stage = "entry" | "confirming" | "done";

export function TradeSheet({
  coin,
  side,
  onClose,
  onDone,
  holding = null,
  quoteBalance = null,
  initialAmount = "",
  onFilled,
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
}) {
  const wallet = useWallet();
  const [amount, setAmount] = useState(initialAmount);
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof juno.buildSwap>> | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [stage, setStage] = useState<Stage>("entry");
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  /**
   * When the quote on screen was built.
   *
   * A quote carries the blockhash the transaction is signed against, and a
   * Solana blockhash is good for roughly a minute. Someone who opens this
   * sheet, thinks about it, and then taps Buy was getting "something went
   * wrong" from an expired one — for a transaction that was never broadcast
   * and could have simply been rebuilt.
   */
  const quotedAt = useRef(0);

  const value = Number(amount || "0");
  const valid = Number.isFinite(value) && value > 0;
  const unit = side === "buy" ? coin.quote.symbol : coin.symbol;

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
    const rate = quote?.quoteUsdRate ?? null;
    if (side === "buy") return rate === null ? null : money(value * rate, "USD", { compact: false });
    return coin.priceUsd > 0 ? money(value * coin.priceUsd, coin.marketCapCurrency, { compact: false }) : null;
  }, [valid, value, side, quote?.quoteUsdRate, coin.priceUsd, coin.marketCapCurrency]);

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
       * Re-quote if the one on screen has gone stale.
       *
       * Rebuilding is cheap next to a failed submit, and it is also *more*
       * correct: the bonding curve moves, so a minute-old quote is not only
       * carrying a dead blockhash, it is quoting a price nobody would get now.
       * The rebuilt quote replaces the visible one before signing, so what is
       * signed is what the sheet last showed.
       */
      let live = quote;
      if (Date.now() - quotedAt.current > STALE_QUOTE_MS) {
        live = await juno.buildSwap({
          mint: coin.address,
          owner: address,
          side,
          amountIn: value,
        });
        setQuote(live);
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

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Scrim onPress={onClose} />

      <Sheet>
        <Grabber />

        <Row justify="space-between">
          <Row gap={16}>
            <HeadTab $on={side === "buy"}>Buy</HeadTab>
            <HeadTab $on={side === "sell"}>Sell</HeadTab>
          </Row>
          <Close onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <CloseMark>✕</CloseMark>
          </Close>
        </Row>

        {/* Balance first, as in the reference — the number that decides whether
            any of the rest is possible. */}
        <Balance>
          Balance: {balance === null ? "—" : `${tokens(balance)} ${unit}`}
        </Balance>

        {stage === "done" && signature ? (
          <Done>
            <DoneTitle>Done</DoneTitle>
            <Label muted style={{ textAlign: "center" }}>
              {side === "buy" ? "Bought" : "Sold"} {receiving ?? ""} — confirmed on Solana.
            </Label>
            <LinkTap onPress={() => Linking.openURL(juno.explorer("tx", signature))}>
              <LinkText>View the transaction</LinkText>
              <ExternalGlyph />
            </LinkTap>
            <Button label="Done" onPress={onDone} style={{ marginTop: 16, alignSelf: "stretch" }} />
          </Done>
        ) : (
          <>
            <Amount>
              <AmountRow>
                <AmountValue>{amount || "0"}</AmountValue>
                <AmountUnit>{unit}</AmountUnit>
              </AmountRow>
              {/* The dollar equivalent under the amount, and the receive line
                  under that — both from the server's quote, never multiplied
                  out from spot, because a curve moves as it fills. */}
              <Caption>
                {usdEquivalent ? `~${usdEquivalent}` : " "}
              </Caption>
              <Receive>
                {quoting
                  ? "Quoting against the curve…"
                  : receiving
                    ? `You'll receive ${receiving}`
                    : valid
                      ? " "
                      : "Enter an amount"}
              </Receive>
              {quote && quote.quote.priceImpact > 0.02 ? (
                <Pill
                  label={`Price impact ${(quote.quote.priceImpact * 100).toFixed(1)}%`}
                  tone="neg"
                />
              ) : null}
            </Amount>

            <Row gap={8}>
              {(side === "buy" ? QUICK_BUY : QUICK_SELL).map((preset) => (
                <Quick key={preset} onPress={() => setAmount(String(preset))}>
                  <QuickLabel>
                    {side === "buy" ? preset : `${preset * 100}%`}
                  </QuickLabel>
                </Quick>
              ))}
            </Row>

            <Button
              label={stage === "confirming" ? "Confirming…" : side === "buy" ? "Buy" : "Sell"}
              variant={side === "buy" ? "lime" : "sell"}
              tall
              onPress={confirm}
              loading={stage === "confirming" || wallet.signing}
              disabled={!quote || quoting}
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

const HeadTab = styled.Text<{ $on: boolean }>`
  font-size: ${(p) => p.theme.type.title.size}px;
  font-weight: ${(p) => (p.$on ? 800 : 500)};
  color: ${(p) => (p.$on ? p.theme.colors.text : p.theme.colors.faint)};
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

const Balance = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 500;
  color: ${(p) => p.theme.colors.muted};
  text-align: center;
`;

const Receive = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.text};
  min-height: 18px;
`;

const Amount = styled.View`
  align-items: center;
  gap: 6px;
  padding-vertical: ${(p) => p.theme.space(3)}px;
`;

const AmountRow = styled.View`
  flex-direction: row;
  align-items: baseline;
  gap: 8px;
`;

const AmountValue = styled.Text`
  font-size: ${(p) => p.theme.type.display.size}px;
  font-weight: 800;
  letter-spacing: -1.4px;
  color: ${(p) => p.theme.colors.text};
`;

const AmountUnit = styled.Text`
  font-size: ${(p) => p.theme.type.title.size}px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.faint};
`;

const Quick = styled.Pressable`
  flex: 1;
  padding-vertical: ${(p) => p.theme.space(3)}px;
  border-radius: ${(p) => p.theme.radius.pill}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
  align-items: center;
`;

const QuickLabel = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.text};
`;

const Pad = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
`;

const Key = styled.Pressable`
  width: 33.33%;
  height: 54px;
  align-items: center;
  justify-content: center;
`;

const KeyLabel = styled.Text`
  font-size: ${(p) => p.theme.type.heading.size}px;
  font-weight: 500;
  color: ${(p) => p.theme.colors.text};
`;

const ErrorText = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  color: ${(p) => p.theme.colors.neg};
  text-align: center;
`;

const Done = styled.View`
  align-items: center;
  gap: ${(p) => p.theme.space(2)}px;
  padding-vertical: ${(p) => p.theme.space(6)}px;
  align-self: stretch;
`;

const DoneTitle = styled.Text`
  font-size: ${(p) => p.theme.type.heading.size}px;
  font-weight: 800;
  color: ${(p) => p.theme.colors.pos};
`;

const LinkTap = styled.Pressable``;

const LinkText = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.focus};
  margin-top: 6px;
`;
