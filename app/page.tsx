import { redirect } from "next/navigation";

/**
 * The root lands on Explore.
 *
 * Juno's own surface lives under the `(juno)` route group, which has no index
 * of its own — `/explore` is the grid of every live pool, and it is the first
 * thing anyone opening this app should see.
 */
export default function RootPage() {
  redirect("/explore");
}
