import { NextResponse } from "next/server";

import { pinFile } from "@/lib/juno/pinata";
import { clientKey } from "@/lib/juno/request";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Anything larger is a problem for the pinning step, not a real upload. */
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = /^(image|video)\//;

export async function POST(request: Request) {
  const limited = rateLimit(`upload:${clientKey(request)}`, LIMITS.upload);
  if (limited) return limited;

  if (!process.env.PINATA_JWT) {
    return NextResponse.json({ error: "Uploads are not configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  if (!ALLOWED.test(file.type)) {
    return NextResponse.json({ error: "Only images and video" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is over 25MB" }, { status: 413 });
  }

  try {
    const pinned = await pinFile(file);
    return NextResponse.json({ ...pinned, mimeType: file.type }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 502 },
    );
  }
}
