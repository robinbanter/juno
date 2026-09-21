import { redirect } from "next/navigation";

import { HomeFeed } from "@/components/HomeFeed";

/**
 * One codebase, two products, and only one of them can own `/`.
 *
 * Norr and Juno share this Next app. On Norr's own deployment the root is
 * Norr's feed and always has been. On a deployment that exists to serve Juno
 * — the hackathon build, whose service, project and domain are all named for
 * it — the root rendering Norr's landing page is not a cosmetic mismatch: it
 * is the entire first impression. Anyone handed the bare domain saw a
 * different product's sign-in, and Juno was reachable only by knowing to type
 * `/explore`.
 *
 * `JUNO_ROOT` is what distinguishes the two deployments. It is read at request
 * time rather than baked in, so the same image can serve either, and Norr's
 * deployment — which does not set it — keeps the root it has always had.
 */
export default function FeedPage() {
  if (process.env.JUNO_ROOT === "1") redirect("/explore");
  return <HomeFeed />;
}
