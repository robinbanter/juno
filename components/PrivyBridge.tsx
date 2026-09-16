'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePrivy, useLogin } from '@privy-io/react-auth'
import { useWallets, useSignMessage } from '@privy-io/react-auth/solana'
import { privyWalletProvider } from '@/lib/privyWallet'

/**
 * Invisible component that lives inside <PrivyProvider> and keeps the
 * use-wallet CustomProvider (privyWalletProvider) fed with Privy's live state
 * and hook-bound functions. Renders nothing.
 */
export function PrivyBridge() {
  const { ready, authenticated, logout } = usePrivy()
  const { wallets } = useWallets()
  const { signMessage } = useSignMessage()

  // Privy's embedded Solana wallet (ed25519). Its `address` is a base58 pubkey.
  const embedded = wallets.find((w) => w.standardWallet.name === 'Privy') ?? wallets[0] ?? null

  // Bridge Privy's callback-style login into a promise connect() can await.
  const loginResolver = useRef<{ resolve: () => void; reject: (e: unknown) => void } | null>(null)
  const { login } = useLogin({
    onComplete: () => {
      loginResolver.current?.resolve()
      loginResolver.current = null
    },
    onError: (error) => {
      loginResolver.current?.reject(new Error(`Privy login failed: ${String(error)}`))
      loginResolver.current = null
    },
  })

  const loginAsync = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        loginResolver.current = { resolve, reject }
        login()
      }),
    [login],
  )

  const signMessageAsync = useCallback(
    async (message: Uint8Array): Promise<Uint8Array> => {
      if (!embedded) throw new Error('Privy: no embedded Solana wallet available to sign with')
      const { signature } = await signMessage({ message, wallet: embedded })
      return signature
    },
    [embedded, signMessage],
  )

  useEffect(() => {
    privyWalletProvider.setBridge({
      ready,
      authenticated,
      address: embedded?.address ?? null,
      login: loginAsync,
      logout,
      signMessage: signMessageAsync,
    })
  }, [ready, authenticated, embedded, loginAsync, logout, signMessageAsync])

  return null
}
