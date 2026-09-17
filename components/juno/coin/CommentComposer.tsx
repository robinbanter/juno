"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

import { cn } from "@/lib/utils";
import { shortAddress, since } from "@/lib/juno/format";
import { identicon } from "@/lib/juno/identicon";
import type { Comment } from "@/lib/juno/types";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";

const MAX = 280;

/**
 * Post a comment on a coin.
 *
 * Optimistic: the comment appears immediately and is rolled back if the write
 * fails. A social feed that waits on a round trip before showing your own
 * words feels broken even when it is working.
 */
export function CommentComposer({
  coinMint,
  onPosted,
}: {
  coinMint: string;
  onPosted: (comment: Comment) => void;
}) {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = MAX - body.length;

  async function submit() {
    if (!publicKey) {
      setVisible(true);
      return;
    }
    const text = body.trim();
    if (!text) return;

    setBusy(true);
    setError(null);
    // Clear the field first so the next thought can be typed immediately.
    setBody("");

    try {
      const response = await fetch("/api/juno/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ coin: coinMint, wallet: publicKey.toBase58(), body: text }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not post");

      onPosted({
        id: payload.comment.id,
        actor: {
          handle: shortAddress(payload.comment.wallet, 4, 4),
          avatarUrl: identicon(payload.comment.wallet),
        },
        body: payload.comment.body,
        timestamp: payload.comment.createdAt,
      });
    } catch (e) {
      // Put the text back rather than losing what they wrote.
      setBody(text);
      setError(e instanceof Error ? e.message : "Could not post");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-start gap-2.5">
        {publicKey ? (
          <Avatar src={identicon(publicKey.toBase58())} alt="You" size={28} />
        ) : (
          <span className="size-7 shrink-0 rounded-full bg-j-surface" />
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX))}
          onKeyDown={(e) => {
            // Enter posts; Shift+Enter is a newline.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={2}
          placeholder={publicKey ? "Add a comment…" : "Connect a wallet to comment"}
          aria-label="Add a comment"
          className="min-h-[56px] w-full resize-none rounded-j border border-j-line bg-j-input px-3 py-2 text-[14px] placeholder:text-j-faint focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none"
        />
      </div>

      <div className="flex items-center justify-end gap-3">
        {error && (
          <span role="alert" className="mr-auto text-[12px] text-j-danger">
            {error}
          </span>
        )}
        <span
          className={cn(
            "text-[12px] tabular-nums",
            remaining < 20 ? "text-j-danger" : "text-j-faint",
          )}
        >
          {remaining}
        </span>
        <Button
          variant="contrast"
          size="sm"
          disabled={busy || body.trim().length === 0}
          onClick={() => void submit()}
        >
          {busy ? "Posting…" : publicKey ? "Post" : "Connect"}
        </Button>
      </div>
    </div>
  );
}
