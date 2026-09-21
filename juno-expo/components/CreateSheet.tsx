import { useEffect, useState } from "react";
import { TextInput } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import styled from "styled-components/native";

import { BottomSheet } from "./BottomSheet";
import { Tappable } from "./Press";
import { Body, Button, Caption, Chevron, Col, Label, Row } from "./kit";
import { juno } from "../lib/api";
import { useWallet } from "../lib/wallet";
import { theme } from "../theme";

/**
 * What the + button opens.
 *
 * Three things create something on Juno and they were not equally reachable:
 * launching a coin was a whole tab, launching a *reel* was not possible from
 * the phone at all, and writing a plain post — the ordinary thing a social app
 * exists for — had no entry point outside a reply box. Putting the three side
 * by side is the fix; the sheet is just the shape that fits.
 *
 * ## Why a sheet rather than a screen
 *
 * Two of these three are a decision, not a task: pick a kind, then do the work
 * on a proper screen. A sheet keeps the feed visible behind the scrim, so
 * choosing does not feel like leaving — and a wrong tap costs a flick down
 * rather than a navigation back.
 *
 * The third, a text post, *is* the whole task, so it happens here. It is two
 * fields and a button, and pushing a screen for it would be the heavier thing.
 */
export function CreateSheet({
  visible,
  onClose,
  onLaunch,
  onPosted,
}: {
  visible: boolean;
  onClose: () => void;
  /** Hand off to the launch screen with the chosen format. */
  onLaunch: (format: "post" | "reel") => void;
  /** A text post landed; the feed should pick it up. */
  onPosted: () => void;
}) {
  const wallet = useWallet();
  const [step, setStep] = useState<"choose" | "write">("choose");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on the way *out*, not on the way in: resetting as it opens would
  // wipe a draft in the same frame someone reopened the sheet to finish it.
  useEffect(() => {
    if (visible) return;
    const timer = setTimeout(() => {
      setStep("choose");
      setError(null);
    }, 300);
    return () => clearTimeout(timer);
  }, [visible]);

  const body = draft.trim();
  const over = body.length > MAX;

  async function send() {
    if (!body || over) return;
    setSending(true);
    setError(null);
    try {
      const author = wallet.address ?? (await wallet.connect());
      await juno.createPost({ authorWallet: author, body });
      setDraft("");
      onPosted();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not post that");
    } finally {
      setSending(false);
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      // A sheet holding typed words should not vanish on a stray downward
      // swipe over the keyboard.
      dismissable={step === "choose"}
    >
      {step === "choose" ? (
        <Body_>
          <Option
            icon={<PenIcon />}
            title="Write a post"
            blurb="Text to the feed. No coin, no signature."
            onPress={() => setStep("write")}
          />
          <Option
            icon={<CoinIcon />}
            title="Launch a coin"
            blurb="A post with a real bonding curve behind it."
            accent
            onPress={() => {
              onClose();
              onLaunch("post");
            }}
          />
          <Option
            icon={<ReelIcon />}
            title="Launch a reel"
            blurb="Vertical video with a market of its own."
            onPress={() => {
              onClose();
              onLaunch("reel");
            }}
          />
        </Body_>
      ) : (
        <Body_>
          <Composer>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="What is worth a market?"
              placeholderTextColor={theme.colors.faint}
              multiline
              autoFocus
              maxLength={MAX + 40}
              style={{
                minHeight: 108,
                fontSize: 17,
                lineHeight: 24,
                color: theme.colors.text,
                textAlignVertical: "top",
              }}
            />
            <Row>
              <Caption>{wallet.address ? "Posting as your device wallet" : "A wallet is created on your first post"}</Caption>
              <Grow />
              {/* Only once it is close enough to matter — a counter from zero
                  is a rule being enforced at someone who has not broken it. */}
              {body.length > MAX - 80 ? (
                <Count $over={over}>{MAX - body.length}</Count>
              ) : null}
            </Row>
          </Composer>

          {error ? <Body style={{ color: theme.colors.neg }}>{error}</Body> : null}

          <Row gap={10}>
            <Back onPress={() => setStep("choose")} accessibilityRole="button">
              <BackText>Back</BackText>
            </Back>
            <Grow />
            <Button
              label={sending ? "Posting…" : "Post"}
              onPress={() => void send()}
              loading={sending}
              disabled={!body || over}
            />
          </Row>
        </Body_>
      )}
    </BottomSheet>
  );
}

/** Matches the server's own limit, so the button never builds a doomed request. */
const MAX = 500;

function Option({
  icon,
  title,
  blurb,
  onPress,
  accent = false,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
  onPress: () => void;
  /** The one that is Juno's actual claim, marked in lime. */
  accent?: boolean;
}) {
  return (
    <Tappable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${blurb}`}>
      <OptionRow>
        <Disc $accent={accent}>{icon}</Disc>
        <Col gap={3} style={{ flex: 1 }}>
          <Label style={{ fontWeight: "700", fontSize: 16 }}>{title}</Label>
          <Caption>{blurb}</Caption>
        </Col>
        <Chevron />
      </OptionRow>
    </Tappable>
  );
}

/* Icons inline, at the kit's stroke weight, rather than a font for three glyphs. */

function PenIcon() {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"
        stroke={theme.colors.text}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CoinIcon() {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.6} stroke={theme.colors.onLime} strokeWidth={1.9} />
      <Path
        d="M7.5 14.5 10.5 11l2.4 2.2L16.6 9"
        stroke={theme.colors.onLime}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ReelIcon() {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Rect x={6} y={3} width={12} height={18} rx={3} stroke={theme.colors.text} strokeWidth={1.9} />
      <Path
        d="M10.8 9.6 14.6 12l-3.8 2.4z"
        stroke={theme.colors.text}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const Body_ = styled.View`
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  padding-top: ${(p) => p.theme.space(1)}px;
  gap: ${(p) => p.theme.space(2)}px;
`;

const OptionRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${(p) => p.theme.space(3)}px;
  padding: ${(p) => p.theme.space(3)}px;
  border-radius: ${(p) => p.theme.radius.lg}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
`;

const Disc = styled.View<{ $accent: boolean }>`
  width: 44px;
  height: 44px;
  border-radius: ${(p) => p.theme.radius.md}px;
  align-items: center;
  justify-content: center;
  background-color: ${(p) => (p.$accent ? p.theme.colors.lime : p.theme.colors.surface)};
`;

const Composer = styled.View`
  background-color: ${(p) => p.theme.colors.surfaceAlt};
  border-radius: ${(p) => p.theme.radius.lg}px;
  padding: ${(p) => p.theme.space(4)}px;
  gap: ${(p) => p.theme.space(3)}px;
`;

const Count = styled.Text<{ $over: boolean }>`
  font-size: 12px;
  font-weight: 700;
  font-variant: tabular-nums;
  color: ${(p) => (p.$over ? p.theme.colors.neg : p.theme.colors.faint)};
`;

const Back = styled.Pressable`
  height: 48px;
  justify-content: center;
  padding-horizontal: ${(p) => p.theme.space(2)}px;
`;

const BackText = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.muted};
`;

const Grow = styled.View`
  flex: 1;
`;

