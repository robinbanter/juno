import { Webhook } from "svix";

// Replicate signs webhooks with svix-style headers. The terminal state we care
// about; intermediate events are filtered out at creation (webhook_events_filter).
export type ReplicateEvent = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: string | null;
  metrics?: { predict_time?: number };
};

export type SvixHeaders = {
  "webhook-id": string | null;
  "webhook-timestamp": string | null;
  "webhook-signature": string | null;
};

/**
 * Verify a Replicate webhook and return the parsed event. THROWS on an invalid
 * signature — callers must reject with 401. `rawBody` MUST be the unparsed
 * request text (parsing first would break signature verification).
 */
export function verifyReplicateWebhook(
  rawBody: string,
  headers: SvixHeaders,
): ReplicateEvent {
  const secret = process.env.REPLICATE_WEBHOOK_SECRET;
  if (!secret) throw new Error("REPLICATE_WEBHOOK_SECRET not set");

  const wh = new Webhook(secret);
  return wh.verify(rawBody, {
    "webhook-id": headers["webhook-id"] ?? "",
    "webhook-timestamp": headers["webhook-timestamp"] ?? "",
    "webhook-signature": headers["webhook-signature"] ?? "",
  }) as ReplicateEvent;
}
