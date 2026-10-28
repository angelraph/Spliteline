import { useCallback, useState } from 'react'
import { erc20Abi, parseAbi, parseSignature, type Hex, type TransactionReceipt } from 'viem'
import { useAccount, usePublicClient, useSignTypedData, useSwitchChain, useWriteContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { useNetwork } from '@/hooks/useNetwork'
import { explainError } from '@/lib/errors'
import { getIndexer } from '@/lib/indexer'
import { splitlineAbi } from '@/lib/splitlineAbi'

const permitReadAbi = parseAbi([
  'function nonces(address owner) view returns (uint256)',
  'function name() view returns (string)',
  'function version() view returns (string)',
])

const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export type PayPhase =
  | 'idle'
  | 'signing'
  | 'approve-wallet'
  | 'approve-confirming'
  | 'pay-wallet'
  | 'pay-confirming'
  | 'success'
  | 'error'

export type PayMode = 'allowance' | 'permit' | 'approve'

export interface PayState {
  phase: PayPhase
  mode?: PayMode
  hash?: Hex
  error?: string
  rejected?: boolean
  /** The permit signature was declined or unsupported, so approve then pay is on offer. */
  canUseApprove?: boolean
}

export function usePay() {
  const { network } = useNetwork()
  const { address: account, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const { signTypedDataAsync } = useSignTypedData()
  const publicClient = usePublicClient({ chainId: network.chainId })
  const queryClient = useQueryClient()
  const [state, setState] = useState<PayState>({ phase: 'idle' })

  const reset = useCallback(() => setState({ phase: 'idle' }), [])

  const pay = useCallback(
    async (args: { id: bigint; amount: bigint; ref: Hex; forceApprove?: boolean }): Promise<TransactionReceipt | undefined> => {
      const splitline = network.address
      if (!account || !publicClient || !splitline) {
        setState({ phase: 'error', error: 'Connect your wallet to continue.' })
        return undefined
      }
      const { id, amount, ref, forceApprove } = args
      let mode: PayMode = 'approve'

      const send = async (
        call: { address: typeof splitline; abi: typeof splitlineAbi | typeof erc20Abi; functionName: string; args: readonly unknown[] },
        phases: { wallet: PayPhase; confirming: PayPhase },
      ) => {
        setState((s) => ({ ...s, phase: phases.wallet, error: undefined }))
        const { request } = await publicClient.simulateContract({ account, ...call } as never)
        const hash = await writeContractAsync(request as never)
        setState((s) => ({ ...s, phase: phases.confirming, hash }))
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error('reverted')
        return receipt
      }

      try {
        setState({ phase: 'signing' })
        if (chainId !== network.chainId) await switchChainAsync({ chainId: network.chainId })

        const allowance = await publicClient.readContract({
          address: network.usdc,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [account, splitline],
        })

        let permitSig: { v: number; r: Hex; s: Hex; deadline: bigint } | undefined
        if (!forceApprove && allowance >= amount) {
          mode = 'allowance'
        } else if (!forceApprove) {
          try {
            const [nonce, name, version] = await Promise.all([
              publicClient.readContract({ address: network.usdc, abi: permitReadAbi, functionName: 'nonces', args: [account] }),
              publicClient.readContract({ address: network.usdc, abi: permitReadAbi, functionName: 'name' }),
              publicClient.readContract({ address: network.usdc, abi: permitReadAbi, functionName: 'version' }),
            ])
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60)
            setState({ phase: 'signing', mode: 'permit' })
            const signature = await signTypedDataAsync({
              domain: { name, version, chainId: network.chainId, verifyingContract: network.usdc },
              types: PERMIT_TYPES,
              primaryType: 'Permit',
              message: { owner: account, spender: splitline, value: amount, nonce, deadline },
            })
            const parsed = parseSignature(signature)
            permitSig = { v: Number(parsed.v ?? BigInt(27 + (parsed.yParity ?? 0))), r: parsed.r, s: parsed.s, deadline }
            mode = 'permit'
          } catch (signError) {
            const friendly = explainError(signError)
            if (friendly.rejected) {
              setState({
                phase: 'error',
                mode: 'permit',
                error: 'You declined the signature. Nothing was sent. You can approve and pay in two steps instead.',
                rejected: true,
                canUseApprove: true,
              })
              return undefined
            }
            mode = 'approve' // wallet cannot sign typed data: fall back to approve then pay
          }
        }

        setState((s) => ({ ...s, mode }))
        let receipt: TransactionReceipt
        if (mode === 'permit' && permitSig) {
          receipt = await send(
            {
              address: splitline,
              abi: splitlineAbi,
              functionName: 'payWithPermit',
              args: [id, amount, ref, permitSig.deadline, permitSig.v, permitSig.r, permitSig.s],
            },
            { wallet: 'pay-wallet', confirming: 'pay-confirming' },
          )
        } else {
          if (mode === 'approve') {
            await send(
              { address: network.usdc, abi: erc20Abi, functionName: 'approve', args: [splitline, amount] },
              { wallet: 'approve-wallet', confirming: 'approve-confirming' },
            )
          }
          setState((s) => ({ ...s, hash: undefined }))
          receipt = await send(
            { address: splitline, abi: splitlineAbi, functionName: 'pay', args: [id, amount, ref] },
            { wallet: 'pay-wallet', confirming: 'pay-confirming' },
          )
        }
        setState((s) => ({ ...s, phase: 'success', hash: receipt.transactionHash }))
        void getIndexer(network).refresh()
        void queryClient.invalidateQueries()
        return receipt
      } catch (error) {
        const friendly = explainError(error)
        setState((s) => ({ ...s, phase: 'error', error: friendly.message, rejected: friendly.rejected }))
        return undefined
      }
    },
    [account, chainId, network, publicClient, queryClient, signTypedDataAsync, switchChainAsync, writeContractAsync],
  )

  return { state, pay, reset, busy: !['idle', 'success', 'error'].includes(state.phase) }
}
