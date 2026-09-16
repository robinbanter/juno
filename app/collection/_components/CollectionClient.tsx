"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Lock, Play } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { EmptyState } from "@/components/EmptyState";
import { useAppAuth } from "@/components/useAppAuth";
import { formatUsd } from "@/lib/constants";

type Item = {
  postId: string;
  title: string;
  mediaType: "image" | "video";
  unlockPrice: string;
  creator: string | null;
  url: string;
};

/**
 * What the fan has paid for.
 *
 * The backend for this existed and shipped with no page — so people were buying
 * content they then had no way to find again. The media here is the REAL
 * unblurred asset: having paid IS the access grant, so this shows what they own
 * rather than the public teaser.
 */
export default function CollectionPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAppAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/collection", { cache: "no-store" });
    if (res.ok) setItems((await res.json()).items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }
    void load();
  }, [isLoaded, isSignedIn, router, load]);

  const spent = items.reduce((sum, i) => sum + Number(i.unlockPrice), 0);

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
          <h1 className="flex-1 text-xl font-bold leading-none">Collection</h1>
        </div>
      </header>

      <section className="mx-auto w-full max-w-md flex-1 pb-28">
        {!loading && items.length > 0 && (
          <div className="border-hairline border-b px-[18px] py-5">
            <div className="tabular text-[26px] font-bold leading-none">{items.length}</div>
            <div className="text-muted mt-1.5 text-[14px]">
              unlocked · ${formatUsd(String(spent))} spent
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-muted px-[18px] py-10 text-[14px]">Loading…</p>
        ) : items.length === 0 ? (
          <div className="flex min-h-[420px] items-center justify-center">
            <EmptyState
              icon={Lock}
              title="Nothing unlocked yet"
              body="Posts you unlock will live here — yours to revisit any time."
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 p-1.5">
            {items.map((item) => (
              <button
                key={item.postId}
                type="button"
                onClick={() => router.push(`/?post=${item.postId}`)}
                className="bg-surface-2 relative overflow-hidden rounded-md text-left"
                style={{ aspectRatio: "4 / 5" }}
              >
                {/* The real media — they paid for it. */}
                <Image
                  src={item.url}
                  alt={item.title}
                  fill
                  sizes="(max-width: 768px) 50vw, 206px"
                  className="object-cover"
                  unoptimized
                />
                {item.mediaType === "video" && (
                  <span className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/55 backdrop-blur">
                    <Play size={13} className="ml-0.5 text-white" fill="white" />
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-2 pt-6">
                  <div className="truncate text-[12.5px] font-semibold text-white">
                    {item.title}
                  </div>
                  {item.creator && (
                    <div className="truncate text-[11px] text-white/60">@{item.creator}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <BottomNav />
    </main>
  );
}
