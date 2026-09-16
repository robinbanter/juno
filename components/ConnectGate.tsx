"use client";

import { Onboarding } from "./Onboarding";
import { useAppAuth } from "./useAppAuth";

/** Optional auth gate for views that intentionally want an inline sign-in wall. */
export function ConnectGate() {
  const { isLoaded, isSignedIn } = useAppAuth();

  if (!isLoaded || isSignedIn) return null;
  return <Onboarding />;
}
