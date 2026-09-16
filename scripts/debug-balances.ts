import { desc, eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { getPgPool } from "../lib/db/pool";
import { users, userBalances, posts, unlocks } from "../lib/db/schema";

async function main() {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      clerkId: users.clerkId,
      email: users.email,
      displayName: users.displayName,
      available: userBalances.availableBalance,
      escrowed: userBalances.escrowedBalance,
    })
    .from(users)
    .leftJoin(userBalances, eq(userBalances.userId, users.id))
    .orderBy(desc(userBalances.availableBalance));

  console.log("=== users + balances ===");
  for (const r of rows) {
    console.log(
      `${r.id}  clerk=${r.clerkId ?? "-"}  email=${r.email ?? "-"}  avail=${r.available ?? "(none)"}  escrow=${r.escrowed ?? "-"}`,
    );
  }

  const pubPosts = await db
    .select({ id: posts.id, title: posts.title, price: posts.unlockPrice, published: posts.isPublished })
    .from(posts)
    .orderBy(desc(posts.createdAt))
    .limit(10);
  console.log("\n=== posts (latest 10) ===");
  for (const p of pubPosts) {
    console.log(`${p.id}  $${p.price}  published=${p.published}  ${p.title}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPgPool().end();
    } catch {
      /* never opened */
    }
  });
