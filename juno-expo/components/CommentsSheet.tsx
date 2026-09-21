import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, TextInput } from "react-native";
import Svg, { Path } from "react-native-svg";
import styled from "styled-components/native";

import { BottomSheet } from "./BottomSheet";
import { Identicon } from "./art";
import { Tappable } from "./Press";
import { Body, Caption, Label, Row } from "./kit";
import { juno } from "../lib/api";
import { since } from "../lib/useApi";
import { useWallet } from "../lib/wallet";
import { theme } from "../theme";

/**
 * The conversation, from the bottom.
 *
 * Comments used to be a tab you navigated to, which meant leaving the chart
 * and the buy button to read what people said about them — and coming back was
 * a separate decision. A sheet keeps the market on screen behind the scrim, so
 * reading the room and acting on it are the same visit.
 *
 * ## Liking is local, and says so
 *
 * There is no likes table, and inventing a number that only exists on this
 * phone would be the exact kind of fabricated figure this app refuses
 * everywhere else. So the heart is a **draft of a reaction**: it fills, it
 * counts nothing, and no total is displayed beside it. When a likes table
 * exists the control is already here and the count can become real.
 */
/**
 * What the sheet is a conversation about.
 *
 * Two stores, one surface. A coin's comments live in Mongo keyed by mint; a
 * post's replies are rows in Postgres keyed by a parent id. They are the same
 * *interaction* — read what people said, say something back — so they get the
 * same drawer rather than one drawer and one whole screen.
 */
export type CommentsTarget =
  | { kind: "coin"; mint: string; symbol: string }
  | { kind: "post"; postId: string };

/** One row, flattened from whichever store it came out of. */
type Row = {
  id: string;
  wallet: string;
  body: string;
  createdAt: string;
  side?: "buy" | "sell";
};

export function CommentsSheet({
  visible,
  onClose,
  target,
  onPosted,
}: {
  visible: boolean;
  onClose: () => void;
  target: CommentsTarget;
  /** Something landed; the screen behind should pick up the new count. */
  onPosted?: () => void;
}) {
  const wallet = useWallet();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [liked, setLiked] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setError(null);
    try {
      if (target.kind === "coin") {
        const { comments } = await juno.comments(target.mint);
        setRows(comments);
        return;
      }
      const { replies } = await juno.post(target.postId);
      setRows(
        replies.map((reply) => ({
          id: reply.id,
          wallet: reply.author.wallet,
          body: reply.body,
          createdAt: reply.timestamp,
        })),
      );
    } catch (caught) {
      setRows(null);
      setError(caught instanceof Error ? caught.message : "Could not load the comments");
    }
  }, [target]);

  // Read on the way in rather than on mount: the sheet is mounted for the
  // whole life of the screen behind it, and a list read on mount would be
  // stale by the time anyone opened it.
  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const address = wallet.address ?? (await wallet.connect());
      if (!address) throw new Error("No wallet available");

      if (target.kind === "coin") {
        const { comment } = await juno.addComment({
          coin: target.mint,
          wallet: address,
          body,
        });
        // Prepended from the server's own row, not from the draft: the id and
        // timestamp have to be the real ones or the key collides on the next
        // read.
        setRows((current) => [comment, ...(current ?? [])]);
      } else {
        await juno.createPost({ authorWallet: address, body, parentId: target.postId });
        // A reply's id comes back without its author or timestamp shaped like
        // a row, so the list is re-read rather than guessed at.
        await load();
      }
      setDraft("");
      onPosted?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not post that");
    } finally {
      setSending(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} dismissable={draft.trim() === ""}>
      <Head>
        <Title>Comments</Title>
      </Head>

      <List>
        {rows === null && error === null ? (
          <Centre>
            <ActivityIndicator color={theme.colors.muted} />
          </Centre>
        ) : error ? (
          <Centre>
            <Body muted style={{ textAlign: "center" }}>
              {error}
            </Body>
            <Tappable onPress={() => void load()} to={0.96}>
              <Retry>
                <RetryText>Try again</RetryText>
              </Retry>
            </Tappable>
          </Centre>
        ) : rows!.length === 0 ? (
          <Centre>
            <Body muted style={{ textAlign: "center" }}>
              {target.kind === "coin"
                ? `Nothing said about $${target.symbol} yet. Say the first thing.`
                : "No replies yet. Say the first thing."}
            </Body>
          </Centre>
        ) : (
          <FlatList
            data={rows!}
            keyExtractor={(row) => row.id}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}
            renderItem={({ item }) => (
              <CommentRow
                comment={item}
                liked={liked.has(item.id)}
                onLike={() =>
                  setLiked((current) => {
                    const next = new Set(current);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  })
                }
              />
            )}
          />
        )}
      </List>

      <Composer>
        <Identicon seed={wallet.address ?? "anon"} size={30} />
        <Field>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a comment..."
            placeholderTextColor={theme.colors.faint}
            multiline
            maxLength={280}
            style={{
              flex: 1,
              maxHeight: 88,
              fontSize: theme.type.body.size,
              color: theme.colors.text,
            }}
          />
        </Field>
        {draft.trim() ? (
          <Tappable onPress={() => void send()} to={0.94}>
            <Send $busy={sending}>
              <SendText>{sending ? "…" : "Post"}</SendText>
            </Send>
          </Tappable>
        ) : null}
      </Composer>
    </BottomSheet>
  );
}

