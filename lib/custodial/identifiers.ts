import { randomBytes } from "crypto";

export function internalAddress() {
  return `0x${randomBytes(20).toString("hex")}`;
}

export function internalReference(prefix: string) {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}

export function internalTxHash() {
  return `0x${randomBytes(32).toString("hex")}`;
}
