import { createPost, listPosts } from "@/lib/juno/posts";
import {
  junoHandler,
  junoJson,
  junoOptions,
  readJson,
  requireString,
} from "@/lib/juno/api";

export const dynamic = "force-dynamic";
export const OPTIONS = junoOptions;

export async function GET(request: Request) {
  return junoHandler(async () => {
    const url = new URL(request.url);
    const before = url.searchParams.get("before");
    const posts = await listPosts({
      limit: Number(url.searchParams.get("limit") ?? 30) || 30,
      before: before ? new Date(before) : undefined,
      authorWallet: url.searchParams.get("author") ?? undefined,
      baseMint: url.searchParams.get("mint") ?? undefined,
    });
    return junoJson({ posts });
  });
}

/**
 * Write a post.
 *
 * The author is whatever wallet the client says it is. That is deliberate and
 * worth being explicit about: a post is public, unprivileged text, and nothing
 * here spends money or reads anything private. Attributing one to the wrong
 * wallet is the limit of the damage, and gating it behind a signature would
 * mean a wallet prompt to write a sentence.
 */
export async function POST(request: Request) {
  return junoHandler(async () => {
    const body = await readJson<Record<string, unknown>>(request);

    const post = await createPost({
      authorWallet: requireString(body.authorWallet, "authorWallet"),
      /*
       * Not truncated here.
       *
       * Slicing to the limit made an over-length post return 201 having
       * silently thrown away the tail — the author was told it worked and the
       * end of what they wrote was gone. `createPost` rejects it instead, so
       * the caller finds out.
       */
      body: requireString(body.body, "body"),
      baseMint: typeof body.baseMint === "string" ? body.baseMint : null,
      mediaUrl: typeof body.mediaUrl === "string" ? body.mediaUrl : null,
      mediaMime: typeof body.mediaMime === "string" ? body.mediaMime : null,
      parentId: typeof body.parentId === "string" ? body.parentId : null,
    });

    return junoJson({ post }, { status: 201 });
  });
}
