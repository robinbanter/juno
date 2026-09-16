import { redirect } from "next/navigation";

// Clerk OAuth callback is retired — Norr authenticates via the Privy wallet.
// Any stray hit here just returns to the app.
export default function SsoCallbackPage() {
  redirect("/");
}
