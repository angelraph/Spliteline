import { isAddress, type Address, type Chain } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import { getUsdc, requireChain } from '@/onchain-facts'

/**
 * Networks Spliteline can talk to. The contract address and deploy block come from env vars,
 * so a deployment can be re-pointed without touching code.
 */
export interface AppNetwork {
  key: 'testnet' | 'mainnet'
  label: string
  chain: Chain
  chainId: number
  /** Splitline contract, or undefined when this network has no deployment configured. */
  address: Address | undefined
  /** First block the indexer reads. */
  deployBlock: bigint
  usdc: Address
  rpcUrl: string
  explorerBase: string
  isTestnet: boolean
}

function readAddress(value: string | undefined): Address | undefined {
  return value && isAddress(value) ? value : undefined
}

function readBlock(value: string | undefined): bigint {
  if (!value || !/^\d+$/.test(value)) return 0n
  return BigInt(value)
}

function build(chain: Chain, key: AppNetwork['key'], address?: string, deployBlock?: string): AppNetwork {
  const fact = requireChain(chain.id)
  const usdc = getUsdc(chain.id)
  if (!usdc) throw new Error(`USDC is not registered for chain ${chain.id}`)
  return {
    key,
    label: fact.name,
    chain,
    chainId: chain.id,
    address: readAddress(address),
    deployBlock: readBlock(deployBlock),
    usdc: usdc.address as Address,
    rpcUrl: fact.rpcUrls[0],
    explorerBase: fact.explorerBase,
    isTestnet: fact.isTestnet,
  }
}

export const NETWORKS: AppNetwork[] = [
  build(
    arcTestnet,
    'testnet',
    import.meta.env.VITE_SPLITLINE_ADDRESS_TESTNET,
    import.meta.env.VITE_SPLITLINE_DEPLOY_BLOCK_TESTNET,
  ),
  build(
    arc,
    'mainnet',
    import.meta.env.VITE_SPLITLINE_ADDRESS_MAINNET,
    import.meta.env.VITE_SPLITLINE_DEPLOY_BLOCK_MAINNET,
  ),
]

/** Testnet is always the default. */
export const DEFAULT_NETWORK = NETWORKS[0]

export const COMING_SOON_MAINNET = 'Coming soon on mainnet'

export function getNetworkByChainId(chainId: number | undefined): AppNetwork | undefined {
  return NETWORKS.find((n) => n.chainId === chainId)
}

export const explorerTx = (n: AppNetwork, hash: string) => `${n.explorerBase}/tx/${hash}`
export const explorerAddress = (n: AppNetwork, address: string) => `${n.explorerBase}/address/${address}`
