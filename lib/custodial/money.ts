export function normalizeMoney(input: unknown): string {
  const raw = typeof input === "string" ? input.trim() : String(input ?? "");
  if (!/^\d{1,6}(\.\d{1,8})?$/.test(raw)) {
    throw new Error("Invalid amount");
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Invalid amount");
  }

  return value.toFixed(8);
}
