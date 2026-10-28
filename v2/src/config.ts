/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { requireChain } from '@/onchain-facts'
import { registerChain } from './tracing'

const arcTestnetRpc = requireChain(arcTestnet.id).rpcUrls[0]

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnetRpc)
const arcMainnetRpc = requireChain(arc.id).rpcUrls[0]
registerChain(arc.id, arcMainnetRpc)

export const config = createConfig({
  chains: [arcTestnet, arc, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(arcTestnetRpc, { batch: true }),
    [arc.id]: http(arcMainnetRpc, { batch: true }),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
