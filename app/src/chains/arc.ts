import { defineChain } from "viem";

// Arc is not in viem's built-in chain list yet, so it's defined explicitly here.
// Network parameters confirmed against https://docs.arc.io/arc/references/rpc-endpoints
// and https://docs.arc.io/arc/references/contract-addresses (2026-10-23).
//
// USDC is Arc's native gas token and has two interfaces sharing one balance:
//   - native, 18 decimals (gas, msg.value, wallet-displayed balance)
//   - ERC-20 at 0x3600000000000000000000000000000000000000, 6 decimals (what this app
//     and the Splitline contract actually read/write via transferFrom/approve/balanceOf)
// Splitline never touches the native interface; see src/abi/splitline.ts.
export const arcMainnet = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
});

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Testnet Explorer", url: "https://explorer.testnet.arc.io" },
  },
  testnet: true,
});

// The RPC used for chunked getLogs scans (src/lib/events.ts). Measured directly against
// Arc mainnet (2026-10-23): dRPC's free tier rejects eth_getLogs ranges wider than ~150
// blocks regardless of how recent they are ("ranges over 10000 blocks are not supported
// on free plan" is misleading — 500 blocks already fails), which makes it impractical for
// scanning tens of thousands of blocks of history. Arc's own primary RPC comfortably
// handles 2000+ block ranges, so it's used here too; the load-balancer lag it can show
// (docs.arc.io: error -32014) is handled by the retry in getLogsChunked. Swap these for
// your own provider/API key if you need something with a real history-retention SLA.
export const ARC_MAINNET_EVENTS_RPC = "https://rpc.mainnet.arc.io";
export const ARC_TESTNET_EVENTS_RPC = "https://rpc.testnet.arc.io";