function CommentRow({
  comment,
  liked,
  onLike,
}: {
  comment: Row;
  liked: boolean;
  onLike: () => void;
}) {
  return (
    <Entry>
      <Identicon seed={comment.wallet} size={34} />
      <Body_>
        <Row gap={6}>
          <Label style={{ fontWeight: "700" }} numberOfLines={1}>
            {comment.wallet.slice(0, 4)}…{comment.wallet.slice(-4)}
          </Label>
          <Caption>{since(comment.createdAt)}</Caption>
          {/* A comment that came with a trade carries which way it went. The
              signature is on the row too, so this is a checkable claim rather
              than a boast. */}
          {comment.side ? (
            <Side $buy={comment.side === "buy"}>{comment.side === "buy" ? "bought" : "sold"}</Side>
          ) : null}
        </Row>
        <Text_>{comment.body}</Text_>
      </Body_>

      <Tappable onPress={onLike} to={0.86}>
        <Heart hitSlop={10} accessibilityRole="button" accessibilityLabel={liked ? "Unlike" : "Like"}>
          <HeartGlyph filled={liked} />
        </Heart>
      </Tappable>
    </Entry>
  );
}

function HeartGlyph({ filled }: { filled: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 20.2S3.8 15.4 3.8 9.6A4.6 4.6 0 0 1 12 6.9a4.6 4.6 0 0 1 8.2 2.7c0 5.8-8.2 10.6-8.2 10.6Z"
        fill={filled ? theme.colors.neg : "none"}
        stroke={filled ? theme.colors.neg : theme.colors.faint}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const Head = styled.View`
  align-items: center;
  padding-bottom: ${(p) => p.theme.space(3)}px;
  border-bottom-width: ${(p) => p.theme.hairline}px;
  border-bottom-color: ${(p) => p.theme.colors.line};
`;

const Title = styled.Text`
  font-size: ${(p) => p.theme.type.title.size}px;
  line-height: ${(p) => p.theme.type.title.height}px;
  letter-spacing: ${(p) => p.theme.type.title.tracking}px;
  font-weight: 700;
  color: ${(p) => p.theme.colors.text};
`;

/* A fixed height, so the sheet does not resize as comments load — and so the
   composer stays where a thumb last saw it. */
const List = styled.View`
  height: 420px;
  padding-horizontal: ${(p) => p.theme.space(4)}px;
`;

const Centre = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: ${(p) => p.theme.space(3)}px;
`;

const Retry = styled.View`
  padding: 10px 18px;
  border-radius: ${(p) => p.theme.radius.pill}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
`;

const RetryText = styled.Text`
  font-size: ${(p) => p.theme.type.caption.size}px;
  font-weight: 700;
  color: ${(p) => p.theme.colors.text};
`;

const Entry = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 10px;
  padding-vertical: ${(p) => p.theme.space(3)}px;
`;

const Body_ = styled.View`
  flex: 1;
  gap: 3px;
`;

const Text_ = styled.Text`
  font-size: ${(p) => p.theme.type.body.size}px;
  line-height: ${(p) => p.theme.type.body.height}px;
  letter-spacing: ${(p) => p.theme.type.body.tracking}px;
  color: ${(p) => p.theme.colors.text};
`;

const Side = styled.Text<{ $buy: boolean }>`
  font-size: ${(p) => p.theme.type.micro.size}px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${(p) => (p.$buy ? p.theme.colors.pos : p.theme.colors.neg)};
`;

const Heart = styled.View`
  padding-top: 4px;
`;

const Composer = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: ${(p) => p.theme.space(3)}px ${(p) => p.theme.space(4)}px
    ${(p) => p.theme.space(4)}px;
  border-top-width: ${(p) => p.theme.hairline}px;
  border-top-color: ${(p) => p.theme.colors.line};
`;

const Field = styled.View`
  flex: 1;
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${(p) => p.theme.space(3)}px;
  padding-vertical: 10px;
  border-radius: ${(p) => p.theme.radius.pill}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
`;

const Send = styled.View<{ $busy: boolean }>`
  padding: 10px 16px;
  border-radius: ${(p) => p.theme.radius.pill}px;
  background-color: ${(p) => p.theme.colors.lime};
  opacity: ${(p) => (p.$busy ? 0.6 : 1)};
`;

const SendText = styled.Text`
  font-size: ${(p) => p.theme.type.caption.size}px;
  font-weight: 800;
  color: ${(p) => p.theme.colors.onLime};
`;
