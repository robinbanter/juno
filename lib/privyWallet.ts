'use client'

import algosdk from 'algosdk'
import bs58 from 'bs58'
import type { WalletAccount } from '@txnlab/use-wallet-react'

/**
 * Re-encode a Privy embedded Solana wallet's base58 ed25519 public key as an
 * Algorand address. Both are ed25519, so the address is the same 32-byte public
 * key in Algorand's base32+checksum form. Returns null on malformed input.
 */
export function solanaPubkeyToAlgorandAddress(base58PublicKey: string): string | null {
  try {
    const publicKey = bs58.decode(base58PublicKey)
    if (publicKey.length !== 32) return null
    return algosdk.encodeAddress(publicKey)
  } catch {
    return null
  }
}

/**
 * Bridge between Privy's React hooks (which can only run inside a component)
 * and the use-wallet CustomProvider (which is instantiated outside React).
 *
 * The `PrivyBridge` component keeps this object fresh on every relevant render.
 */
export interface PrivyBridge {
  ready: boolean
  authenticated: boolean
  /** base58-encoded ed25519 public key of the embedded Solana wallet (null until provisioned). */
  address: string | null
  /** Opens the Privy login modal and resolves once auth completes. */
  login: () => Promise<void>
  logout: () => Promise<void>
  /** Raw ed25519 detached signature (64 bytes) over `message`, via the embedded wallet. */
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
}

/**
 * A use-wallet CustomProvider backed by a Privy embedded Solana wallet.
 *
 * Algorand accounts *are* ed25519 keypairs, and an Algorand address is just the
 * 32-byte public key encoded in base32 + checksum. Privy's embedded Solana wallet
 * is also an ed25519 keypair, so we:
 *   1. take its base58 public key and re-encode it as an Algorand address, and
 *   2. sign Algorand transactions by asking Privy to produce a raw ed25519
 *      signature over `txn.bytesToSign()` (the "TX"-prefixed msgpack bytes).
 */
export class PrivyWalletProvider {
  private bridge: PrivyBridge | null = null
  private readyWaiters: Array<() => void> = []
  private walletWaiters: Array<() => void> = []

  /** Called by <PrivyBridge/> whenever Privy state changes. */
  setBridge(bridge: PrivyBridge): void {
    this.bridge = bridge
    if (bridge.ready) this.flush('readyWaiters')
    if (bridge.address) this.flush('walletWaiters')
  }

  private flush(key: 'readyWaiters' | 'walletWaiters'): void {
    const waiters = this[key]
    this[key] = []
    waiters.forEach((fn) => fn())
  }

  private waitFor(key: 'readyWaiters' | 'walletWaiters', predicate: () => boolean, timeoutMs = 90_000): Promise<void> {
    if (predicate()) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Privy: timed out waiting for ${key}`)), timeoutMs)
      this[key].push(() => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  private algorandAddress(base58PublicKey: string): string {
    const publicKey = bs58.decode(base58PublicKey) // 32-byte ed25519 pubkey
    if (publicKey.length !== 32) {
      throw new Error(`Privy: expected a 32-byte ed25519 public key, got ${publicKey.length} bytes`)
    }
    return algosdk.encodeAddress(publicKey)
  }

  async connect(): Promise<WalletAccount[]> {
    await this.waitFor('readyWaiters', () => !!this.bridge?.ready)
    const bridge = this.bridge!

    if (!bridge.authenticated) {
      await bridge.login()
    }
    // The embedded Solana wallet may be created a beat after auth completes.
    await this.waitFor('walletWaiters', () => !!this.bridge?.address)

    return [{ name: 'Privy', address: this.algorandAddress(this.bridge!.address!) }]
  }

  async disconnect(): Promise<void> {
    await this.bridge?.logout()
  }

  async resumeSession(): Promise<WalletAccount[] | void> {
    // use-wallet calls this on load for the persisted-active wallet.
    await this.waitFor('readyWaiters', () => !!this.bridge?.ready)
    const bridge = this.bridge!
    if (!bridge.authenticated) return
    await this.waitFor('walletWaiters', () => !!this.bridge?.address)
    return [{ name: 'Privy', address: this.algorandAddress(this.bridge!.address!) }]
  }

  async signTransactions<T extends algosdk.Transaction[] | Uint8Array[]>(
    txnGroup: T | T[],
    indexesToSign?: number[],
  ): Promise<(Uint8Array | null)[]> {
    await this.waitFor('walletWaiters', () => !!this.bridge?.address)
    const bridge = this.bridge!
    const account = this.algorandAddress(bridge.address!)

    // use-wallet hands us a single flat group. Guard against a nested group.
    const flat = (Array.isArray(txnGroup[0]) ? (txnGroup as T[]).flat() : txnGroup) as (
      | algosdk.Transaction
      | Uint8Array
    )[]

    const signed: (Uint8Array | null)[] = []
    for (let i = 0; i < flat.length; i++) {
      const item = flat[i]
      const txn = item instanceof Uint8Array ? algosdk.decodeUnsignedTransaction(item) : item

      // If use-wallet told us which indexes to sign, honor exactly those.
      // Otherwise, sign every txn authorized by the Privy account.
      const shouldSign = indexesToSign
        ? indexesToSign.includes(i)
        : algosdk.encodeAddress(txn.sender.publicKey) === account
      if (!shouldSign) {
        signed.push(null)
        continue
      }

      const signature = await bridge.signMessage(txn.bytesToSign())
      if (signature.length !== 64) {
        throw new Error(`Privy: expected a 64-byte ed25519 signature, got ${signature.length} bytes`)
      }
      signed.push(txn.attachSignature(account, signature))
    }

    return signed
  }
}

/** Shared instance: registered with the WalletManager *and* fed by <PrivyBridge/>. */
export const privyWalletProvider = new PrivyWalletProvider()
