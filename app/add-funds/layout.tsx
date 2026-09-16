import type { Metadata } from "next";

export const metadata: Metadata = { title: "Add funds" };

export default function AddFundsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
