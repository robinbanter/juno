import type { Metadata } from "next";

export const metadata: Metadata = { title: "Age & consent records" };

export default function RecordsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
