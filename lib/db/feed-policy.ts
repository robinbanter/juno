import { eq, ne, or } from "drizzle-orm";
import { posts } from "./schema";

const DEV_UNVEIL_TEST_VIDEO_KEY =
  "blur-jobs/manual-42032a19-a7db-4ea0-b075-430fb3cb7460/blurred.mp4";
const DEV_UNVEIL_TEST_POST_ID = "42032a19-a7db-4ea0-b075-430fb3cb7460";

export function hideOwnPostsExceptDevUnveilTestPost(excludeCreatorId: string) {
  const ownPostFilter = ne(posts.creatorId, excludeCreatorId);
  if (process.env.NODE_ENV !== "development") return ownPostFilter;

  // Keep the processed test video visible in the dev feed so the dev account can
  // repeatedly exercise the per-region unveil flow, even when it owns the post.
  return or(ownPostFilter, eq(posts.blurredPreviewUrl, DEV_UNVEIL_TEST_VIDEO_KEY));
}

export function shouldResetDevUnveilFixture(postId: string) {
  return process.env.NODE_ENV === "development" && postId === DEV_UNVEIL_TEST_POST_ID;
}
