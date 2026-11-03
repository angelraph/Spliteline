import { useMemo } from 'react'
import { erc20Abi, type Address } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { splitlineAbi } from '@/lib/splitlineAbi'
import { useNetwork } from '@/hooks/useNetwork'
import { shareOf } from '@/lib/usdc'

export interface SplitView {
  id: bigint
  name: string
  recipients: Address[]
  bps: number[]
  depositAddress: Address
  totalReceived: bigint
  /** USDC sitting in the deposit address that the next claim, release or sweep will credit. */
  pending: bigint
  released: bigint[]
  /** What each recipient would receive right now, including pending deposits (matches auto-sweep). */
  claimable: bigint[]
}

export function parseSplitId(raw: string | undefined): bigint | undefined {
  if (!raw || !/^\d{1,18}$/.test(raw)) return undefined
  const id = BigInt(raw)
  return id > 0n ? id : undefined
}

export function useSplit(id: bigint | undefined) {
  const { network } = useNetwork()
  const address = network.address
  const enabled = id !== undefined && Boolean(address)

  const core = useReadContract({
    address,
    abi: splitlineAbi,
    functionName: 'getSplit',
    args: [id ?? 0n],
    chainId: network.chainId,
    query: { enabled, refetchInterval: 10_000, retry: false },
  })

  const recipients = core.data?.[1]
  const depositAddress = core.data?.[3]

  const balance = useReadContract({
    address: network.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [depositAddress ?? '0x0000000000000000000000000000000000000000'],
    chainId: network.chainId,
    query: { enabled: Boolean(depositAddress), refetchInterval: 8_000 },
  })

  const releasedReads = useReadContracts({
    contracts:
      id !== undefined && recipients && address
        ? recipients.map((r) => ({
            address,
            abi: splitlineAbi,
            functionName: 'released' as const,
            args: [id, r] as const,
            chainId: network.chainId,
          }))
        : [],
    query: { enabled: Boolean(core.data), refetchInterval: 8_000 },
  })

  const coreData = core.data
  const releasedData = releasedReads.data
  const pendingData = balance.data

  const view = useMemo<SplitView | undefined>(() => {
    if (!coreData || id === undefined || !releasedData || pendingData === undefined) return undefined
    const [name, recips, bpsRaw, deposit, totalReceived] = coreData
    const pending = pendingData
    const bps = bpsRaw.map(Number)
    const released = recips.map((_, i) => {
      const r = releasedData[i]
      return r && r.status === 'success' ? r.result : 0n
    })
    const effectiveTotal = totalReceived + pending
    const claimable = bps.map((b, i) => {
      const entitled = shareOf(effectiveTotal, b)
      return entitled > released[i] ? entitled - released[i] : 0n
    })
    return { id, name, recipients: [...recips], bps, depositAddress: deposit, totalReceived, pending, released, claimable }
  }, [coreData, releasedData, pendingData, id])

  const errorText = core.error ? String(core.error.message) : ''
  const notFound = Boolean(core.error) && /SplitNotFound|0xf7a4|reverted/i.test(errorText)

  return {
    data: view,
    isLoading: enabled && (core.isLoading || (Boolean(core.data) && (releasedReads.isLoading || balance.isLoading))),
    notFound,
    error: core.error && !notFound ? core.error : (balance.error ?? releasedReads.error),
    refetch: async () => {
      await core.refetch()
      await balance.refetch()
      await releasedReads.refetch()
    },
  }
}
