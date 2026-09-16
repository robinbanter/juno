import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import {
  getAlgoBalance,
  getAssetBalance,
  getPaymentAssetId,
  isOptedIn,
} from "@/lib/algorand";

// Public read of an address's on-chain balances (ALGO + USDC).
// Reads public chain data, so no auth is required.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address || !algosdk.isValidAddress(address)) {
    return NextResponse.json({ error: "Invalid Algorand address" }, { status: 400 });
  }

  try {
    const assetId = getPaymentAssetId();
    const [microAlgos, asaUnits, optedIn] = await Promise.all([
      getAlgoBalance(address),
      getAssetBalance(address, assetId),
      isOptedIn(address, assetId),
    ]);
    return NextResponse.json({
      address,
      assetId,
      algo: (Number(microAlgos) / 1e6).toFixed(6),
      usdc: (Number(asaUnits) / 1e6).toFixed(2),
      optedIn,
    });
  } catch {
    return NextResponse.json({ error: "Could not read on-chain balance" }, { status: 502 });
  }
}
