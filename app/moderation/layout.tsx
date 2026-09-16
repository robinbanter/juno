import type { Metadata } from "next";

// Never indexed: it isn't secret (the API fails closed and is the real
// boundary), but there's no reason to advertise it either.
export const metadata: Metadata = {
  title: "Moderation",
  robots: { index: false, follow: false },
};

export default function ModerationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
