import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { DEFAULT_NETWORK, NETWORKS, type AppNetwork } from '@/lib/networks'

interface NetworkContextValue {
  network: AppNetwork
  networks: AppNetwork[]
  setNetworkKey: (key: AppNetwork['key']) => void
}

const STORAGE_KEY = 'spliteline:network'
const NetworkContext = createContext<NetworkContextValue | undefined>(undefined)

/** A `?net=mainnet` link wins over the saved preference; testnet is the default. */
function initialNetwork(): AppNetwork {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('net')
    const urlMatch = NETWORKS.find((n) => n.key === fromUrl)
    if (urlMatch) return urlMatch
    const saved = localStorage.getItem(STORAGE_KEY)
    return NETWORKS.find((n) => n.key === saved) ?? DEFAULT_NETWORK
  } catch {
    return DEFAULT_NETWORK
  }
}

function syncUrl(key: AppNetwork['key']) {
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.has('net') || key !== DEFAULT_NETWORK.key) {
      if (key === DEFAULT_NETWORK.key) url.searchParams.delete('net')
      else url.searchParams.set('net', key)
      window.history.replaceState(window.history.state, '', url)
    }
  } catch {
    /* the address bar is cosmetic */
  }
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<AppNetwork>(initialNetwork)

  const setNetworkKey = useCallback((key: AppNetwork['key']) => {
    const next = NETWORKS.find((n) => n.key === key)
    if (!next) return
    setNetwork(next)
    syncUrl(key)
    try {
      localStorage.setItem(STORAGE_KEY, key)
    } catch {
      /* preference is optional */
    }
  }, [])

  const value = useMemo(() => ({ network, networks: NETWORKS, setNetworkKey }), [network, setNetworkKey])
  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext)
  if (!ctx) throw new Error('useNetwork must be used inside NetworkProvider')
  return ctx
}

/** Wallet state relative to the selected app network. */
export function useWalletStatus() {
  const { network } = useNetwork()
  const { address, chainId, isConnected, isConnecting, isReconnecting } = useAccount()
  return {
    network,
    address,
    isConnected,
    isConnecting: isConnecting || isReconnecting,
    walletChainId: chainId,
    wrongNetwork: isConnected && chainId !== network.chainId,
  }
}
