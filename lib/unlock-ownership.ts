/**
 * Does an unlock grant lasting ownership?
 *
 * It must. A fan pays to unlock a post; if that isn't recorded, reopening the
 * post charges them again for something they already bought. With real USDC that
 * is taking money for nothing, silently, every time.
 *
 * This used to default to OFF, which made `unlockWithCustodialBalance` DELETE any
 * prior unlock row and charge afresh — measured: two unlocks of the same post
 * took a balance 10.20 -> 9.20 -> 8.20. It also made `getUnlockedPosts` return
 * nothing, so a fan's Collection was permanently empty.
 *
 * The demo behaviour this existed for is already covered, more precisely, by
 * `shouldResetDevUnveilFixture` — which re-unlocks one fixture post in
 * development only. So the global switch just wasn't needed for that.
 *
 * `PERSIST_UNLOCK_OWNERSHIP=false` still forces the old behaviour for a
 * throwaway demo. Never set it anywhere real: with it off, every fan pays for
 * every view.
 */
export function persistUnlockOwnership() {
  // `||`, not `??`: PERSIST_UNLOCK_OWNERSHIP= in a .env is an empty string, which
  // is not nullish — `??` would keep it and silently re-enable double charging.
  return (process.env.PERSIST_UNLOCK_OWNERSHIP?.trim() || "true").toLowerCase() !== "false";
}
