import { useCallback, useState } from 'react'
import type { Abi, Address, TransactionReceipt, Hex } from 'viem'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { useNetwork } from '@/hooks/useNetwork'
import { explainError } from '@/lib/errors'
import { getIndexer } from '@/lib/indexer'

export type TxPhase = 'idle' | 'wallet' | 'confirming' | 'success' | 'error'

export interface TxState {
  phase: TxPhase
  hash?: Hex
  error?: string
  rejected?: boolean
}

export interface WriteCall {
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
}

/**
 * One contract write: switch network if needed, simulate (so contract errors are readable before the
 * wallet opens), sign, then wait for the real receipt. States come from the wallet and the chain only.
 */
export function useTx() {
  const { network } = useNetwork()
  const { address: account, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: network.chainId })
  const queryClient = useQueryClient()
  const [state, setState] = useState<TxState>({ phase: 'idle' })

  const reset = useCallback(() => setState({ phase: 'idle' }), [])

  const run = useCallback(
    async (call: WriteCall): Promise<TransactionReceipt | undefined> => {
      if (!account || !publicClient) {
        setState({ phase: 'error', error: 'Connect your wallet to continue.' })
        return undefined
      }
      try {
        setState({ phase: 'wallet' })
        if (chainId !== network.chainId) await switchChainAsync({ chainId: network.chainId })
        const { request } = await publicClient.simulateContract({
          account,
          address: call.address,
          abi: call.abi,
          functionName: call.functionName,
          args: call.args,
        } as never)
        const hash = await writeContractAsync(request as never)
        setState({ phase: 'confirming', hash })
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') {
          setState({ phase: 'error', hash, error: 'The transaction was mined but reverted. Nothing changed.' })
          return undefined
        }
        setState({ phase: 'success', hash })
        void getIndexer(network).refresh()
        void queryClient.invalidateQueries()
        return receipt
      } catch (error) {
        const friendly = explainError(error)
        setState((s) => ({ phase: 'error', hash: s.hash, error: friendly.message, rejected: friendly.rejected }))
        return undefined
      }
    },
    [account, chainId, network, publicClient, queryClient, switchChainAsync, writeContractAsync],
  )

  return { state, run, reset, busy: state.phase === 'wallet' || state.phase === 'confirming' }
}
