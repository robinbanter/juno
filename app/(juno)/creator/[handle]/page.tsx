import { notFound } from "next/navigation";

import { DEMO_ALL, DEMO_CREATOR } from "@/lib/juno/mock";
import { ProfileView } from "./ProfileView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return { title: `$${handle}` };
}

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;

  // Swap for a lookup by handle once profiles are indexed; the shapes the
  // view consumes are already the ones `lib/juno/dbc.ts` produces.
  const creator = handle === DEMO_CREATOR.handle ? DEMO_CREATOR : null;
  if (!creator) notFound();

  return (
    <div className="mx-auto w-full max-w-[600px] px-0 pt-4 sm:px-4">
      <ProfileView creator={creator} coins={DEMO_ALL} />
    </div>
  );
}
