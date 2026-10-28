import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { useNetwork } from '@/hooks/useNetwork'

/** Timestamp (seconds) of a block, cached forever since mined blocks never change. */
export function useBlockTime(block: bigint | undefined) {
  const { network } = useNetwork()
  const client = usePublicClient({ chainId: network.chainId })
  return useQuery({
    queryKey: ['blockTime', network.chainId, block?.toString()],
    enabled: block !== undefined && Boolean(client),
    staleTime: Infinity,
    retry: 2,
    queryFn: async () => {
      const b = await client!.getBlock({ blockNumber: block })
      return Number(b.timestamp)
    },
  })
}

export function timeAgo(seconds: number | undefined): string {
  if (!seconds) return ''
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - seconds)
  if (diff < 10) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
