import type { AppNetwork } from '@/lib/networks'

/** Canonical public origin used in shared payment links, embed code and metadata. */
export const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL?.trim() || 'https://spliteline.xyz').replace(/\/+$/, '')

export const publicUrl = (path: string) => `${PUBLIC_URL}${path.startsWith('/') ? path : `/${path}`}`

/** Path for a split page; mainnet links carry ?net=mainnet so they open on the right network. */
export function splitPath(id: bigint | string, network: AppNetwork, params?: Record<string, string | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params ?? {})) if (v) q.set(k, v)
  if (network.key === 'mainnet') q.set('net', 'mainnet')
  const query = q.toString()
  return `/s/${id}${query ? `?${query}` : ''}`
}

export function embedPath(id: bigint | string, network: AppNetwork): string {
  return `/embed/${id}${network.key === 'mainnet' ? '?net=mainnet' : ''}`
}
